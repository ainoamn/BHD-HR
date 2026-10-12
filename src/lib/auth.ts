import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Permission, type TeamPermission, isTeamRole, permissionsFor, teamPermissionsFor } from "./permissions";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "hr_session";
/** The company (workspace) the user is working in when they belong to more than one. */
export const COMPANY_COOKIE = "hr_company";

/**
 * ADMIN: everything incl. members and company settings. MANAGER: all HR operations. VIEWER: read, print and export.
 * CUSTOM: exactly the permissions stored on the membership. The admin can retune MANAGER and VIEWER per company.
 * EMPLOYEE / TEAM_MANAGER / EMPLOYER: accounts opened for an employee or sponsor; they stay outside the main system.
 */
export const STAFF_ROLES = ["ADMIN", "MANAGER", "VIEWER", "CUSTOM"] as const;
export const ROLES = [...STAFF_ROLES, "TEAM_MANAGER", "EMPLOYER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(value: string) {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/** Where a role lands after signing in, and where it is sent back to from pages it cannot open. */
export function homePath(user: { role: string }) {
  if (isStaffRole(user.role)) return "/";
  return user.role === "EMPLOYEE" ? "/me" : "/team";
}

/** BHD session policy: stay signed in until an explicit sign-out (no idle timeout, no sliding refresh). */
export const SESSION_MAX_AGE = 400 * 24 * 60 * 60;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return "bhd-hr-dev-secret";
}

export function signSession(userId: string) {
  const mac = crypto.createHmac("sha256", authSecret()).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function readSession(token?: string | null) {
  if (!token) return null;
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const userId = token.slice(0, index);
  const mac = token.slice(index + 1);
  const expected = crypto.createHmac("sha256", authSecret()).update(userId).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  return userId;
}

/**
 * The signed-in user scoped to one company. Every query must filter by `companyId` from here;
 * a user only reaches a company through a Membership row.
 */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const userId = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { company: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) return null;
  const memberships = user.memberships.filter((item) => isRole(item.role));
  const wanted = jar.get(COMPANY_COOKIE)?.value;
  const active = memberships.find((item) => item.companyId === wanted) ?? memberships[0];
  if (!active) return null;
  const role = active.role as Role;
  return {
    ...user,
    memberships,
    membershipId: active.id,
    companyId: active.companyId,
    company: active.company,
    role,
    employeeId: active.employeeId,
    employerId: active.employerId,
    permissions: permissionsFor(role, active.permissions, active.company.rolePermissions),
    teamPermissions: teamPermissionsFor(role, active.company.rolePermissions),
  };
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: { permissions: readonly string[] }, permission: Permission) {
  return user.permissions.includes(permission);
}

export function canTeam(user: { teamPermissions: readonly string[] }, permission: TeamPermission) {
  return user.teamPermissions.includes(permission);
}

const DENIED = "ليست لديك صلاحية لهذا الإجراء / You do not have permission for this action";

function denied(back: string) {
  return redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(DENIED)}`);
}

/** For server actions and pages: stops unless the active membership grants `permission`. */
export async function requirePermission(permission: Permission, back = "/") {
  const user = await requireUser();
  if (!can(user, permission)) denied(isStaffRole(user.role) ? back : homePath(user));
  return user;
}

export async function requireAdmin(back = "/settings") {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect(`${isStaffRole(user.role) ? back : homePath(user)}?error=` + encodeURIComponent("هذه الصلاحية للمسؤول فقط / Administrators only"));
  return user;
}

/**
 * The employees a team account looks after: every level of reports under a TEAM_MANAGER (not the manager
 * themself), or the workers an EMPLOYER sponsors. Employees whose service ended are left out.
 */
export const teamEmployeeIds = cache(async (companyId: string, role: string, employeeId: string | null, employerId: string | null) => {
  if (role === "EMPLOYER") {
    if (!employerId) return [];
    const rows = await prisma.employee.findMany({ where: { companyId, employerId, status: { not: "TERMINATED" } }, select: { id: true } });
    return rows.map((row) => row.id);
  }
  if (role !== "TEAM_MANAGER" || !employeeId) return [];
  const all = await prisma.employee.findMany({ where: { companyId, status: { not: "TERMINATED" } }, select: { id: true, managerId: true } });
  const found = new Set<string>();
  let frontier = [employeeId];
  while (frontier.length) {
    const next = all.filter((row) => row.managerId && frontier.includes(row.managerId) && !found.has(row.id) && row.id !== employeeId).map((row) => row.id);
    next.forEach((id) => found.add(id));
    frontier = next;
  }
  return [...found];
});

export function teamScope(user: SessionUser) {
  return teamEmployeeIds(user.companyId, user.role, user.employeeId, user.employerId);
}

/**
 * Staff need `permission` and act on the whole company (scope null). A team account needs `teamPermission`
 * and may only touch the employees in its scope, which every caller must add to its lookup.
 */
export async function requireActor(permission: Permission, teamPermission: TeamPermission | null, back: string) {
  const user = await requireUser();
  if (can(user, permission)) return { user, scope: null as string[] | null };
  if (teamPermission && isTeamRole(user.role) && canTeam(user, teamPermission)) return { user, scope: await teamScope(user) };
  return denied(isStaffRole(user.role) ? back : homePath(user));
}
