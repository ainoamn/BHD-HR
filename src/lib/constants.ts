import type { Bi, Lang } from "./i18n";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthNames(lang: Lang) {
  return lang === "en" ? MONTHS_EN : MONTHS_AR;
}

export function monthName(month: number, lang: Lang = "ar") {
  return monthNames(lang)[month - 1] || String(month);
}

export function monthBoth(month: number) {
  return `${monthName(month, "ar")} / ${monthName(month, "en")}`;
}

export const STATUS_LABEL: Record<string, Bi> = {
  ACTIVE: { ar: "نشط", en: "Active" },
  INACTIVE: { ar: "غير نشط", en: "Inactive" },
  VACATION: { ar: "إجازة", en: "On leave" },
  TERMINATED: { ar: "منتهي الخدمة", en: "Terminated" },
};

export const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "red"> = {
  ACTIVE: "green",
  VACATION: "amber",
  INACTIVE: "slate",
  TERMINATED: "red",
};

export const GENDER_LABEL: Record<string, Bi> = {
  MALE: { ar: "ذكر", en: "Male" },
  FEMALE: { ar: "أنثى", en: "Female" },
};

export const NEW_EMPLOYER = "__new__";

export const EMPLOYER_KIND: Record<string, Bi> = {
  COMPANY: { ar: "شركة / منشأة", en: "Company" },
  PERSON: { ar: "شخص / فرد", en: "Individual" },
};

export const DOC_LABEL: Record<string, Bi> = {
  ID_CARD: { ar: "البطاقة الشخصية", en: "ID card" },
  PASSPORT: { ar: "جواز السفر", en: "Passport" },
  RESIDENCE: { ar: "الإقامة", en: "Residence" },
  DRIVING_LICENSE: { ar: "رخصة القيادة", en: "Driving licence" },
  CONTRACT: { ar: "العقد", en: "Contract" },
  INSURANCE: { ar: "التأمين", en: "Insurance" },
  CERTIFICATE: { ar: "شهادة", en: "Certificate" },
  OTHER: { ar: "مستند آخر", en: "Other document" },
};

export const EXTRA_DOC_TYPES = ["DRIVING_LICENSE", "CONTRACT", "INSURANCE", "CERTIFICATE", "ID_CARD", "PASSPORT", "RESIDENCE", "OTHER"];

export const BALANCE_KEYS = ["annual", "sick", "compensatory", "other"] as const;
export type BalanceKey = (typeof BALANCE_KEYS)[number];

export const BALANCE_LABEL: Record<BalanceKey, Bi> = {
  annual: { ar: "الإجازة السنوية", en: "Annual leave" },
  sick: { ar: "الإجازة المرضية", en: "Sick leave" },
  compensatory: { ar: "الإجازة التعويضية", en: "Compensatory leave" },
  other: { ar: "إجازات أخرى", en: "Other leave" },
};

export const ATTENDANCE_TYPES: {
  id: string;
  label: Bi;
  deductsSalary: boolean;
  balance: BalanceKey | null;
}[] = [
  { id: "ABSENT", label: { ar: "غياب", en: "Absence" }, deductsSalary: true, balance: null },
  { id: "UNPAID_LEAVE", label: { ar: "إجازة بخصم راتب", en: "Unpaid leave" }, deductsSalary: true, balance: null },
  { id: "LEAVE", label: { ar: "إجازة سنوية", en: "Annual leave" }, deductsSalary: false, balance: "annual" },
  { id: "SICK", label: { ar: "إجازة مرضية", en: "Sick leave" }, deductsSalary: false, balance: "sick" },
  { id: "COMPENSATORY", label: { ar: "إجازة تعويضية", en: "Compensatory leave" }, deductsSalary: false, balance: "compensatory" },
  { id: "OTHER_LEAVE", label: { ar: "إجازة أخرى", en: "Other leave" }, deductsSalary: false, balance: "other" },
  { id: "OFFICIAL", label: { ar: "مهمة رسمية", en: "Official duty" }, deductsSalary: false, balance: null },
  { id: "HALF_DAY", label: { ar: "نصف يوم", en: "Half day" }, deductsSalary: true, balance: null },
];

export const ATTENDANCE_LABEL: Record<string, Bi> = Object.fromEntries(ATTENDANCE_TYPES.map((item) => [item.id, item.label]));

export function attendanceType(id: string) {
  return ATTENDANCE_TYPES.find((item) => item.id === id) || null;
}

export const PAYMENT_LABEL: Record<string, Bi> = {
  CASH: { ar: "نقداً", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
};

const NATIONALITIES_AR = ["عماني", "هندي", "بنغلاديشي", "باكستاني", "فلبيني", "مصري", "سوداني", "نيبالي", "سريلانكي", "إندونيسي"];
const NATIONALITIES_EN = ["Omani", "Indian", "Bangladeshi", "Pakistani", "Filipino", "Egyptian", "Sudanese", "Nepali", "Sri Lankan", "Indonesian"];
const JOBS_AR = ["عامل", "سائق", "مشرف", "حارس", "فني", "محاسب", "مندوب", "موظف إداري"];
const JOBS_EN = ["Labourer", "Driver", "Supervisor", "Guard", "Technician", "Accountant", "PRO", "Administrator"];

export function nationalities(lang: Lang) {
  return lang === "en" ? NATIONALITIES_EN : NATIONALITIES_AR;
}

export function jobs(lang: Lang) {
  return lang === "en" ? JOBS_EN : JOBS_AR;
}

export function localizeTerm(value: string | null | undefined, lang: Lang) {
  if (!value) return value ?? null;
  for (const [ar, en] of [
    [NATIONALITIES_AR, NATIONALITIES_EN],
    [JOBS_AR, JOBS_EN],
  ]) {
    const index = lang === "en" ? ar.indexOf(value) : en.indexOf(value);
    if (index >= 0) return lang === "en" ? en[index] : ar[index];
  }
  return value;
}

export function bothTerm(value: string | null | undefined) {
  if (!value) return value ?? null;
  const ar = localizeTerm(value, "ar");
  const en = localizeTerm(value, "en");
  return ar && en && ar !== en ? `${ar} / ${en}` : value;
}
