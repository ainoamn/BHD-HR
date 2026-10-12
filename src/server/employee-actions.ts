"use server";

import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND, NEW_EMPLOYER } from "@/lib/constants";
import { readAllowanceRows, readEmployeeInput, readLeaveDays } from "@/lib/employee-input";
import { getHrCatalog } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { normalizePhone } from "@/lib/phone";
import { clip, money, req, str } from "@/lib/utils";

type Catalog = Awaited<ReturnType<typeof getHrCatalog>>;

function jobFields(formData: FormData, catalog: Catalog) {
  const find = <T extends { id: string }>(list: T[], id: string) => (id ? list.find((item) => item.id === id) || null : null);
  const job = find(catalog.jobTitles, req(formData, "jobTitleId"));
  const department = find(catalog.departments, req(formData, "departmentId"));
  return {
    jobTitleId: job?.id ?? null,
    jobTitle: job?.nameAr ?? null,
    jobTitleEn: job?.nameEn ?? null,
    departmentId: department?.id ?? null,
    department: department?.nameAr ?? null,
    departmentEn: department?.nameEn ?? null,
  };
}

const DOC_FILES = ["id", "passport", "residence"] as const;
type DocFileField = `${(typeof DOC_FILES)[number]}FileUrl`;

/** Saves new ID / passport / residence copies; returns the new URLs and the replaced or removed ones to delete after saving. */
async function readDocFiles(formData: FormData, current: Partial<Record<DocFileField, string | null>>, companyId: string, errorPath: string) {
  const { lang, t } = await getI18n();
  const data = {} as Record<DocFileField, string | null>;
  const replaced: string[] = [];
  const uploaded: string[] = [];
  for (const doc of DOC_FILES) {
    const field: DocFileField = `${doc}FileUrl`;
    const old = current[field] ?? null;
    let next = req(formData, `${doc}FileRemove`) === "1" ? null : old;
    const file = formData.get(`${doc}File`);
    if (file instanceof File && file.size > 0) {
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

async function nextEmployeeNumber(companyId: string) {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { employeeNumber: true } });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.employeeNumber.replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

async function resolveEmployer(formData: FormData, user: { companyId: string; permissions: readonly string[] }, errorPath: string) {
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
    return employer.id;
  }
  const employer = await prisma.employer.findFirst({ where: { id: value, companyId } });
  if (!employer) go(errorPath, { error: t("الكفيل غير موجود", "Sponsor not found") });
  return employer!.id;
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
  const allowances = salaryAccess ? readAllowanceRows(formData, new Set(catalog.allowanceTypes.map((type) => type.id))) : [];
  const employerId = await resolveEmployer(formData, user, "/employees/new");
  const managerId = await resolveManager(formData, user.companyId, null, "/employees/new");
  const files = await readDocFiles(formData, {}, user.companyId, "/employees/new");
  const employeeNumber = await nextEmployeeNumber(user.companyId);
  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        ...input,
        ...jobFields(formData, catalog),
        ...files.data,
        leaveDays: readLeaveDays(formData, catalog.leaveTypes),
        employerId,
        managerId,
        employeeNumber,
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
  refreshAll();
  go(`/employees/${employee.id}`, { message: t("تمت إضافة الموظف", "Employee added") });
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
  const allowances = salaryAccess ? readAllowanceRows(formData, new Set(catalog.allowanceTypes.map((type) => type.id))) : null;
  const employerId = await resolveEmployer(formData, user, errorPath);
  const managerId = await resolveManager(formData, user.companyId, id, errorPath);
  const files = await readDocFiles(formData, existing!, user.companyId, errorPath);
  await prisma.$transaction(
    async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { ...input, ...jobFields(formData, catalog), ...files.data, leaveDays: readLeaveDays(formData, catalog.leaveTypes), employerId, managerId },
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
  refreshAll();
  go(`/employees/${id}`, { message: t("تم حفظ البيانات", "Saved") });
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
  for (const document of employee!.documents) await removeUpload(document.fileUrl);
  for (const url of [employee!.idFileUrl, employee!.passportFileUrl, employee!.residenceFileUrl]) await removeUpload(url);
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_DELETE",
    message: t(`حذف الموظف ${employee!.fullName} (${employee!.employeeNumber})`, `Deleted employee ${employee!.fullName} (${employee!.employeeNumber})`),
  });
  refreshAll();
  go("/employees", { message: t("تم حذف الموظف", "Employee deleted") });
}
