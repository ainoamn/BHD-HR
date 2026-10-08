import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Permission, permissionsFor } from "./permissions";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "hr_session";
/** The company (workspace) the user is working in when they belong to more than one. */
export const COMPANY_COOKIE = "hr_company";

/**
 * ADMIN: everything incl. members and company settings. MANAGER: all HR operations. VIEWER: read, print and export.
 * CUSTOM: exactly the permissions stored on the membership.
 */
export const ROLES = ["ADMIN", "MANAGER", "VIEWER", "CUSTOM"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
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

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return "bhd-hr-dev-secret";
}

export function signSession(userId: string) {
  const mac = crypto.createHmac("sha256", secret()).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function readSession(token?: string | null) {
  if (!token) return null;
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const userId = token.slice(0, index);
  const mac = token.slice(index + 1);
  const expected = crypto.createHmac("sha256", secret()).update(userId).digest("base64url");
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
    permissions: permissionsFor(role, active.permissions),
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

const DENIED = "ليست لديك صلاحية لهذا الإجراء / You do not have permission for this action";

/** For server actions and pages: stops unless the active membership grants `permission`. */
export async function requirePermission(permission: Permission, back = "/") {
  const user = await requireUser();
  if (!can(user, permission)) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(DENIED)}`);
  return user;
}

export async function requireAdmin(back = "/settings") {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect(`${back}?error=` + encodeURIComponent("هذه الصلاحية للمسؤول فقط / Administrators only"));
  return user;
}
