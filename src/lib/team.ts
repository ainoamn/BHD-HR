import { redirect } from "next/navigation";
import { getSessionUser, homePath, teamScope } from "./auth";
import type { Bi } from "./i18n";
import { isTeamRole } from "./permissions";

export const ACCOUNT_ROLE_LABEL: Record<string, Bi> = {
  ADMIN: { ar: "مسؤول", en: "Admin" },
  MANAGER: { ar: "مدير الموارد البشرية", en: "HR manager" },
  VIEWER: { ar: "مستخدم — عرض فقط", en: "User — view only" },
  CUSTOM: { ar: "صلاحيات مخصصة", en: "Custom permissions" },
  TEAM_MANAGER: { ar: "مدير فريق", en: "Team manager" },
  EMPLOYER: { ar: "صاحب عمل", en: "Employer" },
  EMPLOYEE: { ar: "موظف", en: "Employee" },
};

/** Every /team page: a signed-in team manager or employer, and the employees they may see. */
export async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login?local=1&next=/team");
  if (user.username && user.mustChangePassword) redirect("/password");
  if (!isTeamRole(user.role)) redirect(homePath(user));
  return { user, scope: await teamScope(user) };
}
