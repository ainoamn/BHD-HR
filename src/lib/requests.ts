import type { Bi } from "./i18n";
import { LETTER_KIND, type LetterKind } from "./letters";
import type { Permission } from "./permissions";

export const REQUEST_TYPES = ["LETTER", "DOCUMENTS", "RESIGNATION", "ADVANCE", "OTHER"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** `perm` decides the request; a salary-revealing letter also needs salaries.view (canDecideRequest). */
export const REQUEST_TYPE: Record<RequestType, { label: Bi; perm: Permission }> = {
  LETTER: { label: { ar: "طلب خطاب", en: "Letter request" }, perm: "letters.create" },
  DOCUMENTS: { label: { ar: "طلب استلام مستندات أصلية", en: "Original documents request" }, perm: "documents.edit" },
  RESIGNATION: { label: { ar: "استقالة", en: "Resignation" }, perm: "employees.edit" },
  ADVANCE: { label: { ar: "طلب سلفة", en: "Advance request" }, perm: "salaries.create" },
  OTHER: { label: { ar: "طلب آخر", en: "Other request" }, perm: "employees.edit" },
};

export const PERMISSION_TEXT: Record<string, Bi> = {
  "letters.create": { ar: "إصدار الخطابات", en: "issue letters" },
  "employees.edit": { ar: "تعديل الموظفين", en: "edit employees" },
  "documents.edit": { ar: "تعديل المستندات", en: "edit documents" },
  "salaries.create": { ar: "إضافة بنود الرواتب", en: "add pay items" },
  "salaries.view": { ar: "عرض الرواتب", en: "view salaries" },
};

export const REQUEST_STATUS: Record<string, { label: Bi; tone: string }> = {
  PENDING: { label: { ar: "بانتظار الاعتماد", en: "Awaiting approval" }, tone: "amber" },
  APPROVED: { label: { ar: "معتمد", en: "Approved" }, tone: "green" },
  REJECTED: { label: { ar: "مرفوض", en: "Rejected" }, tone: "red" },
  CANCELLED: { label: { ar: "ملغى", en: "Cancelled" }, tone: "slate" },
};

/** Labour Law notice for monthly-paid staff; the default last day of a resignation. */
export const RESIGNATION_NOTICE_DAYS = 30;
/** Longest an employee may keep originals taken from the company's safekeeping. */
export const MAX_DOCUMENT_DAYS = 90;
/** Open (pending) requests one employee may have at a time. */
export const MAX_OPEN_REQUESTS = 8;
export const MAX_ADVANCE_INSTALLMENTS = 24;

export function isRequestType(value: string): value is RequestType {
  return (REQUEST_TYPES as readonly string[]).includes(value);
}

/** What the employee asked for, in one line: the letter kind, the subject, or the request type. */
export function requestTitle(request: { type: string; letterKind: string | null; subject: string | null }): Bi {
  if (request.type === "LETTER") {
    const kind = LETTER_KIND[request.letterKind as LetterKind];
    if (kind && request.letterKind !== "GENERAL") return kind.label;
    return request.subject ? { ar: `خطاب: ${request.subject}`, en: `Letter: ${request.subject}` } : REQUEST_TYPE.LETTER.label;
  }
  if (request.type === "OTHER" && request.subject) return { ar: request.subject, en: request.subject };
  return REQUEST_TYPE[request.type as RequestType]?.label || REQUEST_TYPE.OTHER.label;
}

export function requestPermissions(request: { type: string; letterKind: string | null }): Permission[] {
  const base = REQUEST_TYPE[request.type as RequestType]?.perm || "employees.edit";
  const salary = request.type === "LETTER" && LETTER_KIND[request.letterKind as LetterKind]?.salary;
  return salary ? [base, "salaries.view"] : [base];
}

export function canDecideRequest(user: { permissions: readonly string[] }, request: { type: string; letterKind: string | null }) {
  return requestPermissions(request).every((permission) => user.permissions.includes(permission));
}

/** Request types the user can decide at all; drives the approvals card and the nav entry. */
export function decidableTypes(user: { permissions: readonly string[] }): RequestType[] {
  return REQUEST_TYPES.filter((type) => user.permissions.includes(REQUEST_TYPE[type].perm));
}
