import type { Bi } from "./i18n";

export const MODULES = [
  "employees",
  "employers",
  "attendance",
  "salaries",
  "documents",
  "calendar",
  "tasks",
  "letters",
  "recruitment",
  "performance",
  "assets",
  "expenses",
  "reports",
  "activity",
] as const;
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
  tasks: ["view", "create", "edit", "delete"],
  letters: ["view", "create", "edit", "delete"],
  recruitment: ["view", "create", "edit", "delete"],
  performance: ["view", "create", "edit", "delete"],
  assets: ["view", "create", "edit", "delete"],
  expenses: ["view", "create", "edit", "delete", "pay"],
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
  tasks: { ar: "المهام والملاحظات", en: "Tasks & notes" },
  letters: { ar: "الإنذارات والخطابات", en: "Warnings & letters" },
  recruitment: { ar: "التوظيف", en: "Recruitment" },
  performance: { ar: "تقييم الأداء", en: "Performance reviews" },
  assets: { ar: "العُهد والأصول", en: "Assets & custody" },
  expenses: { ar: "المصروفات", en: "Expenses" },
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

/**
 * People who were given an account because they are an employee or a sponsor. They never open the main system:
 * EMPLOYEE gets the personal portal; TEAM_MANAGER (their reports) and EMPLOYER (their sponsored workers) get /team.
 */
export const TEAM_ROLES = ["TEAM_MANAGER", "EMPLOYER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_PERMISSIONS = [
  "team.attendance.view",
  "team.attendance.create",
  "team.leave.approve",
  "team.documents.view",
  "team.salaries.view",
  "team.expenses.approve",
  "team.performance.view",
] as const;
export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const TEAM_PERMISSION_LABEL: Record<TeamPermission, Bi> = {
  "team.attendance.view": { ar: "عرض الحضور والإجازات والأرصدة", en: "View attendance, leave and balances" },
  "team.attendance.create": { ar: "تسجيل غياب أو إجازة", en: "Record an absence or leave" },
  "team.leave.approve": { ar: "الموافقة على طلبات الإجازة", en: "Approve leave requests" },
  "team.documents.view": { ar: "عرض الوثائق وتواريخ انتهائها", en: "View documents and expiry dates" },
  "team.salaries.view": { ar: "عرض الرواتب", en: "View salaries" },
  "team.expenses.approve": { ar: "اعتماد طلبات المصروفات", en: "Approve expense claims" },
  "team.performance.view": { ar: "عرض تقييمات الأداء", en: "View performance reviews" },
};

export const TEAM_PRESETS: Record<TeamRole, TeamPermission[]> = {
  TEAM_MANAGER: ["team.attendance.view", "team.leave.approve", "team.documents.view", "team.expenses.approve", "team.performance.view"],
  EMPLOYER: ["team.attendance.view", "team.attendance.create", "team.documents.view", "team.salaries.view"],
};

/** Roles whose permissions the admin can change for the whole company. ADMIN keeps everything; CUSTOM is set per member. */
export const TUNABLE_ROLES = ["MANAGER", "VIEWER", "TEAM_MANAGER", "EMPLOYER"] as const;
export type TunableRole = (typeof TUNABLE_ROLES)[number];
export type RolePermissionMap = Partial<Record<TunableRole, string[]>>;

export function isTeamRole(role: string): role is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(role);
}

export function normalizeTeamPermissions(input: unknown): TeamPermission[] {
  const wanted = new Set(Array.isArray(input) ? input.map(String) : []);
  if (wanted.has("team.attendance.create") || wanted.has("team.leave.approve")) wanted.add("team.attendance.view");
  return TEAM_PERMISSIONS.filter((permission) => wanted.has(permission));
}

export function readRoleMap(value: unknown): RolePermissionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: RolePermissionMap = {};
  for (const role of TUNABLE_ROLES) {
    const list = (value as Record<string, unknown>)[role];
    if (Array.isArray(list)) map[role] = list.map(String);
  }
  return map;
}

/** The main-system permissions a preset role has in this company. */
export function rolePreset(role: "ADMIN" | "MANAGER" | "VIEWER", map: RolePermissionMap = {}): Permission[] {
  if (role === "ADMIN") return ALL_PERMISSIONS;
  return map[role] ? normalizePermissions(map[role]) : ROLE_PRESETS[role];
}

export function teamPreset(role: TeamRole, map: RolePermissionMap = {}): TeamPermission[] {
  return map[role] ? normalizeTeamPermissions(map[role]) : TEAM_PRESETS[role];
}

export function permissionsFor(role: string, stored: unknown, companyRoles?: unknown): Permission[] {
  if (role === "ADMIN" || role === "MANAGER" || role === "VIEWER") return rolePreset(role, readRoleMap(companyRoles));
  if (role === "CUSTOM") return normalizePermissions(stored);
  return [];
}

export function teamPermissionsFor(role: string, companyRoles?: unknown): TeamPermission[] {
  return isTeamRole(role) ? teamPreset(role, readRoleMap(companyRoles)) : [];
}

/** Pages a member can open, used for the side navigation. */
export const MODULE_HREF: Record<Module, string> = {
  employees: "/employees",
  employers: "/employers",
  attendance: "/attendance",
  salaries: "/salaries",
  documents: "/documents",
  calendar: "/calendar",
  tasks: "/tasks",
  letters: "/letters",
  recruitment: "/recruitment",
  performance: "/performance",
  assets: "/assets",
  expenses: "/expenses",
  reports: "/reports",
  activity: "/activity",
};
