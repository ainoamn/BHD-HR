import { randomBytes } from "crypto";
import type { Lang } from "./i18n";
import { attendanceChoices, leaveApplies, type LeaveTypeInfo, LEAVE_CHOICE } from "./leave";
import { prisma } from "./prisma";

export function newPortalToken() {
  return randomBytes(24).toString("base64url");
}

export function portalUrl(origin: string, token: string) {
  return `${origin}/portal/${token}`;
}

/** The employee behind a portal link; null for an unknown token or an employee whose service has ended. */
export async function portalEmployee(token: string) {
  if (!token || token.length < 20) return null;
  const employee = await prisma.employee.findUnique({ where: { portalToken: token }, include: { company: true, employer: true } });
  if (!employee || employee.status === "TERMINATED") return null;
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
