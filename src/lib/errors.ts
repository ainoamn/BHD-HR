import { createHash } from "node:crypto";
import { isPlaceholderEmail } from "./accounts";
import { channelReady, sendEmailMessage } from "./delivery";
import { prisma } from "./prisma";

export const ERROR_SOURCES = ["SERVER", "CLIENT", "CRON", "BACKUP"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

/** Hours a backup may be late before it counts as missed (runs daily at 02:00 Muscat). */
export const BACKUP_GRACE_HOURS = 36;
const NOTIFY_EVERY_MS = 3600_000;

/**
 * Paths may carry credentials (portal, badge and invite tokens) and record ids: every long segment becomes ":id"
 * and the query string is dropped, so stored paths group well and reveal nothing.
 */
export function cleanPath(path: string | null | undefined) {
  if (!path) return null;
  const bare = path.split(/[?#]/)[0] || "/";
  return bare
    .split("/")
    .map((segment) => (segment.length >= 16 || /^\d{3,}$/.test(segment) ? ":id" : segment))
    .join("/")
    .slice(0, 200);
}

/** Numbers and ids vary between occurrences of the same fault; they are masked for grouping only. */
export function errorFingerprint(input: { companyId: string | null; source: string; message: string; path: string | null }) {
  const message = input.message.replace(/[0-9a-f]{8,}|\d+/gi, "#").slice(0, 300);
  return createHash("sha256").update([input.companyId || "-", input.source, message, input.path || "-"].join("|")).digest("hex").slice(0, 40);
}

/** The company of whoever was signed in when a request failed, read from its cookies; null for visitors. */
export async function companyFromCookieHeader(header: string | string[] | undefined) {
  const { COMPANY_COOKIE, SESSION_COOKIE, readSession } = await import("./auth");
  const raw = Array.isArray(header) ? header.join("; ") : header || "";
  const jar = Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length >= 2)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
  );
  const userId = readSession(jar[SESSION_COOKIE]);
  if (!userId) return null;
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { companyId: true }, orderBy: { createdAt: "asc" } });
  return memberships.find((member) => member.companyId === jar[COMPANY_COOKIE])?.companyId ?? memberships[0]?.companyId ?? null;
}

/** A company's errors go to its admins; errors that belong to no company go to the platform admins. */
async function notifyAdmins(companyId: string | null, subject: string, text: string) {
  if (!channelReady("EMAIL")) return;
  const emails = companyId
    ? [
        ...new Set(
          (await prisma.membership.findMany({ where: { companyId, role: "ADMIN", acceptedAt: { not: null } }, include: { user: { select: { email: true } } } }))
            .map((admin) => admin.user?.email || admin.email)
            .filter((email) => email && !isPlaceholderEmail(email)),
        ),
      ]
    : (await prisma.user.findMany({ where: { isPlatformAdmin: true, disabledAt: null }, select: { email: true } })).map((user) => user.email);
  for (const to of emails) {
    try {
      await sendEmailMessage({ to, subject, text, dir: "ltr" });
    } catch (error) {
      console.error("error alert email", error);
    }
  }
}

/**
 * Stores one occurrence, grouped with earlier ones of the same fault; a new fault (or one that comes back after
 * being marked solved) emails the admins at most once an hour. Never throws: monitoring must not break a request.
 */
export async function recordError(input: { source: ErrorSource; message: string; stack?: string | null; path?: string | null; digest?: string | null; companyId?: string | null; origin?: string }) {
  try {
    const companyId = input.companyId ?? null;
    const message = (input.message || "Unknown error").replace(/\s+/g, " ").trim().slice(0, 500);
    const path = cleanPath(input.path);
    const fingerprint = errorFingerprint({ companyId, source: input.source, message, path });
    const now = new Date();
    const existing = await prisma.errorEvent.findUnique({ where: { fingerprint } });
    const stack = input.stack ? input.stack.slice(0, 2000) : null;
    const event = existing
      ? await prisma.errorEvent.update({
          where: { id: existing.id },
          data: { count: { increment: 1 }, lastAt: now, resolvedAt: null, digest: input.digest || existing.digest, ...(stack ? { stack } : {}) },
        })
      : await prisma.errorEvent.create({ data: { fingerprint, companyId, source: input.source, message, path, stack, digest: input.digest || null } });
    const fresh = !existing || existing.resolvedAt !== null;
    if (fresh && (!event.notifiedAt || now.getTime() - event.notifiedAt.getTime() > NOTIFY_EVERY_MS)) {
      await prisma.errorEvent.update({ where: { id: event.id }, data: { notifiedAt: now } });
      const link = input.origin ? `\n\n${input.origin}/settings/system` : "";
      await notifyAdmins(companyId, `BHD HR — ${input.source.toLowerCase()} error`, `${message}\n${path ? `Page: ${path}\n` : ""}Time: ${now.toISOString()}${link}`);
    }
    return event.id;
  } catch (error) {
    console.error("recordError failed", error);
    return null;
  }
}

/** The latest backup runs and whether one succeeded within the grace window (none recorded yet = not set up). */
export async function backupStatus(now = new Date()) {
  const runs = await prisma.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 });
  const lastOk = runs.find((run) => run.ok);
  const configured = runs.length > 0;
  const overdue = configured && (!lastOk || now.getTime() - lastOk.startedAt.getTime() > BACKUP_GRACE_HOURS * 3600_000);
  return { runs, lastOk: lastOk ?? null, configured, overdue };
}

/** Open error groups this admin should see: their company's, plus the platform's when they run the platform. */
export function visibleErrorScope(companyId: string, platform: boolean) {
  return { platform, where: platform ? { OR: [{ companyId }, { companyId: null }] } : { companyId } };
}
