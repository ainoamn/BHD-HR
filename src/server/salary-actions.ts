"use server";

import type { Employee, Employer } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { PAYMENT_LABEL, monthName } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { buildSalaryAmounts } from "@/lib/salary";
import { clip, intValue, money, num, parseDateInput, req, round3, str, todayInputValue } from "@/lib/utils";

function periodFrom(formData: FormData) {
  const year = intValue(formData, "year");
  const month = intValue(formData, "month");
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

function salariesPath(year: number, month: number, employerId?: string) {
  return `/salaries?year=${year}&month=${month}${employerId ? `&employerId=${employerId}` : ""}`;
}

async function maxReceiptNumber(companyId: string, year: number, month: number) {
  const prefix = `PAY-${year}-${String(month).padStart(2, "0")}-`;
  const existing = await prisma.salary.findMany({
    where: { companyId, receiptNo: { startsWith: prefix } },
    select: { receiptNo: true },
  });
  const max = existing.reduce((highest, row) => {
    const value = Number(row.receiptNo?.slice(prefix.length) || 0);
    return Math.max(highest, Number.isFinite(value) ? value : 0);
  }, 0);
  return { prefix, max };
}

function receiptNo(prefix: string, value: number) {
  return `${prefix}${String(value).padStart(5, "0")}`;
}

function snapshot(employee: Employee & { employer: Employer | null }) {
  return {
    employerId: employee.employerId,
    employerName: employee.employer?.name || null,
    employerNameEn: employee.employer?.nameEn || null,
    employeeName: employee.fullName,
    employeeNameEn: employee.nameEn,
    employeeNumber: employee.employeeNumber,
    jobTitle: employee.jobTitle,
    department: employee.department,
  };
}

async function unpaidSalary(id: string, companyId: string) {
  const { t } = await getI18n();
  const salary = await prisma.salary.findFirst({
    where: { id, employee: { companyId } },
    include: { employee: true },
  });
  if (!salary) go("/salaries", { error: t("مسير الراتب غير موجود", "Salary record not found") });
  if (salary!.paid) go(`/salaries/${id}`, { error: t("لا يمكن تعديل راتب تم صرفه", "A paid salary cannot be changed") });
  return salary!;
}

async function createSalaryRecord(user: SessionUser, employee: Employee & { employer: Employer | null }, year: number, month: number) {
  const absenceDays = await countAbsenceDays(employee.id, year, month);
  const amounts = buildSalaryAmounts({
    basicSalary: employee.basicSalary,
    housingAllowance: employee.housingAllowance,
    transportAllowance: employee.transportAllowance,
    otherAllowance: employee.otherAllowance,
    absenceDays,
    otherDeduction: 0,
    salaryDays: user.company.salaryDays,
  });
  return prisma.salary.create({
    data: {
      companyId: user.companyId,
      employeeId: employee.id,
      year,
      month,
      ...snapshot(employee),
      basicSalary: employee.basicSalary,
      housingAllowance: employee.housingAllowance,
      transportAllowance: employee.transportAllowance,
      otherAllowance: employee.otherAllowance,
      absenceDays,
      absenceDeduction: amounts.absenceDeduction,
      otherDeduction: 0,
      netSalary: amounts.netSalary,
    },
  });
}

/** One employee, one month: used when an employee joins mid-run or a record was deleted. */
export async function createSalary(formData: FormData) {
  const user = await requirePermission("salaries.create", "/salaries");
  const { t } = await getI18n();
  const period = periodFrom(formData);
  if (!period) go("/salaries", { error: t("الشهر غير صحيح", "Invalid month") });
  const { year, month } = period!;
  const back = salariesPath(year, month);
  const employee = await prisma.employee.findFirst({
    where: { id: req(formData, "employeeId"), companyId: user.companyId },
    include: { employer: true },
  });
  if (!employee) go(back, { error: t("اختر موظفاً", "Choose an employee") });
  const exists = await prisma.salary.findUnique({ where: { employeeId_year_month: { employeeId: employee!.id, year, month } } });
  if (exists) go(`/salaries/${exists.id}`, { error: t("لهذا الموظف مسير في هذا الشهر مسبقاً", "This employee already has a record for this month") });
  const salary = await createSalaryRecord(user, employee!, year, month);
  await writeAudit({
    userId: user.id,
    employeeId: employee!.id,
    action: "SALARY_CREATE",
    message: t(
      `أضاف مسير ${employee!.fullName} لشهر ${monthName(month, "ar")} ${year}`,
      `Added a salary record for ${employee!.fullName}, ${monthName(month, "en")} ${year}`,
    ),
  });
  refreshAll();
  go(`/salaries/${salary.id}`, { message: t("تمت إضافة المسير", "Salary record added") });
}

export async function generatePayroll(formData: FormData) {
  const user = await requirePermission("salaries.create", "/salaries");
  const { lang, t } = await getI18n();
  const period = periodFrom(formData);
  if (!period) go("/salaries", { error: t("الشهر غير صحيح", "Invalid month") });
  const { year, month } = period!;
  const employerId = req(formData, "employerId");
  const employees = await prisma.employee.findMany({
    where: {
      companyId: user.companyId,
      status: { in: ["ACTIVE", "VACATION"] },
      ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
    },
    include: { employer: true },
  });
  let created = 0;
  for (const employee of employees) {
    const exists = await prisma.salary.findUnique({
      where: { employeeId_year_month: { employeeId: employee.id, year, month } },
    });
    if (exists) continue;
    await createSalaryRecord(user, employee, year, month);
    created += 1;
  }
  const label = `${monthName(month, lang)} ${year}`;
  if (created > 0) {
    await writeAudit({
      userId: user.id,
      action: "PAYROLL",
      message: t(`أنشأ رواتب ${monthName(month, "ar")} ${year} لعدد ${created} موظف`, `Generated ${monthName(month, "en")} ${year} payroll for ${created} employee(s)`),
    });
  }
  refreshAll();
  go(salariesPath(year, month, employerId), {
    message: created
      ? t(`تم إنشاء رواتب ${created} موظف لشهر ${label}`, `Created ${created} salary record(s) for ${label}`)
      : t(`رواتب ${label} موجودة مسبقاً للموظفين النشطين`, `${label} payroll already exists for active employees`),
  });
}

export async function payAll(formData: FormData) {
  const user = await requirePermission("salaries.pay", "/salaries");
  const { t } = await getI18n();
  const period = periodFrom(formData);
  if (!period) go("/salaries", { error: t("الشهر غير صحيح", "Invalid month") });
  const { year, month } = period!;
  const employerId = req(formData, "employerId");
  const back = salariesPath(year, month, employerId);
  const method = req(formData, "paymentMethod");
  if (!PAYMENT_LABEL[method]) go(back, { error: t("اختر طريقة الدفع", "Choose a payment method") });
  const paidAt = parseDateInput(req(formData, "paidAt")) || parseDateInput(todayInputValue());
  const reference = clip(str(formData, "paymentReference"), 80);
  const salaries = await prisma.salary.findMany({
    where: {
      year,
      month,
      paid: false,
      employee: { companyId: user.companyId },
      ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
    },
    include: { employee: { include: { employer: true } } },
    orderBy: { employeeName: "asc" },
  });
  const payable = salaries.filter((salary) => salary.netSalary >= 0);
  if (!payable.length) go(back, { error: t("لا توجد رواتب غير مصروفة في هذا العرض", "No unpaid salaries in this view") });
  const { prefix, max } = await maxReceiptNumber(user.companyId, year, month);
  let counter = max;
  const paidIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const salary of payable) {
      counter += 1;
      await tx.salary.update({
        where: { id: salary.id },
        data: {
          paid: true,
          paidAt,
          paymentMethod: method,
          paymentReference: reference,
          paidByName: user.name,
          receiptNo: salary.receiptNo || receiptNo(prefix, counter),
          ...snapshot(salary.employee),
        },
      });
      paidIds.push(salary.id);
    }
  });
  const total = round3(payable.reduce((sum, salary) => sum + salary.netSalary, 0));
  await writeAudit({
    userId: user.id,
    action: "PAY_ALL",
    message: t(
      `صرف ${paidIds.length} راتب لشهر ${monthName(month, "ar")} ${year} بمجموع ${money(total, user.company.currency)}`,
      `Paid ${paidIds.length} salaries for ${monthName(month, "en")} ${year}, total ${money(total, user.company.currency)}`,
    ),
  });
  refreshAll();
  const skipped = salaries.length - payable.length;
  const query = new URLSearchParams({ from: `${year}-${String(month).padStart(2, "0")}`, to: `${year}-${String(month).padStart(2, "0")}`, docs: "receipts", status: "paid" });
  if (employerId) query.set("employerId", employerId);
  if (skipped > 0) {
    go(back, {
      message: t(
        `تم صرف ${paidIds.length} راتب. ${skipped} راتب صافيه سالب لم يُصرف. اطبع الإيصالات من زر الطباعة.`,
        `Paid ${paidIds.length}. ${skipped} with negative net were skipped. Print receipts from the print button.`,
      ),
    });
  }
  go(`/salaries/sheet?${query.toString()}`);
}

/** Edits an unpaid record. Components left out of the form keep their saved value. */
export async function updateSalaryAdjustments(formData: FormData) {
  const user = await requirePermission("salaries.edit", "/salaries");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await unpaidSalary(id, user.companyId);
  const amount = (key: "basicSalary" | "housingAllowance" | "transportAllowance" | "otherAllowance") =>
    formData.has(key) ? round3(Math.max(0, num(formData, key))) : salary[key];
  const components = {
    basicSalary: amount("basicSalary"),
    housingAllowance: amount("housingAllowance"),
    transportAllowance: amount("transportAllowance"),
    otherAllowance: amount("otherAllowance"),
  };
  const otherDeduction = round3(Math.max(0, num(formData, "otherDeduction")));
  const amounts = buildSalaryAmounts({ ...components, absenceDays: salary.absenceDays, otherDeduction, salaryDays: user.company.salaryDays });
  await prisma.salary.update({
    where: { id },
    data: { ...components, otherDeduction, absenceDeduction: amounts.absenceDeduction, netSalary: amounts.netSalary, notes: clip(str(formData, "notes"), 500) },
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary.employeeId,
    action: "SALARY_ADJUST",
    message: t(
      `عدّل راتب ${salary.employeeName} لشهر ${monthName(salary.month, "ar")} ${salary.year}: الصافي ${money(amounts.netSalary, user.company.currency)}`,
      `Edited salary of ${salary.employeeName}, ${monthName(salary.month, "en")} ${salary.year}: net ${money(amounts.netSalary, user.company.currency)}`,
    ),
  });
  refreshAll();
  go(`/salaries/${id}`, { message: t("تم حفظ تعديلات الراتب", "Salary changes saved") });
}

/** Reopens a paid record (wrong amount or method). The receipt number is kept and reused when it is paid again. */
export async function unpaySalary(formData: FormData) {
  const user = await requirePermission("salaries.pay", "/salaries");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await prisma.salary.findFirst({ where: { id, companyId: user.companyId } });
  if (!salary) go("/salaries", { error: t("مسير الراتب غير موجود", "Salary record not found") });
  if (!salary!.paid) go(`/salaries/${id}`);
  await prisma.salary.update({
    where: { id },
    data: { paid: false, paidAt: null, paymentMethod: null, paymentReference: null, paidByName: null },
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary!.employeeId,
    action: "SALARY_UNPAY",
    message: t(
      `ألغى صرف راتب ${salary!.employeeName} لشهر ${monthName(salary!.month, "ar")} ${salary!.year} (إيصال ${salary!.receiptNo || "—"})`,
      `Cancelled payment of ${salary!.employeeName}, ${monthName(salary!.month, "en")} ${salary!.year} (receipt ${salary!.receiptNo || "—"})`,
    ),
  });
  refreshAll();
  go(`/salaries/${id}`, { message: t("تم إلغاء الصرف. المسير مفتوح للتعديل.", "Payment cancelled. The record can be edited again.") });
}

export async function recalculateSalary(formData: FormData) {
  const user = await requirePermission("salaries.edit", "/salaries");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await unpaidSalary(id, user.companyId);
  const absenceDays = await countAbsenceDays(salary.employeeId, salary.year, salary.month);
  const amounts = buildSalaryAmounts({
    basicSalary: salary.basicSalary,
    housingAllowance: salary.housingAllowance,
    transportAllowance: salary.transportAllowance,
    otherAllowance: salary.otherAllowance,
    absenceDays,
    otherDeduction: salary.otherDeduction,
    salaryDays: user.company.salaryDays,
  });
  await prisma.salary.update({
    where: { id },
    data: { absenceDays, absenceDeduction: amounts.absenceDeduction, netSalary: amounts.netSalary },
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary.employeeId,
    action: "SALARY_RECALC",
    message: t(
      `أعاد احتساب غياب ${salary.employeeName} لشهر ${monthName(salary.month, "ar")} ${salary.year}: ${absenceDays} يوم`,
      `Recalculated absence for ${salary.employeeName}, ${monthName(salary.month, "en")} ${salary.year}: ${absenceDays} day(s)`,
    ),
  });
  refreshAll();
  go(`/salaries/${id}`, { message: t("تم إعادة احتساب خصم الغياب", "Absence deduction recalculated") });
}

export async function deleteUnpaidSalary(formData: FormData) {
  const user = await requirePermission("salaries.delete", "/salaries");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await unpaidSalary(id, user.companyId);
  await prisma.salary.delete({ where: { id } });
  await writeAudit({
    userId: user.id,
    employeeId: salary.employeeId,
    action: "SALARY_DELETE",
    message: t(
      `حذف مسير ${salary.employeeName} غير المصروف لشهر ${monthName(salary.month, "ar")} ${salary.year}`,
      `Deleted unpaid salary of ${salary.employeeName}, ${monthName(salary.month, "en")} ${salary.year}`,
    ),
  });
  refreshAll();
  go(salariesPath(salary.year, salary.month), { message: t("تم حذف المسير غير المصروف", "Unpaid salary deleted") });
}

export async function paySalary(formData: FormData) {
  const user = await requirePermission("salaries.pay", "/salaries");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await prisma.salary.findFirst({
    where: { id, employee: { companyId: user.companyId } },
    include: { employee: { include: { employer: true } } },
  });
  if (!salary) go("/salaries", { error: t("مسير الراتب غير موجود", "Salary record not found") });
  if (salary!.paid) go(`/salaries/${id}/print?doc=receipt`);
  if (salary!.netSalary < 0) go(`/salaries/${id}`, { error: t("صافي الراتب سالب. خفّض الخصومات قبل الصرف.", "Net salary is negative. Reduce deductions first.") });
  const method = req(formData, "paymentMethod");
  if (!PAYMENT_LABEL[method]) go(`/salaries/${id}`, { error: t("اختر طريقة الدفع", "Choose a payment method") });
  const paidAt = parseDateInput(req(formData, "paidAt")) || parseDateInput(todayInputValue());
  const { prefix, max } = await maxReceiptNumber(user.companyId, salary!.year, salary!.month);
  const number = salary!.receiptNo || receiptNo(prefix, max + 1);
  await prisma.salary.update({
    where: { id },
    data: {
      paid: true,
      paidAt,
      paymentMethod: method,
      paymentReference: clip(str(formData, "paymentReference"), 80),
      paidByName: user.name,
      receiptNo: number,
      ...snapshot(salary!.employee),
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary!.employeeId,
    action: "PAY",
    message: t(
      `صرف راتب ${salary!.employee.fullName} عن ${monthName(salary!.month, "ar")} ${salary!.year} بمبلغ ${money(salary!.netSalary, user.company.currency)} — إيصال ${number}`,
      `Paid ${salary!.employee.fullName} for ${monthName(salary!.month, "en")} ${salary!.year}: ${money(salary!.netSalary, user.company.currency)} — receipt ${number}`,
    ),
  });
  refreshAll();
  go(`/salaries/${id}/print?doc=receipt`);
}
