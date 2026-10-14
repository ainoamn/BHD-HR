import type { PayItem, Prisma, PrismaClient } from "@prisma/client";
import { allowanceAmount, allowanceDue } from "./allowances";
import { payKindDeducts } from "./constants";
import { isOmani, spfContribution } from "./oman";
import { canEditPeriod, periodStatus } from "./payroll-period";
import { buildSalaryAmounts, packageGross } from "./salary";
import { round3 } from "./utils";

type Db = PrismaClient | Prisma.TransactionClient;

export const monthKey = (year: number, month: number) => year * 12 + (month - 1);
export const keyToPeriod = (key: number) => ({ year: Math.floor(key / 12), month: (key % 12) + 1 });

/**
 * What one item adds or deducts in the salary month `key`. `recovered` is what paid or earlier salaries already
 * took for an advance: each instalment is amount ÷ instalments, and the last one takes whatever is still owed
 * (so a skipped month is caught up at the end instead of being lost).
 */
export function scheduledAmount(item: Pick<PayItem, "kind" | "amount" | "startYear" | "startMonth" | "months" | "stoppedAt">, key: number, recovered = 0) {
  if (item.stoppedAt) return 0;
  const index = key - monthKey(item.startYear, item.startMonth);
  if (index < 0) return 0;
  if (item.kind === "ADVANCE") {
    const remaining = round3(item.amount - recovered);
    if (remaining <= 0) return 0;
    const count = Math.max(1, item.months || 1);
    if (index >= count - 1) return remaining;
    return Math.min(round3(item.amount / count), remaining);
  }
  if (item.months && index >= item.months) return 0;
  return round3(item.amount);
}

/**
 * Rebuilds the allowance and pay-item lines and totals of one unpaid salary. Paid salaries are left exactly as they
 * were paid, and so are salaries of a month in review, approved or locked (src/lib/payroll-period.ts).
 */
export async function syncSalaryLines(db: Db, salaryId: string, salaryDays: number) {
  const found = await db.salary.findUnique({ where: { id: salaryId }, include: { company: true, employee: { select: { nationality: true } } } });
  if (!found || found.paid) return found;
  if (!canEditPeriod(await periodStatus(found.companyId, found.year, found.month, db))) return found;
  const { company, employee, ...salary } = found;
  const key = monthKey(salary.year, salary.month);
  const items = await db.payItem.findMany({
    where: { employeeId: salary.employeeId, stoppedAt: null },
    include: { lines: { where: { salaryId: { not: salary.id } }, include: { salary: { select: { year: true, month: true, paid: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const allowances = await db.employeeAllowance.findMany({
    where: { employeeId: salary.employeeId, active: true },
    include: { allowanceType: { select: { nameAr: true, nameEn: true } } },
    orderBy: { createdAt: "asc" },
  });
  const allowanceLines = allowances
    .filter((allowance) => allowanceDue(allowance, salary.year, salary.month))
    .map((allowance) => ({
      salaryId,
      allowanceId: allowance.id,
      kind: "RECURRING",
      title: allowance.allowanceType.nameAr,
      titleEn: allowance.allowanceType.nameEn,
      amount: allowanceAmount(allowance, salary),
      deduct: false,
    }));
  const itemLines = items.map((item) => {
    const recovered = item.lines
      .filter((line) => line.salary.paid || monthKey(line.salary.year, line.salary.month) < key)
      .reduce((sum, line) => sum + line.amount, 0);
    return { salaryId, payItemId: item.id, kind: item.kind, title: item.title, amount: scheduledAmount(item, key, recovered), deduct: payKindDeducts(item.kind) };
  });
  const omani = isOmani(employee.nationality);
  const recurring = round3(allowanceLines.reduce((sum, line) => sum + line.amount, 0));
  const spf = spfContribution(company, omani, { basic: salary.basicSalary, gross: round3(packageGross(salary) + recurring) });
  const spfLine = spf.employee
    ? [
        {
          salaryId,
          kind: "SOCIAL",
          title: `الحماية الاجتماعية — حصة الموظف ${company.spfEmployeeRate}%`,
          titleEn: `Social protection — employee share ${company.spfEmployeeRate}%`,
          amount: spf.employee,
          deduct: true,
        },
      ]
    : [];
  const lines = [...allowanceLines, ...itemLines, ...spfLine].filter((line) => line.amount > 0);
  await db.salaryLine.deleteMany({ where: { salaryId } });
  if (lines.length) await db.salaryLine.createMany({ data: lines });
  const extraEarnings = round3(lines.filter((line) => !line.deduct).reduce((sum, line) => sum + line.amount, 0));
  const extraDeductions = round3(lines.filter((line) => line.deduct).reduce((sum, line) => sum + line.amount, 0));
  const amounts = buildSalaryAmounts({ ...salary, extraEarnings, extraDeductions, salaryDays });
  return db.salary.update({
    where: { id: salaryId },
    data: {
      extraEarnings,
      extraDeductions,
      absenceDeduction: amounts.absenceDeduction,
      netSalary: amounts.netSalary,
      spfEmployee: spf.employee,
      spfEmployer: spf.employer,
    },
  });
}

/** Re-applies allowances and pay items to every unpaid salary of an employee, oldest month first. */
export async function syncEmployeeSalaries(db: Db, employeeId: string, salaryDays: number) {
  const salaries = await db.salary.findMany({
    where: { employeeId, paid: false },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { id: true },
  });
  for (const salary of salaries) await syncSalaryLines(db, salary.id, salaryDays);
  return salaries.length;
}

export type PayItemStatus = "SCHEDULED" | "ACTIVE" | "DONE" | "STOPPED";

type ItemWithLines = PayItem & { lines: { amount: number; salary: { year: number; month: number; paid: boolean } }[] };

/** Progress of an item for lists: what was paid out through salaries, what waits in unpaid ones, what is left. */
export function payItemProgress(item: ItemWithLines, nowKey: number) {
  const start = monthKey(item.startYear, item.startMonth);
  const count = item.months || null;
  const end = count ? start + count - 1 : null;
  const paid = item.lines.filter((line) => line.salary.paid);
  const paidAmount = round3(paid.reduce((sum, line) => sum + line.amount, 0));
  const pendingAmount = round3(item.lines.filter((line) => !line.salary.paid).reduce((sum, line) => sum + line.amount, 0));
  const deducts = payKindDeducts(item.kind);
  let status: PayItemStatus;
  let remaining: number | null = null;
  if (item.kind === "ADVANCE") {
    remaining = round3(Math.max(0, item.amount - paidAmount));
    status = remaining <= 0 ? "DONE" : item.stoppedAt ? "STOPPED" : start > nowKey ? "SCHEDULED" : "ACTIVE";
  } else {
    status = item.stoppedAt ? "STOPPED" : end !== null && end < nowKey ? "DONE" : start > nowKey ? "SCHEDULED" : "ACTIVE";
  }
  return {
    start,
    end,
    deducts,
    paidAmount,
    paidMonths: paid.length,
    pendingAmount,
    remaining,
    instalment: item.kind === "ADVANCE" ? round3(item.amount / Math.max(1, count || 1)) : null,
    status,
    thisMonth: status === "STOPPED" ? 0 : scheduledAmount(item, nowKey, paid.filter((line) => monthKey(line.salary.year, line.salary.month) < nowKey).reduce((sum, line) => sum + line.amount, 0)),
  };
}
