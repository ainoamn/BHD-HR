import type { Prisma, PrismaClient } from "@prisma/client";
import type { Bi } from "./i18n";
import { prisma } from "./prisma";

/**
 * A month's payroll moves DRAFT → REVIEW → APPROVED → LOCKED (no row = DRAFT). Salaries change only in DRAFT; a
 * LOCKED month cannot be paid, unpaid or edited at all, and differences found later go into a later month as a
 * correction pay item. With company.payrollApproval on, salaries are paid only once the month is APPROVED.
 */
export const PERIOD_STATUSES = ["DRAFT", "REVIEW", "APPROVED", "LOCKED"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const PERIOD_LABEL: Record<PeriodStatus, Bi> = {
  DRAFT: { ar: "مسودة", en: "Draft" },
  REVIEW: { ar: "قيد المراجعة", en: "In review" },
  APPROVED: { ar: "معتمد", en: "Approved" },
  LOCKED: { ar: "مقفل", en: "Locked" },
};

export const PERIOD_TONE: Record<PeriodStatus, string> = { DRAFT: "slate", REVIEW: "amber", APPROVED: "teal", LOCKED: "green" };

type Db = PrismaClient | Prisma.TransactionClient;

export function readStatus(value: string | null | undefined): PeriodStatus {
  return PERIOD_STATUSES.includes(value as PeriodStatus) ? (value as PeriodStatus) : "DRAFT";
}

export async function periodStatus(companyId: string, year: number, month: number, db: Db = prisma) {
  const row = await db.payrollPeriod.findUnique({ where: { companyId_year_month: { companyId, year, month } }, select: { status: true } });
  return readStatus(row?.status);
}

/** Salaries of the month may be created, edited, recalculated or deleted. */
export function canEditPeriod(status: PeriodStatus) {
  return status === "DRAFT";
}

/** Salaries of the month may be paid now. */
export function canPayPeriod(status: PeriodStatus, approvalRequired: boolean) {
  if (status === "LOCKED" || status === "REVIEW") return false;
  return approvalRequired ? status === "APPROVED" : true;
}

export type PeriodMove = "submit" | "approve" | "return" | "lock" | "unlock";

/** Which move takes the month where; null when it is not allowed from this status. */
export function nextStatus(from: PeriodStatus, move: PeriodMove, approvalRequired: boolean): PeriodStatus | null {
  if (move === "submit") return from === "DRAFT" ? "REVIEW" : null;
  if (move === "approve") return from === "REVIEW" ? "APPROVED" : null;
  if (move === "return") return from === "REVIEW" || from === "APPROVED" ? "DRAFT" : null;
  if (move === "lock") return from === "APPROVED" || (!approvalRequired && from === "DRAFT") ? "LOCKED" : null;
  return from === "LOCKED" ? "DRAFT" : null;
}

/** The first month on or after `from` whose payroll is still a draft, for corrections of a locked month. */
export async function nextOpenMonth(companyId: string, from: { year: number; month: number }) {
  const closed = await prisma.payrollPeriod.findMany({
    where: { companyId, status: { not: "DRAFT" }, OR: [{ year: { gt: from.year } }, { year: from.year, month: { gte: from.month } }] },
    select: { year: true, month: true },
  });
  const taken = new Set(closed.map((row) => row.year * 12 + row.month - 1));
  let key = from.year * 12 + from.month - 1;
  while (taken.has(key)) key += 1;
  return { year: Math.floor(key / 12), month: (key % 12) + 1 };
}
