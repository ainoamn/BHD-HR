import type { Bi } from "./i18n";

export const MODULES = ["employees", "employers", "attendance", "salaries", "documents", "calendar", "reports", "activity"] as const;
export type Module = (typeof MODULES)[number];

export const ACTION_LABEL: Record<string, Bi> = {
  view: { ar: "عرض", en: "View" },
  create: { ar: "إضافة", en: "Add" },
  edit: { ar: "تعديل", en: "Edit" },
  delete: { ar: "حذف", en: "Delete" },
  pay: { ar: "صرف", en: "Pay" },
  export: { ar: "تصدير", en: "Export" },
};

export const ACTION_COLUMNS = ["view", "create", "edit", "delete", "pay", "export"] as const;

export const MODULE_ACTIONS: Record<Module, readonly string[]> = {
  employees: ["view", "create", "edit", "delete"],
  employers: ["view", "create", "edit", "delete"],
  attendance: ["view", "create", "edit", "delete"],
  salaries: ["view", "create", "edit", "delete", "pay"],
  documents: ["view", "create", "edit", "delete"],
  calendar: ["view", "create", "edit", "delete"],
  reports: ["view", "export"],
  activity: ["view"],
};

export const MODULE_LABEL: Record<Module, Bi> = {
  employees: { ar: "الموظفون", en: "Employees" },
  employers: { ar: "دفتر العناوين", en: "Address book" },
  attendance: { ar: "الحضور والإجازات", en: "Attendance & leave" },
  salaries: { ar: "الرواتب", en: "Payroll" },
  documents: { ar: "المستندات", en: "Documents" },
  calendar: { ar: "التقويم والتذكيرات", en: "Calendar & reminders" },
  reports: { ar: "التقارير", en: "Reports" },
  activity: { ar: "سجل العمليات", en: "Activity log" },
};

export type Permission = `${Module}.${string}`;

export const ALL_PERMISSIONS: Permission[] = MODULES.flatMap((module) => MODULE_ACTIONS[module].map((action) => `${module}.${action}` as Permission));

const VIEW_ONLY: Permission[] = [...MODULES.map((module) => `${module}.view` as Permission), "reports.export"];

/** ADMIN also manages company settings and members; that right is tied to the role, not to this list. */
export const ROLE_PRESETS: Record<"ADMIN" | "MANAGER" | "VIEWER", Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS,
  VIEWER: VIEW_ONLY,
};

/** Keeps known permissions only, and adds `<module>.view` whenever any other action of that module is granted. */
export function normalizePermissions(input: unknown): Permission[] {
  const wanted = new Set(Array.isArray(input) ? input.map(String) : []);
  for (const module of MODULES) {
    if (MODULE_ACTIONS[module].some((action) => wanted.has(`${module}.${action}`))) wanted.add(`${module}.view`);
  }
  return ALL_PERMISSIONS.filter((permission) => wanted.has(permission));
}

export function permissionsFor(role: string, stored: unknown): Permission[] {
  if (role === "ADMIN" || role === "MANAGER" || role === "VIEWER") return ROLE_PRESETS[role];
  return normalizePermissions(stored);
}

/** Pages a member can open, used for the side navigation. */
export const MODULE_HREF: Record<Module, string> = {
  employees: "/employees",
  employers: "/employers",
  attendance: "/attendance",
  salaries: "/salaries",
  documents: "/documents",
  calendar: "/calendar",
  reports: "/reports",
  activity: "/activity",
};
