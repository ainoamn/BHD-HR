import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, parseSession, readSession, sessionValid } from "./auth";
import { isPlatformAdmin } from "./platform-admin";
import { DEFAULT_PLANS } from "./plans";
import { prisma } from "./prisma";
import { clientIp } from "./rate-limit";

const CONFIG_ID = "platform";

/** The signed-in platform admin, read straight from the session (a platform admin needs no company). */
export const getPlatformAdmin = cache(async () => {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, email: true, picture: true, isPlatformAdmin: true, disabledAt: true, bhdSub: true } });
  return user && sessionValid(session, user) && isPlatformAdmin(user) ? user : null;
});

export async function requirePlatformAdmin() {
  const admin = await getPlatformAdmin();
  if (!admin) {
    const userId = readSession((await cookies()).get(SESSION_COOKIE)?.value);
    redirect(userId ? "/?error=" + encodeURIComponent("هذه الصفحة لمدير المنصة فقط / Platform admins only") : "/login?next=/admin");
  }
  return admin;
}

export const platformConfig = cache(async () => {
  return (await prisma.platformConfig.findUnique({ where: { id: CONFIG_ID } })) ?? (await prisma.platformConfig.create({ data: { id: CONFIG_ID } }));
});

export async function writePlatformLog(entry: { userId?: string | null; userName?: string | null; companyId?: string | null; action: string; message: string }) {
  let ip: string | null = null;
  try {
    ip = await clientIp();
  } catch {
    ip = null;
  }
  await prisma.platformLog.create({ data: { ...entry, ip } });
}

/** Creates the starting plans that are missing (by code); never changes a plan the admin edited. */
export async function ensureDefaultPlans() {
  const existing = new Set((await prisma.plan.findMany({ select: { code: true } })).map((plan) => plan.code));
  for (const plan of DEFAULT_PLANS) {
    if (existing.has(plan.code)) continue;
    await prisma.plan.create({ data: { ...plan, features: plan.features } }).catch(() => null);
  }
}

/** Every new company starts a free trial of the configured plan. */
export async function startTrial(companyId: string, now = new Date()) {
  await ensureDefaultPlans();
  const config = await platformConfig();
  const plan = (await prisma.plan.findUnique({ where: { code: config.trialPlanCode } })) ?? (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "desc" } }));
  if (!plan) return null;
  return prisma.subscription.create({
    data: { companyId, planId: plan.id, status: "TRIAL", trialEndsAt: new Date(now.getTime() + Math.max(1, config.trialDays) * 86_400_000) },
  });
}

export function receiptNumber(number: number) {
  return `INV-${String(number).padStart(6, "0")}`;
}
