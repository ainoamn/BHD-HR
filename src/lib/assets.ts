import type { Bi } from "./i18n";

export const ASSET_CATEGORIES = ["LAPTOP", "PHONE", "VEHICLE", "ACCESS_CARD", "TOOL", "UNIFORM", "FURNITURE", "OTHER"] as const;

export const ASSET_CATEGORY_LABEL: Record<string, Bi> = {
  LAPTOP: { ar: "حاسوب", en: "Laptop" },
  PHONE: { ar: "هاتف", en: "Phone" },
  VEHICLE: { ar: "مركبة", en: "Vehicle" },
  ACCESS_CARD: { ar: "بطاقة دخول / مفتاح", en: "Access card / key" },
  TOOL: { ar: "معدات وأدوات", en: "Tools & equipment" },
  UNIFORM: { ar: "زي موحد", en: "Uniform" },
  FURNITURE: { ar: "أثاث", en: "Furniture" },
  OTHER: { ar: "أخرى", en: "Other" },
};

export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "RETIRED"] as const;

export const ASSET_STATUS_LABEL: Record<string, Bi> = {
  AVAILABLE: { ar: "متاحة", en: "Available" },
  ASSIGNED: { ar: "بعهدة موظف", en: "With an employee" },
  MAINTENANCE: { ar: "في الصيانة", en: "In maintenance" },
  RETIRED: { ar: "مستبعدة", en: "Retired" },
};

export const ASSET_STATUS_TONE: Record<string, string> = { AVAILABLE: "green", ASSIGNED: "sky", MAINTENANCE: "amber", RETIRED: "slate" };

export const ASSET_EVENT_LABEL: Record<string, Bi> = {
  CREATE: { ar: "أُضيفت", en: "Added" },
  ASSIGN: { ar: "سُلّمت إلى", en: "Handed to" },
  RETURN: { ar: "استُلمت من", en: "Returned by" },
  MAINTENANCE: { ar: "أُرسلت للصيانة", en: "Sent to maintenance" },
  AVAILABLE: { ar: "أصبحت متاحة", en: "Made available" },
  RETIRE: { ar: "استُبعدت", en: "Retired" },
};
