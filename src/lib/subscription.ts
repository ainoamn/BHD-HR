import type { Plan, Subscription } from "@prisma/client";
import { cache } from "react";
import type { Bi } from "./i18n";
import type { Permission, TeamPermission } from "./permissions";
import { FEATURES, FEATURE_MODULES, TEAM_PERMISSION_FEATURE, readFeatures, type Feature } from "./plans";
import { prisma } from "./prisma";

/** Days a paid period keeps working after its end date while the company renews. */
export const GRACE_DAYS = 3;
const DAY = 86_400_000;

/**
 * LEGACY: no subscription row (companies from before plans) — everything open, no limits.
 * TRIAL / ACTIVE: working. GRACE: the paid period ended less than GRACE_DAYS ago. EXPIRED / SUSPENDED: closed.
 */
export type AccessState = "LEGACY" | "TRIAL" | "ACTIVE" | "GRACE" | "EXPIRED" | "SUSPENDED";

export type CompanyAccess = {
  state: AccessState;
  active: boolean;
  planId: string | null;
  planCode: string | null;
  planName: Bi | null;
  cycle: string | null;
  features: Feature[];
  maxEmployees: number | null;
  maxUsers: number | null;
  /** When the trial or paid period ends (for GRACE: when the grace ends); null = no end. */
  endsAt: Date | null;
  daysLeft: number | null;
};

export const ACCESS_LABEL: Record<AccessState, Bi> = {
  LEGACY: { ar: "حساب قائم", en: "Legacy account" },
  TRIAL: { ar: "تجربة مجانية", en: "Free trial" },
  ACTIVE: { ar: "نشط", en: "Active" },
  GRACE: { ar: "مهلة التجديد", en: "Renewal grace" },
  EXPIRED: { ar: "منتهٍ", en: "Expired" },
  SUSPENDED: { ar: "موقوف", en: "Suspended" },
};

export const ACCESS_TONE: Record<AccessState, string> = {
  LEGACY: "slate",
  TRIAL: "sky",
  ACTIVE: "green",
  GRACE: "amber",
  EXPIRED: "red",
  SUSPENDED: "red",
};

type SubscriptionWithPlan = Subscription & { plan: Plan };

function daysUntil(end: Date, now: Date) {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
}

export function computeAccess(input: { companyStatus: string; subscription: SubscriptionWithPlan | null; now?: Date }): CompanyAccess {
  const now = input.now ?? new Date();
  const sub = input.subscription;
  if (!sub) {
    const state: AccessState = input.companyStatus === "SUSPENDED" ? "SUSPENDED" : "LEGACY";
    return { state, active: state === "LEGACY", planId: null, planCode: null, planName: null, cycle: null, features: [...FEATURES], maxEmployees: null, maxUsers: null, endsAt: null, daysLeft: null };
  }
  const features = [...new Set([...readFeatures(sub.plan.features), ...readFeatures(sub.extraFeatures)])];
  const base = {
    planId: sub.planId,
    planCode: sub.plan.code,
    planName: { ar: sub.plan.name, en: sub.plan.nameEn || sub.plan.name },
    cycle: sub.status === "TRIAL" ? null : sub.cycle,
    features: FEATURES.filter((feature) => features.includes(feature)),
    maxEmployees: sub.maxEmployees ?? sub.plan.maxEmployees,
    maxUsers: sub.maxUsers ?? sub.plan.maxUsers,
  };
  let state: AccessState;
  let endsAt: Date | null;
  if (sub.status === "TRIAL") {
    endsAt = sub.trialEndsAt;
    state = !endsAt || endsAt > now ? "TRIAL" : "EXPIRED";
  } else {
    endsAt = sub.currentPeriodEnd;
    if (!endsAt || endsAt > now) state = "ACTIVE";
    else if (sub.status === "ACTIVE" && endsAt.getTime() + GRACE_DAYS * DAY > now.getTime()) {
      state = "GRACE";
      endsAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY);
    } else state = "EXPIRED";
  }
  if (input.companyStatus === "SUSPENDED") state = "SUSPENDED";
  const active = state === "TRIAL" || state === "ACTIVE" || state === "GRACE";
  return { ...base, state, active, endsAt, daysLeft: endsAt && active ? daysUntil(endsAt, now) : null };
}

export function hasFeature(access: Pick<CompanyAccess, "features">, feature: Feature) {
  return access.features.includes(feature);
}

/** Role permissions narrowed to what the plan opens; nothing at all while the company is closed. */
export function planPermissions<T extends Permission>(permissions: T[], access: CompanyAccess): T[] {
  if (!access.active) return [];
  const closed = new Set<string>(FEATURES.filter((feature) => !access.features.includes(feature)).flatMap((feature) => FEATURE_MODULES[feature] ?? []));
  return permissions.filter((permission) => !closed.has(permission.split(".")[0]));
}

export function planTeamPermissions(permissions: TeamPermission[], access: CompanyAccess): TeamPermission[] {
  if (!access.active) return [];
  return permissions.filter((permission) => {
    const feature = TEAM_PERMISSION_FEATURE[permission];
    return !feature || access.features.includes(feature);
  });
}

export const companyAccess = cache(async (companyId: string) => {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true, subscription: { include: { plan: true } } } });
  return computeAccess({ companyStatus: company?.status ?? "SUSPENDED", subscription: company?.subscription ?? null });
});

/** Generative AI (assistant, drafting, screening, insights, document reading) is a plan feature; translation stays open to all. */
export async function aiOpen(companyId: string) {
  const access = await companyAccess(companyId);
  return access.active && hasFeature(access, "ai");
}

export function aiLockedMessage(t: (ar: string, en: string) => string) {
  return t("مزايا الذكاء الاصطناعي غير مشمولة في باقتك. رقِّ الباقة من صفحة الاشتراك.", "AI features are not in your plan. Upgrade from the subscription page.");
}

/** Employees that count against the plan: everyone whose service has not ended. */
export function countedEmployees(companyId: string) {
  return prisma.employee.count({ where: { companyId, status: { not: "TERMINATED" } } });
}

/** Seats that count against the plan: staff memberships, accepted or still invited. */
export function countedUsers(companyId: string) {
  return prisma.membership.count({ where: { companyId, role: { in: ["ADMIN", "MANAGER", "VIEWER", "CUSTOM"] } } });
}

export type LimitCheck = { ok: true } | { ok: false; limit: number; used: number };

/** Whether `adding` more employees (or seats) fit the plan. */
export async function fitsLimit(companyId: string, kind: "employees" | "users", adding = 1): Promise<LimitCheck> {
  const access = await companyAccess(companyId);
  const limit = kind === "employees" ? access.maxEmployees : access.maxUsers;
  if (limit === null || adding <= 0) return { ok: true };
  const used = kind === "employees" ? await countedEmployees(companyId) : await countedUsers(companyId);
  return used + adding <= limit ? { ok: true } : { ok: false, limit, used };
}

export function limitMessage(kind: "employees" | "users", check: { limit: number; used: number }, t: (ar: string, en: string) => string) {
  return kind === "employees"
    ? t(
        `وصلت باقتك إلى حدها من الموظفين (${check.used} من ${check.limit}). رقِّ الباقة من صفحة الاشتراك لإضافة المزيد.`,
        `Your plan's employee limit is reached (${check.used} of ${check.limit}). Upgrade from the Subscription page to add more.`,
      )
    : t(
        `وصلت باقتك إلى حدها من المستخدمين (${check.used} من ${check.limit}). رقِّ الباقة من صفحة الاشتراك لدعوة المزيد.`,
        `Your plan's user limit is reached (${check.used} of ${check.limit}). Upgrade from the Subscription page to invite more.`,
      );
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

function dailyPrice(plan: { priceMonthly: number; priceYearly: number }, cycle: string) {
  return cycle === "YEARLY" ? plan.priceYearly / 365 : plan.priceMonthly / 30;
}

/**
 * The period a payment buys. Renewing the same plan continues from the current end. Switching plans starts now,
 * and the unused part of a paid period is converted into extra days at the new plan's price. Days left in a
 * trial are added on top, so paying early never loses them.
 */
export function periodAfterPayment(input: {
  now: Date;
  current: { status: string; planId: string; cycle: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null; plan: { priceMonthly: number; priceYearly: number } } | null;
  plan: { id: string; priceMonthly: number; priceYearly: number };
  cycle: string;
}) {
  const { now, current, plan, cycle } = input;
  const months = cycle === "YEARLY" ? 12 : 1;
  const paidEnd = current && current.status !== "TRIAL" ? current.currentPeriodEnd : null;
  if (current && paidEnd && paidEnd > now) {
    if (current.planId === plan.id && current.cycle === cycle) return { start: paidEnd, end: addMonths(paidEnd, months) };
    const remainingDays = (paidEnd.getTime() - now.getTime()) / DAY;
    const newDaily = dailyPrice(plan, cycle);
    const credit = newDaily > 0 ? Math.floor((remainingDays * dailyPrice(current.plan, current.cycle)) / newDaily) : 0;
    return { start: now, end: new Date(addMonths(now, months).getTime() + credit * DAY) };
  }
  const trialLeft = current?.status === "TRIAL" && current.trialEndsAt && current.trialEndsAt > now ? Math.floor((current.trialEndsAt.getTime() - now.getTime()) / DAY) : 0;
  return { start: now, end: new Date(addMonths(now, months).getTime() + trialLeft * DAY) };
}
