import type { Bi } from "./i18n";

export const EXPENSE_CATEGORIES = ["TRAVEL", "FUEL", "MEALS", "ACCOMMODATION", "SUPPLIES", "PHONE", "TRAINING", "MEDICAL", "OTHER"] as const;

export const EXPENSE_CATEGORY_LABEL: Record<string, Bi> = {
  TRAVEL: { ar: "سفر وتنقل", en: "Travel & transport" },
  FUEL: { ar: "وقود", en: "Fuel" },
  MEALS: { ar: "وجبات وضيافة", en: "Meals & hospitality" },
  ACCOMMODATION: { ar: "سكن وفندق", en: "Accommodation" },
  SUPPLIES: { ar: "مستلزمات ومشتريات", en: "Supplies & purchases" },
  PHONE: { ar: "اتصالات وإنترنت", en: "Phone & internet" },
  TRAINING: { ar: "تدريب ودورات", en: "Training" },
  MEDICAL: { ar: "علاج", en: "Medical" },
  OTHER: { ar: "أخرى", en: "Other" },
};

export const EXPENSE_STATUS_LABEL: Record<string, Bi> = {
  PENDING: { ar: "بانتظار الموافقة", en: "Awaiting approval" },
  APPROVED: { ar: "معتمد — بانتظار الصرف", en: "Approved — to be paid" },
  PAID: { ar: "مصروف", en: "Paid" },
  REJECTED: { ar: "مرفوض", en: "Rejected" },
  CANCELLED: { ar: "أُلغي", en: "Cancelled" },
};

export const EXPENSE_STATUS_TONE: Record<string, string> = { PENDING: "amber", APPROVED: "sky", PAID: "green", REJECTED: "red", CANCELLED: "slate" };

export const EXPENSE_PAY_METHODS = ["SALARY", "CASH", "BANK_TRANSFER", "CHEQUE"] as const;

export const EXPENSE_PAY_LABEL: Record<string, Bi> = {
  SALARY: { ar: "مع الراتب", en: "With the salary" },
  CASH: { ar: "نقداً", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
};

export const MAX_EXPENSE_AMOUNT = 100_000;
/** Open portal claims (pending) per employee, so a leaked link cannot flood HR. */
export const MAX_PENDING_PORTAL_CLAIMS = 10;
