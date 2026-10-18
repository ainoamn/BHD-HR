"use server";

import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { aiTranslateMany } from "@/lib/ai";
import { ALLOWANCE_BASES, ALLOWANCE_CALCS, ALLOWANCE_FREQUENCIES } from "@/lib/allowances";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { syncHrCatalogDefaults } from "@/lib/hr-catalog-sync";
import { DEFAULT_DEPARTMENTS, DEFAULT_JOB_TITLES } from "@/lib/hr-defaults";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { readCycle } from "@/lib/leave";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { clip, currentPeriod, intValue, num, req, str } from "@/lib/utils";

const PAGE = "/settings/hr";
type List = "jobs" | "departments" | "leave" | "allowances";

function back(list: List) {
  return `${PAGE}?tab=${list}`;
}

async function readNames(formData: FormData, list: List) {
  const { t } = await getI18n();
  const nameAr = clip(req(formData, "nameAr"), 120)?.replace(/\s+/g, " ").trim();
  if (!nameAr || nameAr.length < 2) go(back(list), { error: t("اكتب الاسم بالعربية", "Enter the Arabic name") });
  return { nameAr: nameAr!, nameEn: clip(str(formData, "nameEn"), 120)?.replace(/\s+/g, " ").trim() || null };
}

function readJobExtras(formData: FormData) {
  const raw = (clip(str(formData, "code"), 20) || "").replace(/\s+/g, "");
  const skill = str(formData, "skillClass") || "";
  const skillClass = ["1", "2", "3", "4", "5"].includes(skill) ? skill : null;
  return { code: /^\d{4,12}$/.test(raw) ? raw : null, skillClass };
}

function isDuplicate(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/* ---------- Job titles and departments ---------- */

export async function saveCatalogEntry(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const list: List = req(formData, "list") === "departments" ? "departments" : "jobs";
  const id = req(formData, "id");
  const names = await readNames(formData, list);
  const extras = list === "jobs" ? readJobExtras(formData) : null;
  const isJob = list === "jobs";
  const label = isJob ? t("المسمى الوظيفي", "Job title") : t("القسم", "Department");
  try {
    if (id) {
      const existing = isJob
        ? await prisma.jobTitle.findFirst({ where: { id, companyId: user.companyId } })
        : await prisma.department.findFirst({ where: { id, companyId: user.companyId } });
      if (!existing) go(back(list), { error: t("العنصر غير موجود", "Item not found") });
      await prisma.$transaction(
        isJob
          ? [
              prisma.jobTitle.update({ where: { id }, data: { ...names, ...extras! } }),
              prisma.employee.updateMany({
                where: { jobTitleId: id, companyId: user.companyId },
                data: { jobTitle: names.nameAr, jobTitleEn: names.nameEn, jobCode: extras!.code, jobClass: extras!.skillClass },
              }),
            ]
          : [
              prisma.department.update({ where: { id }, data: names }),
              prisma.employee.updateMany({ where: { departmentId: id, companyId: user.companyId }, data: { department: names.nameAr, departmentEn: names.nameEn } }),
            ],
      );
      await writeAudit({ userId: user.id, action: "CATALOG_UPDATE", message: t(`عدّل ${label}: ${existing!.nameAr} ← ${names.nameAr}`, `Updated ${label}: ${existing!.nameAr} → ${names.nameAr}`) });
    } else {
      if (isJob) await prisma.jobTitle.create({ data: { ...names, ...extras!, companyId: user.companyId } });
      else await prisma.department.create({ data: { ...names, companyId: user.companyId } });
      await writeAudit({ userId: user.id, action: "CATALOG_CREATE", message: t(`أضاف ${label}: ${names.nameAr}`, `Added ${label}: ${names.nameAr}`) });
    }
  } catch (error) {
    if (isDuplicate(error)) {
      go(back(list), {
        error: t(
          extras?.code ? `الاسم أو رمز المهنة «${extras.code}» موجود مسبقاً` : `«${names.nameAr}» موجود مسبقاً`,
          extras?.code ? `The name or occupation code "${extras.code}" already exists` : `"${names.nameAr}" already exists`,
        ),
      });
    }
    throw error;
  }
  refreshAll();
  go(back(list), { message: t("تم الحفظ", "Saved") });
}

export async function deleteCatalogEntry(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const list: List = req(formData, "list") === "departments" ? "departments" : "jobs";
  const id = req(formData, "id");
  const isJob = list === "jobs";
  const entry = isJob
    ? await prisma.jobTitle.findFirst({ where: { id, companyId: user.companyId }, include: { _count: { select: { employees: true } } } })
    : await prisma.department.findFirst({ where: { id, companyId: user.companyId }, include: { _count: { select: { employees: true } } } });
  if (!entry) go(back(list), { error: t("العنصر غير موجود", "Item not found") });
  if (entry!._count.employees > 0) {
    go(back(list), {
      error: t(
        `«${entry!.nameAr}» مستخدم لدى ${entry!._count.employees} موظف. غيّر وظيفتهم أو قسمهم أولاً.`,
        `"${entry!.nameAr}" is used by ${entry!._count.employees} employee(s). Change their job or department first.`,
      ),
    });
  }
  if (isJob) {
    const restricted = await prisma.leaveType.findMany({ where: { companyId: user.companyId, jobTitleIds: { has: id } } });
    await prisma.$transaction([
      ...restricted.map((type) => prisma.leaveType.update({ where: { id: type.id }, data: { jobTitleIds: type.jobTitleIds.filter((item) => item !== id) } })),
      prisma.jobTitle.delete({ where: { id } }),
    ]);
  } else {
    await prisma.department.delete({ where: { id } });
  }
  await writeAudit({ userId: user.id, action: "CATALOG_DELETE", message: t(`حذف «${entry!.nameAr}»`, `Deleted "${entry!.nameAr}"`) });
  refreshAll();
  go(back(list), { message: t("تم الحذف", "Deleted") });
}

/**
 * Jobs / departments: add missing built-in rows.
 * Leave / allowances / departments (sync): curated Oman-oriented cleanup — adds missing, fills English, tunes annual/sick.
 */
export async function importDefaults(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const raw = req(formData, "list");
  const list: List = raw === "departments" || raw === "leave" || raw === "allowances" ? raw : "jobs";

  if (list === "jobs") {
    const data = DEFAULT_JOB_TITLES.map(([nameAr, nameEn]) => ({ companyId: user.companyId, nameAr, nameEn }));
    const result = await prisma.jobTitle.createMany({ data, skipDuplicates: true });
    refreshAll();
    go(back(list), { message: t(`أُضيف ${result.count} عنصراً من القائمة الجاهزة`, `Added ${result.count} item(s) from the built-in list`) });
  }

  if (list === "departments" || list === "leave" || list === "allowances") {
    // Departments tab also runs the full sync so renames (e.g. المنزل → الخدمات المنزلية) apply.
    const result = await syncHrCatalogDefaults(user.companyId);
    await writeAudit({
      userId: user.id,
      action: "CATALOG_SYNC",
      message: t(
        `حدّث القوائم الجاهزة: أقسام +${result.departmentsAdded}/حدّث ${result.departmentsUpdated}، إجازات +${result.leaveAdded}/حدّث ${result.leaveUpdated}، علاوات +${result.allowancesAdded}`,
        `Synced built-in catalogs: departments +${result.departmentsAdded}/upd ${result.departmentsUpdated}, leave +${result.leaveAdded}/upd ${result.leaveUpdated}, allowances +${result.allowancesAdded}`,
      ),
    });
    refreshAll();
    const parts =
      list === "departments"
        ? t(
            `الأقسام: أُضيف ${result.departmentsAdded} وحُدّث ${result.departmentsUpdated}`,
            `Departments: added ${result.departmentsAdded}, updated ${result.departmentsUpdated}`,
          )
        : list === "leave"
          ? t(
              `الإجازات: أُضيف ${result.leaveAdded} وحُدّث ${result.leaveUpdated}`,
              `Leave types: added ${result.leaveAdded}, updated ${result.leaveUpdated}`,
            )
          : t(`العلاوات: أُضيف ${result.allowancesAdded}`, `Allowances: added ${result.allowancesAdded}`);
    go(back(list), {
      message: t(
        `${parts}. (تُحدَّث الأقسام والإجازات والعلاوات معاً من القائمة الجاهزة.)`,
        `${parts}. (Departments, leave types and allowances are refreshed together from the built-in list.)`,
      ),
    });
  }

  go(back("jobs"), { error: t("قائمة غير معروفة", "Unknown list") });
}

/** Fills empty English names with AI, in batches. */
export async function translateMissing(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const raw = req(formData, "list");
  const list: List = raw === "departments" || raw === "leave" || raw === "allowances" ? raw : "jobs";
  const where = { companyId: user.companyId, OR: [{ nameEn: null }, { nameEn: "" }] };
  const rows =
    list === "jobs"
      ? await prisma.jobTitle.findMany({ where, select: { id: true, nameAr: true } })
      : list === "departments"
        ? await prisma.department.findMany({ where, select: { id: true, nameAr: true } })
        : list === "leave"
          ? await prisma.leaveType.findMany({ where, select: { id: true, nameAr: true } })
          : await prisma.allowanceType.findMany({ where, select: { id: true, nameAr: true } });
  if (!rows.length) go(back(list), { message: t("كل الأسماء لها ترجمة إنجليزية", "Every name already has an English translation") });
  let done = 0;
  try {
    for (let index = 0; index < rows.length; index += 40) {
      const chunk = rows.slice(index, index + 40);
      const translated = await aiTranslateMany(
        chunk.map((row) => row.nameAr),
        "en",
      );
      for (const [position, row] of chunk.entries()) {
        const nameEn = translated[position];
        if (!nameEn) continue;
        if (list === "jobs") {
          await prisma.jobTitle.update({ where: { id: row.id }, data: { nameEn } });
          await prisma.employee.updateMany({ where: { jobTitleId: row.id }, data: { jobTitleEn: nameEn } });
        } else if (list === "departments") {
          await prisma.department.update({ where: { id: row.id }, data: { nameEn } });
          await prisma.employee.updateMany({ where: { departmentId: row.id }, data: { departmentEn: nameEn } });
        } else if (list === "leave") await prisma.leaveType.update({ where: { id: row.id }, data: { nameEn } });
        else await prisma.allowanceType.update({ where: { id: row.id }, data: { nameEn } });
        done += 1;
      }
    }
  } catch (error) {
    console.error("AI bulk translate failed", error);
    refreshAll();
    go(back(list), { error: t(`تُرجم ${done} فقط ثم تعذرت الترجمة الآلية. حاول لاحقاً.`, `Translated ${done}, then AI translation failed. Try again later.`) });
  }
  await writeAudit({ userId: user.id, action: "CATALOG_TRANSLATE", message: t(`ترجم ${done} اسماً بالذكاء الاصطناعي`, `AI-translated ${done} name(s)`) });
  refreshAll();
  go(back(list), { message: t(`تمت ترجمة ${done} من ${rows.length} بالذكاء الاصطناعي. راجعها وعدّل ما يلزم.`, `AI translated ${done} of ${rows.length}. Review and edit as needed.`) });
}

/* ---------- Leave types ---------- */

export async function saveLeaveType(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const id = req(formData, "id");
  const names = await readNames(formData, "leave");
  const days = num(formData, "days");
  if (days < 0 || days > 366) go(back("leave"), { error: t("عدد الأيام بين 0 و 366", "Days must be between 0 and 366") });
  const allJobs = req(formData, "scope") !== "selected";
  const validJobs = new Set((await prisma.jobTitle.findMany({ where: { companyId: user.companyId }, select: { id: true } })).map((job) => job.id));
  const jobTitleIds = allJobs ? [] : [...new Set(formData.getAll("jobTitleIds").map(String))].filter((value) => validJobs.has(value));
  if (!allJobs && jobTitleIds.length === 0) go(back("leave"), { error: t("اختر مسمى وظيفياً واحداً على الأقل أو اجعلها لكل الوظائف", "Pick at least one job title or make it for all jobs") });
  const cycle = readCycle(req(formData, "cycle"));
  const capText = req(formData, "carryCap");
  const carryCap = cycle === "ONCE" || capText === "" ? null : Math.min(Math.max(Math.round(num(formData, "carryCap") * 2) / 2, 0), 366);
  const data = { ...names, days: Math.round(days * 2) / 2, allJobs, jobTitleIds, cycle, carryCap };
  if (id) {
    const existing = await prisma.leaveType.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) go(back("leave"), { error: t("نوع الإجازة غير موجود", "Leave type not found") });
    await prisma.leaveType.update({ where: { id }, data });
    await writeAudit({ userId: user.id, action: "LEAVE_TYPE_UPDATE", message: t(`عدّل نوع الإجازة ${names.nameAr} (${data.days} يوم)`, `Updated leave type ${names.nameAr} (${data.days} days)`) });
  } else {
    const count = await prisma.leaveType.count({ where: { companyId: user.companyId } });
    await prisma.leaveType.create({ data: { ...data, companyId: user.companyId, key: `t${randomBytes(5).toString("hex")}`, sortOrder: count } });
    await writeAudit({ userId: user.id, action: "LEAVE_TYPE_CREATE", message: t(`أضاف نوع الإجازة ${names.nameAr} (${data.days} يوم)`, `Added leave type ${names.nameAr} (${data.days} days)`) });
  }
  refreshAll();
  go(back("leave"), { message: t("تم حفظ نوع الإجازة", "Leave type saved") });
}

export async function deleteLeaveType(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const type = await prisma.leaveType.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!type) go(back("leave"), { error: t("نوع الإجازة غير موجود", "Leave type not found") });
  const legacyType = { annual: "LEAVE", sick: "SICK", compensatory: "COMPENSATORY", other: "OTHER_LEAVE" }[type!.key];
  const [used, credits] = await Promise.all([
    prisma.attendance.count({
      where: {
        employee: { companyId: user.companyId },
        OR: [{ balanceKey: type!.key }, ...(legacyType ? [{ balanceKey: null, type: legacyType }] : [])],
      },
    }),
    prisma.leaveCredit.count({ where: { balanceKey: type!.key, employee: { companyId: user.companyId } } }),
  ]);
  if (used + credits > 0) {
    go(back("leave"), {
      error: t(
        `لا يمكن حذف «${type!.nameAr}» لأن له ${used} يوم مسجّل و${credits} إضافة رصيد. احذف تلك السجلات أولاً أو غيّر اسمه.`,
        `"${type!.nameAr}" has ${used} recorded day(s) and ${credits} balance credit(s). Delete those first or rename it.`,
      ),
    });
  }
  await prisma.leaveType.delete({ where: { id: type!.id } });
  await writeAudit({ userId: user.id, action: "LEAVE_TYPE_DELETE", message: t(`حذف نوع الإجازة ${type!.nameAr}`, `Deleted leave type ${type!.nameAr}`) });
  refreshAll();
  go(back("leave"), { message: t("تم حذف نوع الإجازة", "Leave type deleted") });
}

/* ---------- Allowance types ---------- */

function readAllowanceRule(formData: FormData) {
  const calc = req(formData, "calc");
  const base = req(formData, "base");
  const frequency = req(formData, "frequency");
  const value = Math.max(0, num(formData, "value"));
  return {
    calc: (ALLOWANCE_CALCS as readonly string[]).includes(calc) ? calc : "FIXED",
    base: (ALLOWANCE_BASES as readonly string[]).includes(base) ? base : "BASIC",
    value: calc === "PERCENT" ? Math.min(value, 1000) : value,
    frequency: (ALLOWANCE_FREQUENCIES as readonly string[]).includes(frequency) ? frequency : "MONTHLY",
    payMonth: Math.min(12, Math.max(1, intValue(formData, "payMonth") || 1)),
  };
}

async function resyncEmployees(employeeIds: string[], salaryDays: number) {
  for (const employeeId of new Set(employeeIds)) {
    await prisma.$transaction((tx) => syncEmployeeSalaries(tx, employeeId, salaryDays), { maxWait: 10000, timeout: 30000 });
  }
}

export async function saveAllowanceType(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const id = req(formData, "id");
  const names = await readNames(formData, "allowances");
  const rule = readAllowanceRule(formData);
  let typeId = id;
  if (id) {
    const existing = await prisma.allowanceType.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) go(back("allowances"), { error: t("العلاوة غير موجودة", "Allowance not found") });
    await prisma.allowanceType.update({ where: { id }, data: { ...names, ...rule } });
    if (req(formData, "applyToEmployees") === "1") await prisma.employeeAllowance.updateMany({ where: { allowanceTypeId: id }, data: rule });
  } else {
    typeId = (await prisma.allowanceType.create({ data: { ...names, ...rule, companyId: user.companyId } })).id;
  }
  let added = 0;
  if (req(formData, "addToAll") === "1") {
    const now = currentPeriod();
    const employees = await prisma.employee.findMany({
      where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, allowances: { none: { allowanceTypeId: typeId } } },
      select: { id: true },
    });
    if (employees.length) {
      await prisma.employeeAllowance.createMany({
        data: employees.map((employee) => ({ ...rule, companyId: user.companyId, employeeId: employee.id, allowanceTypeId: typeId, startYear: now.year, startMonth: now.month })),
      });
      added = employees.length;
    }
  }
  const affected = await prisma.employeeAllowance.findMany({ where: { allowanceTypeId: typeId }, select: { employeeId: true } });
  await resyncEmployees(
    affected.map((row) => row.employeeId),
    user.company.salaryDays,
  );
  await writeAudit({
    userId: user.id,
    action: id ? "ALLOWANCE_TYPE_UPDATE" : "ALLOWANCE_TYPE_CREATE",
    message: t(
      `${id ? "عدّل" : "أضاف"} العلاوة ${names.nameAr}${added ? ` وأضافها إلى ${added} موظف` : ""}`,
      `${id ? "Updated" : "Added"} allowance ${names.nameAr}${added ? ` and gave it to ${added} employee(s)` : ""}`,
    ),
  });
  refreshAll();
  go(back("allowances"), { message: added ? t(`تم الحفظ وأُضيفت إلى ${added} موظف`, `Saved and added to ${added} employee(s)`) : t("تم حفظ العلاوة", "Allowance saved") });
}

export async function deleteAllowanceType(formData: FormData) {
  const user = await requireAdmin(PAGE);
  const { t } = await getI18n();
  const type = await prisma.allowanceType.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId }, include: { allowances: { select: { employeeId: true } } } });
  if (!type) go(back("allowances"), { error: t("العلاوة غير موجودة", "Allowance not found") });
  await prisma.$transaction([prisma.employeeAllowance.deleteMany({ where: { allowanceTypeId: type!.id } }), prisma.allowanceType.delete({ where: { id: type!.id } })]);
  await resyncEmployees(
    type!.allowances.map((row) => row.employeeId),
    user.company.salaryDays,
  );
  await writeAudit({
    userId: user.id,
    action: "ALLOWANCE_TYPE_DELETE",
    message: t(`حذف العلاوة ${type!.nameAr} وأزالها من ${type!.allowances.length} موظف`, `Deleted allowance ${type!.nameAr} and removed it from ${type!.allowances.length} employee(s)`),
  });
  refreshAll();
  go(back("allowances"), { message: t("تم حذف العلاوة", "Allowance deleted") });
}
