import { randomBytes } from "crypto";
import type { Bi } from "./i18n";

export const JOB_STATUSES = ["OPEN", "ON_HOLD", "CLOSED"] as const;

export const JOB_STATUS_LABEL: Record<string, Bi> = {
  OPEN: { ar: "مفتوحة", en: "Open" },
  ON_HOLD: { ar: "متوقفة مؤقتاً", en: "On hold" },
  CLOSED: { ar: "مغلقة", en: "Closed" },
};

export const JOB_STATUS_TONE: Record<string, string> = { OPEN: "green", ON_HOLD: "amber", CLOSED: "slate" };

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"] as const;

export const EMPLOYMENT_LABEL: Record<string, Bi> = {
  FULL_TIME: { ar: "دوام كامل", en: "Full time" },
  PART_TIME: { ar: "دوام جزئي", en: "Part time" },
  CONTRACT: { ar: "عقد مؤقت", en: "Fixed-term contract" },
  INTERNSHIP: { ar: "تدريب", en: "Internship" },
};

export const STAGES = ["NEW", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<string, Bi> = {
  NEW: { ar: "جديد", en: "New" },
  SCREENING: { ar: "فرز", en: "Screening" },
  INTERVIEW: { ar: "مقابلة", en: "Interview" },
  OFFER: { ar: "عرض وظيفي", en: "Offer" },
  HIRED: { ar: "تم التعيين", en: "Hired" },
  REJECTED: { ar: "مستبعد", en: "Rejected" },
};

export const STAGE_TONE: Record<string, string> = {
  NEW: "sky",
  SCREENING: "slate",
  INTERVIEW: "amber",
  OFFER: "teal",
  HIRED: "green",
  REJECTED: "red",
};

/** Stages still in the running; HIRED and REJECTED are final. */
export const ACTIVE_STAGES: readonly string[] = ["NEW", "SCREENING", "INTERVIEW", "OFFER"];

export const SOURCE_LABEL: Record<string, Bi> = {
  HR: { ar: "أضافه فريق الموارد البشرية", en: "Added by HR" },
  APPLY_LINK: { ar: "من رابط التقديم", en: "From the apply link" },
};

export function newApplyToken() {
  return randomBytes(18).toString("base64url");
}

export function applyUrl(origin: string, token: string) {
  return `${origin}/apply/${token}`;
}

export function scoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) return "slate";
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "red";
}

/** Most applications one public link accepts, so a leaked link cannot flood storage. */
export const MAX_PUBLIC_APPLICATIONS = 300;
