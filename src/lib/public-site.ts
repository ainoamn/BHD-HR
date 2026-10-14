import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { DEFAULT_PLANS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  tagline: string | null;
  taglineEn: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxEmployees: number | null;
  maxUsers: number | null;
  features: Prisma.JsonValue;
  contactOnly: boolean;
  highlight: boolean;
};

export type PublicInfo = { plans: PublicPlan[]; trialDays: number; supportEmail: string | null; supportPhone: string | null };

/** What the public pages show; read-only, and falls back to the starting plans so the landing page never fails. */
export const publicInfo = cache(async (): Promise<PublicInfo> => {
  try {
    const [plans, config] = await Promise.all([
      prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }),
      prisma.platformConfig.findUnique({ where: { id: "platform" } }),
    ]);
    return {
      plans: plans.length ? plans : fallbackPlans(),
      trialDays: config?.trialDays ?? 14,
      supportEmail: config?.supportEmail ?? null,
      supportPhone: config?.supportPhone ?? null,
    };
  } catch (error) {
    console.error("public-site: plans unavailable", error);
    return { plans: fallbackPlans(), trialDays: 14, supportEmail: null, supportPhone: null };
  }
});

function fallbackPlans(): PublicPlan[] {
  return DEFAULT_PLANS.filter((plan) => plan.isPublic).map((plan) => ({ ...plan, id: plan.code }));
}
