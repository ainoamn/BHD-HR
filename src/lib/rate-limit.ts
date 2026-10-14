import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "./prisma";

/**
 * Fixed-window counters in the database (serverless instances share nothing in memory). Keys hold a hash of the
 * IP or account, never the value itself. Expired rows are cleared by the daily job.
 */
export type LimitRule = { limit: number; windowSeconds: number };

export const LIMITS = {
  /** Wrong passwords per IP, and per account name from any IP. */
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  loginAccount: { limit: 8, windowSeconds: 15 * 60 },
  /** Unknown portal, badge or letter links per IP (someone guessing tokens). */
  badToken: { limit: 30, windowSeconds: 60 * 60 },
  /** Wrong answers to the portal's new-device question, per employee and per IP. */
  deviceEmployee: { limit: 5, windowSeconds: 60 * 60 },
  deviceIp: { limit: 20, windowSeconds: 60 * 60 },
  /** Browser error reports per IP. */
  errorReport: { limit: 30, windowSeconds: 60 * 60 },
} satisfies Record<string, LimitRule>;

export function limitKey(bucket: string, value: string) {
  return `${bucket}:${createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32)}`;
}

/** The caller's IP as the hosting proxy reports it; "local" when there is none (development). */
export async function clientIp() {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
}

/** Counts one attempt and says whether it is still within the limit. */
export async function hitLimit(key: string, rule: LimitRule) {
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, timezone('UTC', now()) + make_interval(secs => ${rule.windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < timezone('UTC', now()) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < timezone('UTC', now()) THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0];
  return { ok: row.count <= rule.limit, count: row.count, retryAfter: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}

/** Whether the key is already over its limit, without counting an attempt. */
export async function isLimited(key: string, rule: LimitRule) {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  return Boolean(row && row.resetAt > new Date() && row.count >= rule.limit);
}

export async function clearLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

export async function purgeExpiredLimits() {
  return (await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } })).count;
}

/** "15 دقيقة" / "15 minutes" for a wait in seconds. */
export function waitText(seconds: number, lang: "ar" | "en") {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return lang === "en" ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${minutes} دقيقة`;
}
