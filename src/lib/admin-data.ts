import { STAFF_ROLES } from "./auth";
import { priceFor } from "./plans";
import { prisma } from "./prisma";
import { computeAccess, type CompanyAccess } from "./subscription";

export type CompanyRow = {
  id: string;
  name: string;
  nameEn: string | null;
  status: string;
  createdAt: Date;
  signupIp: string | null;
  owner: string | null;
  users: number;
  accounts: number;
  employees: number;
  access: CompanyAccess;
  lastPaidAt: Date | null;
  lastSeenAt: Date | null;
  lastSeenIp: string | null;
};

/** Every company with its plan state, people counts, owner, last payment and last sign-in, for the platform admin. */
export async function companyRows(now = new Date()): Promise<CompanyRow[]> {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      nameEn: true,
      status: true,
      createdAt: true,
      signupIp: true,
      subscription: { include: { plan: true } },
      _count: { select: { employees: { where: { status: { not: "TERMINATED" } } } } },
      memberships: { select: { role: true, email: true, createdAt: true, user: { select: { email: true, lastLoginAt: true, lastLoginIp: true } } }, orderBy: { createdAt: "asc" } },
      payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true } },
    },
  });
  return companies.map((company) => {
    const staff = company.memberships.filter((member) => (STAFF_ROLES as readonly string[]).includes(member.role));
    const owner = staff.find((member) => member.role === "ADMIN");
    const seen = company.memberships
      .map((member) => member.user)
      .filter((user): user is NonNullable<typeof user> => Boolean(user?.lastLoginAt))
      .sort((a, b) => b.lastLoginAt!.getTime() - a.lastLoginAt!.getTime())[0];
    return {
      id: company.id,
      name: company.name,
      nameEn: company.nameEn,
      status: company.status,
      createdAt: company.createdAt,
      signupIp: company.signupIp,
      owner: owner ? owner.user?.email || owner.email : null,
      users: staff.length,
      accounts: company.memberships.length - staff.length,
      employees: company._count.employees,
      access: computeAccess({ companyStatus: company.status, subscription: company.subscription, now }),
      lastPaidAt: company.payments[0]?.paidAt ?? null,
      lastSeenAt: seen?.lastLoginAt ?? null,
      lastSeenIp: seen?.lastLoginIp ?? null,
    };
  });
}

export const COMPANY_STATES = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "SUSPENDED", "LEGACY"] as const;
export const COMPANY_SORTS = ["newest", "oldest", "name", "employees", "ending", "seen"] as const;
export type CompanyFilter = { q: string; state: string | null; plan: string | null; sort: (typeof COMPANY_SORTS)[number] };

/** Reads the companies list filters from the query string; anything unknown falls back to "all". */
export function companyFilter(params: { q?: string; state?: string; plan?: string; sort?: string }): CompanyFilter {
  const state = params.state && ([...COMPANY_STATES, "ENDING"] as string[]).includes(params.state) ? params.state : null;
  const sort = COMPANY_SORTS.find((value) => value === params.sort) ?? "newest";
  return { q: (params.q || "").trim(), state, plan: params.plan?.trim() || null, sort };
}

/** `state` ENDING = still running and ends within 7 days; `plan` "none" = no subscription. */
export function filterCompanies(rows: CompanyRow[], filter: CompanyFilter) {
  const q = filter.q.toLowerCase();
  const matches = rows.filter(
    (row) =>
      (!filter.state ||
        (filter.state === "ENDING" ? row.access.active && row.access.daysLeft !== null && row.access.daysLeft <= 7 : row.access.state === filter.state)) &&
      (!filter.plan || (filter.plan === "none" ? !row.access.planId : row.access.planId === filter.plan)) &&
      (!q ||
        row.name.toLowerCase().includes(q) ||
        row.nameEn?.toLowerCase().includes(q) ||
        row.owner?.toLowerCase().includes(q) ||
        row.signupIp?.includes(q) ||
        row.lastSeenIp?.includes(q) ||
        row.id === filter.q),
  );
  const time = (date: Date | null, empty: number) => date?.getTime() ?? empty;
  const order: Record<CompanyFilter["sort"], (a: CompanyRow, b: CompanyRow) => number> = {
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    oldest: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    name: (a, b) => a.name.localeCompare(b.name, "ar"),
    employees: (a, b) => b.employees - a.employees,
    ending: (a, b) => time(a.access.endsAt, Infinity) - time(b.access.endsAt, Infinity),
    seen: (a, b) => time(b.lastSeenAt, 0) - time(a.lastSeenAt, 0),
  };
  return matches.sort(order[filter.sort]);
}

/** Monthly recurring revenue: every paid, running subscription at its monthly-equivalent price. */
export async function monthlyRecurring(now = new Date()) {
  const byPlan = await recurringByPlan(now);
  return [...byPlan.values()].reduce((sum, item) => sum + item.mrr, 0);
}

/** Monthly recurring revenue and paying companies per plan id. */
export async function recurringByPlan(now = new Date()) {
  const subs = await prisma.subscription.findMany({ where: { status: { in: ["ACTIVE", "CANCELED"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] }, include: { plan: true } });
  const result = new Map<string, { mrr: number; paying: number }>();
  for (const sub of subs) {
    const mrr = sub.cycle === "YEARLY" ? priceFor(sub.plan, "YEARLY") / 12 : priceFor(sub.plan, "MONTHLY");
    const item = result.get(sub.planId) ?? { mrr: 0, paying: 0 };
    item.mrr += mrr;
    if (mrr > 0) item.paying += 1;
    result.set(sub.planId, item);
  }
  return result;
}

export type MonthPoint = { key: string; label: { ar: string; en: string }; value: number };

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last `count` calendar months (UTC), oldest first, each starting at zero. */
export function lastMonths(count: number, now = new Date()): MonthPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    const month = date.getUTCMonth();
    return { key: `${date.getUTCFullYear()}-${month}`, label: { ar: MONTHS_AR[month], en: MONTHS_EN[month] }, value: 0 };
  });
}

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

/** Money collected per month (paid payments), oldest first. */
export async function revenueByMonth(count = 12, now = new Date()) {
  const months = lastMonths(count, now);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1));
  const paid = await prisma.payment.findMany({ where: { status: "PAID", paidAt: { gte: from } }, select: { amount: true, paidAt: true } });
  for (const payment of paid) {
    const point = months.find((month) => month.key === monthKey(payment.paidAt!));
    if (point) point.value = Math.round((point.value + payment.amount) * 1000) / 1000;
  }
  return months;
}

/** New companies per month, oldest first. */
export function signupsByMonth(rows: Pick<CompanyRow, "createdAt">[], count = 12, now = new Date()) {
  const months = lastMonths(count, now);
  for (const row of rows) {
    const point = months.find((month) => month.key === monthKey(row.createdAt));
    if (point) point.value += 1;
  }
  return months;
}
