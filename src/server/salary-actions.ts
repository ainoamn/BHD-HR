"use server";

import type { Employee, Employer } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { PAYMENT_LABEL, monthName } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { buildSalaryAmounts, packageGross } from "@/lib/salary";
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

async function maxReceiptNumber(year: number, month: number) {
  const prefix = `PAY-${year}-${String(month).padStart(2, "0")}-`;
  const existing = await prisma.salary.findMany({
    where: { receiptNo: { startsWith: prefix } },
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

export async function generatePayroll(formData: FormData) {
  const user = await requireWriter();
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
    await prisma.salary.create({
      data: {
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
  const user = await requireWriter();
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
  const { prefix, max } = await maxReceiptNumber(year, month);
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

export async function updateSalaryAdjustments(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const salary = await unpaidSalary(id, user.companyId);
  const otherDeduction = Math.max(0, num(formData, "otherDeduction"));
  const gross = packageGross(salary);
  const netSalary = round3(gross - salary.absenceDeduction - otherDeduction);
  await prisma.salary.update({
    where: { id },
    data: { otherDeduction, netSalary, notes: clip(str(formData, "notes"), 500) },
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary.employeeId,
    action: "SALARY_ADJUST",
    message: t(
      `عدّل خصومات راتب ${salary.employeeName} لشهر ${monthName(salary.month, "ar")} ${salary.year}`,
      `Changed deductions for ${salary.employeeName}, ${monthName(salary.month, "en")} ${salary.year}`,
    ),
  });
  refreshAll();
  go(`/salaries/${id}`, { message: t("تم تحديث الخصومات", "Deductions updated") });
}

export async function recalculateSalary(formData: FormData) {
  const user = await requireWriter();
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
  const user = await requireWriter();
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
  const user = await requireWriter();
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
  const { prefix, max } = await maxReceiptNumber(salary!.year, salary!.month);
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
