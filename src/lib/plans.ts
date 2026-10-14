import type { Bi } from "./i18n";
import type { Module, TeamPermission } from "./permissions";

/**
 * Paid features on top of the core. Every plan has the core: employees and sponsors, payroll with WPS and the
 * Social Protection Fund, attendance and leave, documents with expiry alerts, calendar, the employee portal and
 * app, requests and approvals, and the activity log.
 */
export const FEATURES = ["tasks", "letters", "expenses", "assets", "reports", "recruitment", "performance", "ai"] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<Feature, Bi> = {
  tasks: { ar: "المهام والملاحظات", en: "Tasks & notes" },
  letters: { ar: "الخطابات والإنذارات بتوقيع إلكتروني", en: "Letters & warnings with e-signature" },
  expenses: { ar: "المصروفات واستردادها", en: "Expense claims" },
  assets: { ar: "العُهد والأصول", en: "Assets & custody" },
  reports: { ar: "التقارير ولوحة المالك", en: "Reports & owner analytics" },
  recruitment: { ar: "التوظيف وفرز السير الذاتية", en: "Recruitment & CV screening" },
  performance: { ar: "تقييم الأداء", en: "Performance reviews" },
  ai: { ar: "المساعد الذكي والكتابة بالذكاء الاصطناعي", en: "AI assistant & AI writing" },
};

export const CORE_FEATURES: Bi[] = [
  { ar: "ملفات الموظفين والكفلاء", en: "Employee & sponsor records" },
  { ar: "الرواتب مع ملف WPS والحماية الاجتماعية", en: "Payroll with WPS file & social protection" },
  { ar: "الحضور والإجازات وجداول الدوام", en: "Attendance, leave & work schedules" },
  { ar: "المستندات وتنبيهات انتهائها", en: "Documents & expiry alerts" },
  { ar: "بوابة الموظف وتطبيق الجوال", en: "Employee portal & phone app" },
  { ar: "الطلبات والموافقات وسجل العمليات", en: "Requests, approvals & activity log" },
];

/** Sections that close when the plan lacks the feature; their permissions are removed from every role. */
export const FEATURE_MODULES: Partial<Record<Feature, Module[]>> = {
  tasks: ["tasks"],
  letters: ["letters"],
  expenses: ["expenses"],
  assets: ["assets"],
  reports: ["reports"],
  recruitment: ["recruitment"],
  performance: ["performance"],
};

export const TEAM_PERMISSION_FEATURE: Partial<Record<TeamPermission, Feature>> = {
  "team.expenses.approve": "expenses",
  "team.performance.view": "performance",
};

export const CYCLES = ["MONTHLY", "YEARLY"] as const;
export type Cycle = (typeof CYCLES)[number];

export const CYCLE_LABEL: Record<Cycle, Bi> = {
  MONTHLY: { ar: "شهري", en: "Monthly" },
  YEARLY: { ar: "سنوي", en: "Yearly" },
};

export const PAYMENT_STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  PENDING: { ar: "معلّقة", en: "Pending", tone: "amber" },
  PAID: { ar: "مدفوعة", en: "Paid", tone: "green" },
  FAILED: { ar: "فشلت", en: "Failed", tone: "red" },
  CANCELED: { ar: "ملغاة", en: "Cancelled", tone: "slate" },
};

export const PROVIDER_LABEL: Record<string, { ar: string; en: string }> = {
  THAWANI: { ar: "بطاقة (ثواني)", en: "Card (Thawani)" },
  MANUAL: { ar: "تحويل / يدوي", en: "Transfer / manual" },
};

export function isCycle(value: string): value is Cycle {
  return (CYCLES as readonly string[]).includes(value);
}

export function readFeatures(value: unknown): Feature[] {
  const wanted = new Set(Array.isArray(value) ? value.map(String) : []);
  return FEATURES.filter((feature) => wanted.has(feature));
}

export type PlanSeed = {
  code: string;
  name: string;
  nameEn: string;
  tagline: string;
  taglineEn: string;
  priceMonthly: number;
  priceYearly: number;
  maxEmployees: number | null;
  maxUsers: number | null;
  features: Feature[];
  isPublic: boolean;
  contactOnly: boolean;
  highlight: boolean;
  sortOrder: number;
};

/** Starting plans, created once; the platform admin changes prices, limits and features from /admin/plans. */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "FREE",
    name: "المجانية",
    nameEn: "Free",
    tagline: "الرواتب والحضور لمنشأة صغيرة جداً، مجاناً دائماً",
    taglineEn: "Payroll and attendance for a very small business, free forever",
    priceMonthly: 0,
    priceYearly: 0,
    maxEmployees: 2,
    maxUsers: 1,
    features: [],
    isPublic: true,
    contactOnly: false,
    highlight: false,
    sortOrder: 5,
  },
  {
    code: "BASIC",
    name: "الأساسية",
    nameEn: "Basic",
    tagline: "للمنشآت الصغيرة التي تبدأ التنظيم",
    taglineEn: "For small businesses getting organised",
    priceMonthly: 12,
    priceYearly: 120,
    maxEmployees: 15,
    maxUsers: 2,
    features: ["tasks"],
    isPublic: true,
    contactOnly: false,
    highlight: false,
    sortOrder: 10,
  },
  {
    code: "PRO",
    name: "الاحترافية",
    nameEn: "Professional",
    tagline: "لفرق الموارد البشرية النشطة",
    taglineEn: "For active HR teams",
    priceMonthly: 29,
    priceYearly: 290,
    maxEmployees: 60,
    maxUsers: 6,
    features: ["tasks", "letters", "expenses", "assets", "reports"],
    isPublic: true,
    contactOnly: false,
    highlight: true,
    sortOrder: 20,
  },
  {
    code: "BUSINESS",
    name: "الأعمال",
    nameEn: "Business",
    tagline: "كل الميزات مع الذكاء الاصطناعي",
    taglineEn: "Every feature, with AI",
    priceMonthly: 59,
    priceYearly: 590,
    maxEmployees: 250,
    maxUsers: 20,
    features: [...FEATURES],
    isPublic: true,
    contactOnly: false,
    highlight: false,
    sortOrder: 30,
  },
  {
    code: "ENTERPRISE",
    name: "المؤسسات",
    nameEn: "Enterprise",
    tagline: "أعداد مفتوحة وخدمة مخصصة",
    taglineEn: "Unlimited, with dedicated service",
    priceMonthly: 0,
    priceYearly: 0,
    maxEmployees: null,
    maxUsers: null,
    features: [...FEATURES],
    isPublic: true,
    contactOnly: true,
    highlight: false,
    sortOrder: 40,
  },
];

/** A plan anyone can switch to without paying: no price for either period and not arranged with sales. */
export function isFreePlan(plan: { priceMonthly: number; priceYearly: number; contactOnly: boolean }) {
  return !plan.contactOnly && plan.priceMonthly <= 0 && plan.priceYearly <= 0;
}

export function priceFor(plan: { priceMonthly: number; priceYearly: number }, cycle: string) {
  return cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
}

/** Months a yearly price saves against paying monthly, rounded down (0 when it saves nothing). */
export function yearlySavingMonths(plan: { priceMonthly: number; priceYearly: number }) {
  if (plan.priceMonthly <= 0 || plan.priceYearly <= 0) return 0;
  return Math.max(0, Math.floor((plan.priceMonthly * 12 - plan.priceYearly) / plan.priceMonthly));
}

/** "29 ر.ع" / "OMR 29" — whole rials without decimals, otherwise three. */
export function formatRial(value: number, lang: "ar" | "en" = "ar") {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(3);
  return lang === "en" ? `OMR ${fixed}` : `${fixed} ر.ع`;
}

export function limitText(value: number | null, lang: "ar" | "en") {
  return value === null ? (lang === "en" ? "Unlimited" : "غير محدود") : String(value);
}
