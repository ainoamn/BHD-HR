"use server";

import { writeAudit } from "@/lib/audit";
import { can, requireUser } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { PERIOD_LABEL, nextOpenMonth, nextStatus, periodStatus, type PeriodMove } from "@/lib/payroll-period";
import { prisma } from "@/lib/prisma";
import { clip, intValue, num, req, round3, str } from "@/lib/utils";

const MOVES: PeriodMove[] = ["submit", "approve", "return", "lock", "unlock"];

/** Moves a month's payroll along DRAFT → REVIEW → APPROVED → LOCKED, or back; every move is in the activity log. */
export async function movePayrollPeriod(formData: FormData) {
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const year = intValue(formData, "year");
  const month = intValue(formData, "month");
  const move = req(formData, "move") as PeriodMove;
  const employerId = req(formData, "employerId");
  const back = `/salaries?year=${year}&month=${month}${employerId ? `&employerId=${employerId}` : ""}`;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || !MOVES.includes(move)) go("/salaries", { error: t("طلب غير صحيح", "Invalid request") });
  const allowed =
    move === "unlock" ? user.role === "ADMIN" : move === "submit" ? can(user, "salaries.edit") : move === "return" ? can(user, "salaries.edit") || can(user, "salaries.pay") : can(user, "salaries.pay");
  if (!allowed) {
    go(back, { error: move === "unlock" ? t("فك القفل للمسؤول فقط", "Only an administrator can unlock") : t("ليست لديك صلاحية لهذا الإجراء", "You do not have permission for this action") });
  }
  const from = await periodStatus(user.companyId, year, month);
  const to = nextStatus(from, move, user.company.payrollApproval);
  if (!to) go(back, { error: t(`لا يمكن هذا الإجراء والمسير ${PERIOD_LABEL[from].ar}`, `Not possible while the payroll is ${PERIOD_LABEL[from].en}`) });
  const note = clip(str(formData, "note"), 300);
  if (move === "unlock" && !note) go(back, { error: t("اكتب سبب فك القفل", "Give a reason for unlocking") });
  const salaries = await prisma.salary.findMany({ where: { companyId: user.companyId, year, month }, select: { paid: true, netSalary: true } });
  if (!salaries.length && (move === "submit" || move === "lock")) go(back, { error: t("لا توجد رواتب في هذا الشهر بعد", "There are no salaries this month yet") });
  if (move === "lock" && salaries.some((salary) => !salary.paid)) {
    go(back, { error: t("اصرف كل رواتب الشهر قبل القفل", "Pay every salary of the month before locking it") });
  }
  const now = new Date();
  const stamp =
    move === "submit"
      ? { submittedAt: now, submittedBy: user.name }
      : move === "approve"
        ? { approvedAt: now, approvedBy: user.name }
        : move === "lock"
          ? { lockedAt: now, lockedBy: user.name }
          : {};
  await prisma.payrollPeriod.upsert({
    where: { companyId_year_month: { companyId: user.companyId, year, month } },
    create: { companyId: user.companyId, year, month, status: to!, note, ...stamp },
    update: { status: to!, ...(note || move === "return" || move === "unlock" ? { note } : {}), ...stamp },
  });
  const total = round3(salaries.reduce((sum, salary) => sum + salary.netSalary, 0));
  const verb = {
    submit: { ar: "أرسل للمراجعة", en: "Sent for review" },
    approve: { ar: "اعتمد", en: "Approved" },
    return: { ar: "أعاد إلى مسودة", en: "Returned to draft" },
    lock: { ar: "أقفل", en: "Locked" },
    unlock: { ar: "فك قفل", en: "Unlocked" },
  }[move];
  await writeAudit({
    userId: user.id,
    action: `PAYROLL_${move.toUpperCase()}`,
    message: t(
      `${verb.ar} مسير ${monthName(month, "ar")} ${year} (${salaries.length} راتب، الصافي ${total})${note ? ` — ${note}` : ""}`,
      `${verb.en} the ${monthName(month, "en")} ${year} payroll (${salaries.length} salaries, net ${total})${note ? ` — ${note}` : ""}`,
    ),
  });
  refreshAll();
  go(back, { message: t(`مسير ${monthName(month, "ar")} ${year} الآن: ${PERIOD_LABEL[to!].ar}`, `${monthName(month, lang)} ${year} payroll is now: ${PERIOD_LABEL[to!].en}`) });
}

/**
 * A difference found in a locked (or paid) month: one-month entitlement or deduction in the first month that is
 * still a draft, titled with the month it corrects, so locked figures never change.
 */
export async function addPayrollCorrection(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  const id = req(formData, "salaryId");
  const back = `/salaries/${id}`;
  if (!can(user, "salaries.edit")) go(back, { error: t("ليست لديك صلاحية لهذا الإجراء", "You do not have permission for this action") });
  const salary = await prisma.salary.findFirst({ where: { id, companyId: user.companyId } });
  if (!salary) go("/salaries", { error: t("مسير الراتب غير موجود", "Salary record not found") });
  const amount = round3(Math.abs(num(formData, "amount")));
  const reason = clip(str(formData, "reason"), 200);
  const deduct = req(formData, "direction") === "deduct";
  if (amount <= 0) go(back, { error: t("أدخل مبلغ التصحيح", "Enter the correction amount") });
  if (!reason) go(back, { error: t("اكتب سبب التصحيح", "Give the reason for the correction") });
  const now = new Date();
  const after = salary!.month === 12 ? { year: salary!.year + 1, month: 1 } : { year: salary!.year, month: salary!.month + 1 };
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const start = await nextOpenMonth(user.companyId, after.year * 12 + after.month > current.year * 12 + current.month ? after : current);
  const title = `تصحيح راتب ${monthName(salary!.month, "ar")} ${salary!.year}: ${reason}`;
  await prisma.$transaction(async (tx) => {
    await tx.payItem.create({
      data: {
        companyId: user.companyId,
        employeeId: salary!.employeeId,
        kind: deduct ? "DEDUCTION" : "ENTITLEMENT",
        title: clip(title, 200)!,
        amount,
        issuedAt: now,
        startYear: start.year,
        startMonth: start.month,
        months: 1,
        createdByName: user.name,
        notes: `PAYROLL_CORRECTION:${salary!.id}`,
      },
    });
    await syncEmployeeSalaries(tx, salary!.employeeId, user.company.salaryDays);
  });
  await writeAudit({
    userId: user.id,
    employeeId: salary!.employeeId,
    action: "PAYROLL_CORRECTION",
    message: t(
      `تصحيح ${deduct ? "خصم" : "استحقاق"} ${amount} لراتب ${salary!.employeeName} عن ${monthName(salary!.month, "ar")} ${salary!.year}، يُطبّق في ${monthName(start.month, "ar")} ${start.year}: ${reason}`,
      `Correction (${deduct ? "deduction" : "entitlement"}) ${amount} for ${salary!.employeeName}, ${monthName(salary!.month, "en")} ${salary!.year}, applied in ${monthName(start.month, "en")} ${start.year}: ${reason}`,
    ),
  });
  refreshAll();
  go(back, {
    message: t(`سُجّل التصحيح ويُطبّق في راتب ${monthName(start.month, "ar")} ${start.year}`, `Correction recorded; it applies to the ${monthName(start.month, "en")} ${start.year} salary`),
  });
}
