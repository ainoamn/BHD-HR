import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Lang } from "./i18n";
import { attendanceChoices, leaveApplies, type LeaveTypeInfo, LEAVE_CHOICE } from "./leave";
import { deviceTrusted } from "./portal-device";
import { prisma } from "./prisma";
import { lookupByToken } from "./rate-limit";
import { companyAccess } from "./subscription";

export function newPortalToken() {
  return randomBytes(24).toString("base64url");
}

export function portalUrl(origin: string, token: string) {
  return `${origin}/portal/${token}`;
}

/**
 * The employee behind a portal link, with no device check; null for an unknown token or an employee whose service
 * has ended. Unknown tokens count against the caller's IP, and an IP over the limit gets null for every token, so
 * guessing links tells nothing.
 */
export const findPortalEmployee = cache((token: string) =>
  lookupByToken(token, async (portalToken) => {
    const employee = await prisma.employee.findUnique({ where: { portalToken }, include: { company: true, employer: true } });
    return employee && employee.status !== "TERMINATED" ? employee : null;
  }),
);

/**
 * The employee behind a portal link for pages and actions: a browser that has not passed the new-device check is
 * sent to it, and every portal pauses while the company's subscription is closed.
 */
export async function portalEmployee(token: string) {
  const employee = await findPortalEmployee(token);
  if (employee && !(await companyAccess(employee.companyId)).active) redirect("/paused");
  if (employee && !(await deviceTrusted(employee))) redirect(`/portal/${token}/verify`);
  return employee;
}

/** REVOKED: approved, then HR deleted the recorded period from attendance. */
export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "REVOKED"] as const;

export const LEAVE_REQUEST_LABEL: Record<string, { ar: string; en: string }> = {
  PENDING: { ar: "بانتظار الموافقة", en: "Awaiting approval" },
  APPROVED: { ar: "موافق عليها", en: "Approved" },
  REJECTED: { ar: "مرفوضة", en: "Rejected" },
  CANCELLED: { ar: "ألغاها الموظف", en: "Cancelled by employee" },
  REVOKED: { ar: "ألغتها الإدارة", en: "Cancelled by HR" },
};

export const LEAVE_REQUEST_TONE: Record<string, "amber" | "green" | "red" | "slate"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
  REVOKED: "slate",
};

/** What an employee may ask for: the leave types that apply to the job, and unpaid leave. */
export function portalLeaveChoices(types: LeaveTypeInfo[], jobTitleId: string | null, lang: Lang) {
  const all = attendanceChoices(types, lang);
  const paid = all.filter((choice) => {
    if (!choice.value.startsWith(LEAVE_CHOICE)) return false;
    const type = types.find((item) => `${LEAVE_CHOICE}${item.key}` === choice.value);
    return Boolean(type && leaveApplies(type, jobTitleId));
  });
  return [...paid, ...all.filter((choice) => choice.value === "UNPAID_LEAVE")];
}

/** Most periods an employee can ask for in one request. */
export const MAX_REQUEST_DAYS = 90;
/** Unreviewed portal uploads allowed at once, so a leaked link cannot flood storage. */
export const MAX_PENDING_UPLOADS = 10;
