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

/** Monthly recurring revenue: every paid, running subscription at its monthly-equivalent price. */
export async function monthlyRecurring(now = new Date()) {
  const subs = await prisma.subscription.findMany({ where: { status: { in: ["ACTIVE", "CANCELED"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] }, include: { plan: true } });
  return subs.reduce((sum, sub) => sum + (sub.cycle === "YEARLY" ? priceFor(sub.plan, "YEARLY") / 12 : priceFor(sub.plan, "MONTHLY")), 0);
}
