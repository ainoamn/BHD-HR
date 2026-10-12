import { daysUntil } from "./expiry";
import type { Bi, Lang } from "./i18n";
import { daysPhrase, formatDate } from "./utils";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS: Record<TaskStatus, { label: Bi; tone: string; dot: string; column: string }> = {
  TODO: { label: { ar: "للتنفيذ", en: "To do" }, tone: "slate", dot: "bg-slate-400", column: "bg-slate-100/80" },
  IN_PROGRESS: { label: { ar: "قيد التنفيذ", en: "In progress" }, tone: "sky", dot: "bg-navy-500", column: "bg-navy-50/70" },
  REVIEW: { label: { ar: "للمراجعة", en: "Review" }, tone: "amber", dot: "bg-amber-500", column: "bg-amber-50/70" },
  DONE: { label: { ar: "مكتملة", en: "Done" }, tone: "green", dot: "bg-emerald-500", column: "bg-emerald-50/70" },
};

export const TASK_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY: Record<TaskPriority, { label: Bi; tone: string; flag: string }> = {
  URGENT: { label: { ar: "عاجلة", en: "Urgent" }, tone: "red", flag: "text-red-600" },
  HIGH: { label: { ar: "عالية", en: "High" }, tone: "orange", flag: "text-orange-500" },
  NORMAL: { label: { ar: "عادية", en: "Normal" }, tone: "sky", flag: "text-navy-500" },
  LOW: { label: { ar: "منخفضة", en: "Low" }, tone: "slate", flag: "text-slate-400" },
};

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export const NOTE_KINDS: Record<string, { label: Bi; tone: string }> = {
  GENERAL: { label: { ar: "عامة", en: "General" }, tone: "slate" },
  PERFORMANCE: { label: { ar: "أداء", en: "Performance" }, tone: "sky" },
  CONDUCT: { label: { ar: "سلوك", en: "Conduct" }, tone: "amber" },
  TRAINING: { label: { ar: "تدريب", en: "Training" }, tone: "teal" },
  PRAISE: { label: { ar: "إشادة", en: "Praise" }, tone: "green" },
};

/** How close the due date is, for badges: overdue and today are red, the next two days amber. */
export function dueInfo(dueDate: Date | null | undefined, status: string, lang: Lang) {
  if (!dueDate) return null;
  if (status === "DONE") return { tone: "slate", label: formatDate(dueDate), days: null as number | null, overdue: false };
  const days = daysUntil(new Date(dueDate));
  const label =
    days < 0
      ? lang === "en"
        ? `${daysPhrase(days, "en")} overdue`
        : `متأخرة ${daysPhrase(days, "ar")}`
      : days === 0
        ? lang === "en"
          ? "Due today"
          : "تستحق اليوم"
        : days === 1
          ? lang === "en"
            ? "Due tomorrow"
            : "تستحق غداً"
          : formatDate(dueDate);
  return { tone: days <= 0 ? "red" : days <= 2 ? "amber" : "slate", label, days, overdue: days < 0 };
}

export const TASK_ALERT_DAYS = 2;
