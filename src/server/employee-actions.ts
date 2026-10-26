"use server";

import { Prisma } from "@prisma/client";
import { ensureTeamManager, openAndSend, sendSummary } from "@/lib/accounts";
import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND, NEW_EMPLOYER, STATUS_LABEL } from "@/lib/constants";
import { readIds } from "@/lib/employee-filter";
import { openMissingEmployeeAccounts } from "@/server/account-actions";
import { readAllowanceRows, readEmployeeInput, readLeaveDays } from "@/lib/employee-input";
import { employeeNumberScope, nextEmployeeNumber } from "@/lib/employee-number";
import { getHrCatalog } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { packageGross } from "@/lib/salary";
import { keptSelfMarks, readSelfMarks } from "@/lib/self-data";
import { fitsLimit, limitMessage } from "@/lib/subscription";
import { newBadgeToken } from "@/lib/badge";
import { mimeFor, removeDocumentFileIfUnused, removeUpload, saveUpload } from "@/lib/uploads";
import { normalizePhone } from "@/lib/phone";
import { clip, money, req, safeReturn, str } from "@/lib/utils";

type Catalog = Awaited<ReturnType<typeof getHrCatalog>>;

function jobFields(formData: FormData, catalog: Catalog) {
  const find = <T extends { id: string }>(list: T[], id: string) => (id ? list.find((item) => item.id === id) || null : null);
  const job = find(catalog.jobTitles, req(formData, "jobTitleId"));
  const department = find(catalog.departments, req(formData, "departmentId"));
  return {
    jobTitleId: job?.id ?? null,
    jobTitle: job?.nameAr ?? null,
    jobTitleEn: job?.nameEn ?? null,
    jobCode: job?.code ?? null,
    jobClass: job?.skillClass ?? null,
    departmentId: department?.id ?? null,
    department: department?.nameAr ?? null,
    departmentEn: department?.nameEn ?? null,
  };
}

const DOC_FILES = [
  { input: "idFile", field: "idFileUrl", image: false },
  { input: "passportFile", field: "passportFileUrl", image: false },
  { input: "residenceFile", field: "residenceFileUrl", image: false },
  { input: "photo", field: "photoUrl", image: true },
] as const;
type DocFileField = (typeof DOC_FILES)[number]["field"];

/** Saves new ID / passport / residence copies and the photo; returns the new URLs and the replaced or removed ones to delete after saving. */
async function readDocFiles(formData: FormData, current: Partial<Record<DocFileField, string | null>>, companyId: string, errorPath: string) {
  const { lang, t } = await getI18n();
  const data = {} as Record<DocFileField, string | null>;
  const replaced: string[] = [];
  const uploaded: string[] = [];
  for (const { input, field, image } of DOC_FILES) {
    const old = current[field] ?? null;
    let next = req(formData, `${input}Remove`) === "1" ? null : old;
    const file = formData.get(input);
    if (file instanceof File && file.size > 0) {
      if (image && !mimeFor(file.name).startsWith("image/")) {
        for (const url of uploaded) await removeUpload(url);
        go(errorPath, { error: t("الصورة الشخصية يجب أن تكون JPG أو PNG أو WebP", "The photo must be JPG, PNG or WebP") });
      }
      try {
        next = await saveUpload(file, companyId, lang);
        if (next) uploaded.push(next);
      } catch (error) {
        for (const url of uploaded) await removeUpload(url);
        go(errorPath, { error: error instanceof Error ? error.message : t("تعذر رفع المرفق", "Could not upload the file") });
      }
    }
    data[field] = next;
    if (old && old !== next) replaced.push(old);
  }
  return { data, replaced };
}

async function saveAllowances(tx: Prisma.TransactionClient, employeeId: string, companyId: string, rows: ReturnType<typeof readAllowanceRows>) {
  const existing = await tx.employeeAllowance.findMany({ where: { employeeId }, select: { id: true } });
  const keep = new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id && existing.some((item) => item.id === id))));
  await tx.employeeAllowance.deleteMany({ where: { employeeId, id: { notIn: [...keep] } } });
  for (const { id, ...data } of rows) {
    if (id && keep.has(id)) await tx.employeeAllowance.update({ where: { id }, data });
    else await tx.employeeAllowance.create({ data: { ...data, employeeId, companyId } });
  }
}

async function resolveEmployer(formData: FormData, user: { id: string; companyId: string; permissions: readonly string[]; company: { name: string } }, errorPath: string) {
  const { t } = await getI18n();
  const companyId = user.companyId;
  const value = req(formData, "employerId");
  if (!value) return null;
  if (value === NEW_EMPLOYER) {
    if (!can(user, "employers.create")) go(errorPath, { error: t("ليست لديك صلاحية إضافة كفيل جديد", "You cannot add a new sponsor") });
    const name = clip(str(formData, "newEmployerName"), 150);
    if (!name || name.length < 2) go(errorPath, { error: t("اكتب اسم الكفيل الجديد", "Enter the new sponsor's name") });
    const kind = req(formData, "newEmployerKind");
    const employer = await prisma.employer.create({
      data: {
        companyId,
        name: name!,
        nameEn: clip(str(formData, "newEmployerNameEn"), 150),
        kind: EMPLOYER_KIND[kind] ? kind : "COMPANY",
        idNumber: clip(str(formData, "newEmployerIdNumber"), 40),
        phone: clip(normalizePhone(str(formData, "newEmployerPhone")), 30),
      },
    });
    await openAndSend({
      companyId,
      role: "EMPLOYER",
      person: { name: employer.name, email: null, phone: employer.phone },
      employerId: employer.id,
      actorId: user.id,
      companyName: user.company.name,
      origin: await requestOrigin(),
      label: "صاحب عمل",
    });
    return employer.id;
  }
  const employer = await prisma.employer.findFirst({ where: { id: value, companyId } });
  if (!employer) go(errorPath, { error: t("الكفيل غير موجود", "Sponsor not found") });
  return employer!.id;
}

/** The chosen work schedule; undefined keeps the saved one when the form had no schedule field. */
async function resolveSchedule(formData: FormData, companyId: string) {
  if (!formData.has("scheduleId")) return undefined;
  const value = req(formData, "scheduleId");
  if (!value) return null;
  const schedule = await prisma.workSchedule.findFirst({ where: { id: value, companyId }, select: { id: true } });
  return schedule?.id ?? null;
}

/** The chosen direct manager, refusing the employee itself and any chain that would loop back to it. */
async function resolveManager(formData: FormData, companyId: string, selfId: string | null, errorPath: string) {
  const { t } = await getI18n();
  const value = req(formData, "managerId");
  if (!value) return null;
  if (value === selfId) go(errorPath, { error: t("لا يكون الموظف مديراً لنفسه", "An employee cannot be their own manager") });
  const manager = await prisma.employee.findFirst({ where: { id: value, companyId }, select: { id: true, managerId: true } });
  if (!manager) go(errorPath, { error: t("المدير غير موجود", "Manager not found") });
  let cursor = manager!.managerId;
  for (let step = 0; cursor && selfId && step < 100; step += 1) {
    if (cursor === selfId) go(errorPath, { error: t("هذا الاختيار يجعل الموظف مديراً لمديره", "This choice would make the employee manage their own manager") });
    cursor = (await prisma.employee.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null;
  }
  return manager!.id;
}

export async function createEmployee(formData: FormData) {
  const user = await requirePermission("employees.create", "/employees");
  const { t } = await getI18n();
  const catalog = await getHrCatalog(user.companyId);
  const input = readEmployeeInput(formData);
  const salaryAccess = can(user, "salaries.edit");
  if (!salaryAccess) Object.assign(input, { basicSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0, bankBic: null, bankAccount: null });
  if (input.fullName.length < 2) go("/employees/new", { error: t("الاسم الكامل مطلوب", "Full name is required") });
  if (input.status !== "TERMINATED") {
    const room = await fitsLimit(user.companyId, "employees");
    if (!room.ok) go("/employees/new", { error: limitMessage("employees", room, t) });
  }
  const allowances = salaryAccess ? readAllowanceRows(formData, new Set(catalog.allowanceTypes.map((type) => type.id))) : [];
  const employerId = await resolveEmployer(formData, user, "/employees/new");
  const managerId = await resolveManager(formData, user.companyId, null, "/employees/new");
  const scheduleId = await resolveSchedule(formData, user.companyId);
  const files = await readDocFiles(formData, {}, user.companyId, "/employees/new");
  const numberScope = employeeNumberScope(employerId);
  const employeeNumber = await nextEmployeeNumber(user.companyId, employerId);
  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        ...input,
        ...jobFields(formData, catalog),
        ...files.data,
        leaveDays: readLeaveDays(formData, catalog.leaveTypes),
        employerId,
        numberScope,
        managerId,
        scheduleId,
        terminatedAt: input.status === "TERMINATED" ? new Date() : null,
        employeeNumber,
        badgeToken: newBadgeToken(),
        companyId: user.companyId,
      },
    });
    if (allowances.length) await saveAllowances(tx, created.id, user.companyId, allowances);
    return created;
  });
  await writeAudit({
    userId: user.id,
    employeeId: employee.id,
    action: "EMPLOYEE_CREATE",
    message: t(`أضاف الموظف ${employee.fullName} برقم ${employee.employeeNumber}`, `Added employee ${employee.fullName} (${employee.employeeNumber})`),
  });
  const origin = await requestOrigin();
  const choice = req(formData, "accountRole") || "EMPLOYEE";
  let accountNote = "";
  if (choice !== "NONE" && employee.status !== "TERMINATED") {
    const role = choice === "TEAM_MANAGER" ? "TEAM_MANAGER" : "EMPLOYEE";
    const { sent } = await openAndSend({
      companyId: user.companyId,
      role,
      person: { name: employee.fullName, email: employee.email, phone: employee.phone },
      employeeId: employee.id,
      actorId: user.id,
      companyName: user.company.name,
      origin,
      label: role === "TEAM_MANAGER" ? "مدير فريق" : "موظف",
    });
    accountNote = t(" وفُتح له حساب دخول", " with a sign-in account") + sendSummary(sent, t);
  }
  if (managerId) await ensureTeamManager({ companyId: user.companyId, employeeId: managerId, actorId: user.id, companyName: user.company.name, origin });
  refreshAll();
  go(`/employees/${employee.id}`, { message: t("تمت إضافة الموظف", "Employee added") + accountNote });
}

export async function updateEmployee(formData: FormData) {
  const user = await requirePermission("employees.edit", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  const catalog = await getHrCatalog(user.companyId);
  const input = readEmployeeInput(formData);
  const salaryAccess = can(user, "salaries.edit") && req(formData, "allowancesPresent") === "1";
  if (!salaryAccess) {
    input.basicSalary = existing!.basicSalary;
    input.housingAllowance = existing!.housingAllowance;
    input.transportAllowance = existing!.transportAllowance;
    input.otherAllowance = existing!.otherAllowance;
    input.bankBic = existing!.bankBic;
    input.bankAccount = existing!.bankAccount;
  }
  const errorPath = `/employees/${id}/edit`;
  if (input.fullName.length < 2) go(errorPath, { error: t("الاسم الكامل مطلوب", "Full name is required") });
  if (existing!.status === "TERMINATED" && input.status !== "TERMINATED") {
    const room = await fitsLimit(user.companyId, "employees");
    if (!room.ok) go(errorPath, { error: limitMessage("employees", room, t) });
  }
  const allowances = salaryAccess ? readAllowanceRows(formData, new Set(catalog.allowanceTypes.map((type) => type.id))) : null;
  const employerId = await resolveEmployer(formData, user, errorPath);
  const managerId = await resolveManager(formData, user.companyId, id, errorPath);
  const scheduleId = await resolveSchedule(formData, user.companyId);
  const files = await readDocFiles(formData, existing!, user.companyId, errorPath);
  const marks = keptSelfMarks(readSelfMarks(existing!.selfProvided), existing!, input);
  await prisma.$transaction(
    async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...input,
          selfProvided: Object.keys(marks).length ? marks : Prisma.DbNull,
          ...jobFields(formData, catalog),
          ...files.data,
          leaveDays: readLeaveDays(formData, catalog.leaveTypes),
          employerId,
          managerId,
          scheduleId,
          terminatedAt: input.status === "TERMINATED" ? (existing!.terminatedAt ?? new Date()) : null,
        },
      });
      if (allowances) await saveAllowances(tx, id, user.companyId, allowances);
      if (allowances || input.nationality !== existing!.nationality) await syncEmployeeSalaries(tx, id, user.company.salaryDays);
    },
    { maxWait: 10000, timeout: 30000 },
  );
  for (const url of files.replaced) await removeUpload(url);
  const before = packageGross(existing!);
  const after = packageGross(input);
  const currency = user.company.currency;
  const message =
    before !== after
      ? t(
          `عدّل بيانات ${existing!.fullName} والراتب من ${money(before, currency)} إلى ${money(after, currency)}`,
          `Updated ${existing!.fullName}; salary ${money(before, currency)} → ${money(after, currency)}`,
        )
      : t(`عدّل بيانات الموظف ${input.fullName}`, `Updated employee ${input.fullName}`);
  await writeAudit({ userId: user.id, employeeId: id, action: "EMPLOYEE_UPDATE", message });
  if (managerId && managerId !== existing!.managerId) {
    await ensureTeamManager({ companyId: user.companyId, employeeId: managerId, actorId: user.id, companyName: user.company.name, origin: await requestOrigin() });
  }
  if (input.status === "TERMINATED" && existing!.status !== "TERMINATED") {
    const closed = await prisma.membership.deleteMany({ where: { employeeId: id, role: { in: ["EMPLOYEE", "TEAM_MANAGER"] } } });
    if (closed.count) await writeAudit({ userId: user.id, employeeId: id, action: "ACCOUNT_CLOSE", message: `أُوقف حساب دخول ${input.fullName} لانتهاء خدمته` });
  }
  refreshAll();
  go(`/employees/${id}`, { message: t("تم حفظ البيانات", "Saved") });
}

/** Retires the QR code on the employee's current card (lost or stolen); the old code then opens "not valid". */
export async function renewBadgeToken(formData: FormData) {
  const user = await requirePermission("employees.edit", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, fullName: true } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  await prisma.employee.update({ where: { id }, data: { badgeToken: newBadgeToken() } });
  await writeAudit({ userId: user.id, employeeId: id, action: "BADGE_RENEW", message: t(`أصدر رمز بطاقة جديداً للموظف ${employee!.fullName}`, `Issued a new ID card code for ${employee!.fullName}`) });
  refreshAll();
  go(`/employees/${id}#badge`, { message: t("صدر رمز جديد. اطبع البطاقة من جديد؛ البطاقة القديمة لم تعد صالحة.", "New code issued. Print the card again; the old card no longer works.") });
}

/** Paid salaries are financial records, so an employee who has any is ended (status) instead of deleted. */
export async function deleteEmployee(formData: FormData) {
  const user = await requirePermission("employees.delete", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { documents: { select: { fileUrl: true } }, _count: { select: { salaries: { where: { paid: true } } } } },
  });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  if (employee!._count.salaries > 0) {
    go(`/employees/${id}`, {
      error: t(
        `لا يمكن حذف ${employee!.fullName} لأن له ${employee!._count.salaries} راتب مصروف. غيّر حالته إلى «منتهي الخدمة» بدلاً من الحذف.`,
        `${employee!.fullName} has ${employee!._count.salaries} paid salary record(s) and cannot be deleted. Set the status to Terminated instead.`,
      ),
    });
  }
  await prisma.$transaction([
    prisma.auditLog.updateMany({ where: { employeeId: id, companyId: user.companyId }, data: { employeeId: null } }),
    prisma.employee.delete({ where: { id } }),
  ]);
  for (const document of employee!.documents) await removeDocumentFileIfUnused(document.fileUrl);
  for (const url of [employee!.idFileUrl, employee!.passportFileUrl, employee!.residenceFileUrl, employee!.photoUrl]) await removeUpload(url);
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_DELETE",
    message: t(`حذف الموظف ${employee!.fullName} (${employee!.employeeNumber})`, `Deleted employee ${employee!.fullName} (${employee!.employeeNumber})`),
  });
  refreshAll();
  go("/employees", { message: t("تم حذف الموظف", "Employee deleted") });
}

const BULK_OPS = ["stickers", "status", "employer", "schedule", "accounts"] as const;

/** One change for every employee ticked in the list: print stickers, set status, sponsor or schedule, or open accounts. */
export async function bulkEmployees(formData: FormData) {
  const user = await requirePermission("employees.view", "/employees");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/employees");
  const ids = readIds(formData.getAll("ids").map(String).join(","));
  const op = req(formData, "op") as (typeof BULK_OPS)[number];
  if (!ids.length) go(back, { error: t("حدّد موظفاً واحداً على الأقل", "Tick at least one employee") });
  if (!BULK_OPS.includes(op)) go(back, { error: t("اختر الإجراء", "Choose an action") });
  if (op === "stickers") go(`/employees/passport-stickers?ids=${ids.join(",")}`);
  if (!can(user, "employees.edit")) go(back, { error: t("ليست لديك صلاحية تعديل الموظفين", "You cannot edit employees") });
  if (op === "accounts") return openMissingEmployeeAccounts(formData);

  const employees = await prisma.employee.findMany({ where: { companyId: user.companyId, id: { in: ids } }, select: { id: true, fullName: true, status: true, employerId: true, scheduleId: true } });
  if (!employees.length) go(back, { error: t("الموظفون غير موجودين", "Employees not found") });
  let label = "";
  if (op === "status") {
    const status = req(formData, "status");
    if (!STATUS_LABEL[status]) go(back, { error: t("اختر الحالة", "Choose the status") });
    const ending = employees.filter((employee) => status === "TERMINATED" && employee.status !== "TERMINATED").map((employee) => employee.id);
    const returning = employees.filter((employee) => status !== "TERMINATED" && employee.status === "TERMINATED").map((employee) => employee.id);
    const room = await fitsLimit(user.companyId, "employees", returning.length);
    if (!room.ok) go(back, { error: limitMessage("employees", room, t) });
    await prisma.$transaction([
      prisma.employee.updateMany({ where: { companyId: user.companyId, id: { in: employees.map((employee) => employee.id) } }, data: { status } }),
      prisma.employee.updateMany({ where: { id: { in: ending } }, data: { terminatedAt: new Date() } }),
      prisma.employee.updateMany({ where: { id: { in: returning } }, data: { terminatedAt: null } }),
      prisma.membership.deleteMany({ where: { employeeId: { in: ending }, role: { in: ["EMPLOYEE", "TEAM_MANAGER"] } } }),
    ]);
    label = STATUS_LABEL[status].ar;
  } else if (op === "employer") {
    const value = req(formData, "employerId");
    const employer = value ? await prisma.employer.findFirst({ where: { id: value, companyId: user.companyId }, select: { id: true, name: true } }) : null;
    if (value && !employer) go(back, { error: t("الكفيل غير موجود", "Sponsor not found") });
    await prisma.employee.updateMany({ where: { companyId: user.companyId, id: { in: employees.map((employee) => employee.id) } }, data: { employerId: employer?.id ?? null } });
    label = employer ? `الكفيل ${employer.name}` : "بدون كفيل";
  } else {
    const value = req(formData, "scheduleId");
    const schedule = value ? await prisma.workSchedule.findFirst({ where: { id: value, companyId: user.companyId }, select: { id: true, name: true } }) : null;
    if (value && !schedule) go(back, { error: t("الجدول غير موجود", "Schedule not found") });
    await prisma.employee.updateMany({ where: { companyId: user.companyId, id: { in: employees.map((employee) => employee.id) } }, data: { scheduleId: schedule?.id ?? null } });
    label = schedule ? `جدول الدوام ${schedule.name}` : "الجدول الافتراضي";
  }
  for (const employee of employees) {
    await writeAudit({ userId: user.id, employeeId: employee.id, action: "EMPLOYEE_BULK", message: `تعديل جماعي: ${employee.fullName} ← ${label}` });
  }
  refreshAll();
  go(back, { message: t(`عُدّل ${employees.length} موظف: ${label}`, `Updated ${employees.length} employee(s)`) });
}