import type { Plan, Subscription } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, FEATURES, formatRial, isFreePlan, limitText, priceFor, readFeatures, yearlySavingMonths } from "@/lib/plans";
import { addMonths, computeAccess, hasFeature, periodAfterPayment, planPermissions, planTeamPermissions } from "@/lib/subscription";

const DAY = 86_400_000;
const now = new Date(Date.UTC(2026, 5, 15, 12));

const plan = (over: Partial<Plan> = {}) =>
  ({ id: "p-pro", code: "PRO", name: "المتقدمة", nameEn: "Pro", priceMonthly: 30, priceYearly: 300, maxEmployees: 60, maxUsers: 6, features: ["tasks", "letters", "reports"], ...over }) as Plan;

const sub = (over: Partial<Subscription> = {}, planOver: Partial<Plan> = {}) =>
  ({
    id: "s1",
    companyId: "c1",
    planId: "p-pro",
    status: "ACTIVE",
    cycle: "MONTHLY",
    trialEndsAt: null,
    currentPeriodStart: new Date(now.getTime() - 10 * DAY),
    currentPeriodEnd: new Date(now.getTime() + 20 * DAY),
    maxEmployees: null,
    maxUsers: null,
    extraFeatures: null,
    plan: plan(planOver),
    ...over,
  }) as Subscription & { plan: Plan };

describe("free plan", () => {
  it("is the one public plan without a price that is not arranged with sales", () => {
    const free = DEFAULT_PLANS.find((item) => item.code === "FREE")!;
    expect(isFreePlan(free)).toBe(true);
    expect(free).toMatchObject({ maxEmployees: 2, maxUsers: 1, features: [] });
    expect(DEFAULT_PLANS.filter((item) => isFreePlan(item)).map((item) => item.code)).toEqual(["FREE"]);
    expect(isFreePlan({ priceMonthly: 0, priceYearly: 0, contactOnly: true })).toBe(false);
  });

  it("never expires and keeps only the core open", () => {
    const access = computeAccess({
      companyStatus: "ACTIVE",
      subscription: sub({ currentPeriodEnd: null }, { code: "FREE", priceMonthly: 0, priceYearly: 0, maxEmployees: 2, maxUsers: 1, features: [] }),
      now: new Date(now.getTime() + 3650 * DAY),
    });
    expect(access).toMatchObject({ state: "ACTIVE", active: true, maxEmployees: 2, maxUsers: 1, endsAt: null, features: [] });
    expect(planPermissions(["employees.view", "salaries.create", "attendance.create", "tasks.view", "letters.create"] as never[], access)).toEqual(["employees.view", "salaries.create", "attendance.create"]);
  });
});

describe("company access", () => {
  it("keeps companies from before plans fully open", () => {
    const access = computeAccess({ companyStatus: "ACTIVE", subscription: null, now });
    expect(access.state).toBe("LEGACY");
    expect(access.active).toBe(true);
    expect(access.features).toEqual([...FEATURES]);
    expect(access.maxEmployees).toBeNull();
  });

  it("runs a trial until its end date, then expires", () => {
    const trial = sub({ status: "TRIAL", trialEndsAt: new Date(now.getTime() + 3 * DAY), currentPeriodEnd: null });
    expect(computeAccess({ companyStatus: "ACTIVE", subscription: trial, now })).toMatchObject({ state: "TRIAL", active: true, daysLeft: 3, cycle: null });
    const over = sub({ status: "TRIAL", trialEndsAt: new Date(now.getTime() - DAY), currentPeriodEnd: null });
    expect(computeAccess({ companyStatus: "ACTIVE", subscription: over, now })).toMatchObject({ state: "EXPIRED", active: false });
  });

  it("gives a paid period a short grace, then expires", () => {
    const grace = sub({ currentPeriodEnd: new Date(now.getTime() - DAY) });
    const access = computeAccess({ companyStatus: "ACTIVE", subscription: grace, now });
    expect(access).toMatchObject({ state: "GRACE", active: true });
    expect(access.endsAt?.getTime()).toBe(now.getTime() - DAY + 3 * DAY);
    const gone = sub({ currentPeriodEnd: new Date(now.getTime() - 4 * DAY) });
    expect(computeAccess({ companyStatus: "ACTIVE", subscription: gone, now }).state).toBe("EXPIRED");
  });

  it("treats a paid plan without an end date as open-ended", () => {
    expect(computeAccess({ companyStatus: "ACTIVE", subscription: sub({ currentPeriodEnd: null }), now })).toMatchObject({ state: "ACTIVE", active: true, endsAt: null, daysLeft: null });
  });

  it("suspension closes everything, even legacy and paid companies", () => {
    expect(computeAccess({ companyStatus: "SUSPENDED", subscription: null, now }).active).toBe(false);
    expect(computeAccess({ companyStatus: "SUSPENDED", subscription: sub(), now })).toMatchObject({ state: "SUSPENDED", active: false });
  });

  it("merges plan and extra features, and company overrides win over plan limits", () => {
    const access = computeAccess({ companyStatus: "ACTIVE", subscription: sub({ extraFeatures: ["ai"], maxEmployees: 80 }), now });
    expect(access.features).toEqual(["tasks", "letters", "reports", "ai"]);
    expect(hasFeature(access, "ai")).toBe(true);
    expect(hasFeature(access, "recruitment")).toBe(false);
    expect(access.maxEmployees).toBe(80);
    expect(access.maxUsers).toBe(6);
  });
});

describe("plan permissions", () => {
  const access = computeAccess({ companyStatus: "ACTIVE", subscription: sub(), now });

  it("removes the permissions of modules the plan lacks", () => {
    const allowed = planPermissions(["employees.view", "tasks.view", "expenses.view", "assets.edit", "reports.view"] as never[], access);
    expect(allowed).toEqual(["employees.view", "tasks.view", "reports.view"]);
  });

  it("removes everything while the company is closed", () => {
    const closed = computeAccess({ companyStatus: "SUSPENDED", subscription: sub(), now });
    expect(planPermissions(["employees.view"] as never[], closed)).toEqual([]);
    expect(planTeamPermissions(["team.leave.approve"] as never[], closed)).toEqual([]);
  });

  it("maps team permissions to their feature", () => {
    expect(planTeamPermissions(["team.expenses.approve", "team.performance.view", "team.leave.approve"] as never[], access)).toEqual(["team.leave.approve"]);
  });
});

describe("billing periods", () => {
  it("adds calendar months and clamps to the month's last day", () => {
    expect(addMonths(new Date(Date.UTC(2026, 0, 31)), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date(Date.UTC(2028, 0, 31)), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(addMonths(new Date(Date.UTC(2026, 10, 15)), 12).toISOString().slice(0, 10)).toBe("2027-11-15");
  });

  it("renewing the same plan continues from the current end", () => {
    const current = sub();
    const period = periodAfterPayment({ now, current, plan: plan(), cycle: "MONTHLY" });
    expect(period.start).toEqual(current.currentPeriodEnd);
    expect(period.end).toEqual(addMonths(current.currentPeriodEnd!, 1));
  });

  it("switching plans starts now and credits the unused paid days", () => {
    const current = sub();
    const business = plan({ id: "p-biz", priceMonthly: 60, priceYearly: 600 });
    const period = periodAfterPayment({ now, current, plan: business, cycle: "MONTHLY" });
    expect(period.start).toEqual(now);
    expect(period.end.getTime()).toBe(addMonths(now, 1).getTime() + 10 * DAY);
  });

  it("keeps the trial days left when paying early", () => {
    const trial = sub({ status: "TRIAL", trialEndsAt: new Date(now.getTime() + 5 * DAY + 1000), currentPeriodEnd: null });
    const period = periodAfterPayment({ now, current: trial, plan: plan(), cycle: "YEARLY" });
    expect(period.end.getTime()).toBe(addMonths(now, 12).getTime() + 5 * DAY);
  });

  it("starts now after an expired period", () => {
    const old = sub({ currentPeriodEnd: new Date(now.getTime() - 40 * DAY) });
    const period = periodAfterPayment({ now, current: old, plan: plan(), cycle: "MONTHLY" });
    expect(period).toEqual({ start: now, end: addMonths(now, 1) });
  });
});

describe("plan helpers", () => {
  it("prices, savings and labels", () => {
    expect(priceFor(plan(), "MONTHLY")).toBe(30);
    expect(priceFor(plan(), "YEARLY")).toBe(300);
    expect(yearlySavingMonths(plan())).toBe(2);
    expect(formatRial(29, "en")).toContain("29");
    expect(formatRial(12.5, "ar")).toContain("12.5");
    expect(limitText(null, "en")).not.toMatch(/\d/);
    expect(readFeatures(["ai", "nope", "tasks", 3])).toEqual(["tasks", "ai"]);
  });
});
