import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "hr_session";

export const ROLES = ["ADMIN", "VIEWER", "PENDING"] as const;
export type Role = (typeof ROLES)[number];

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

export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const userId = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "PENDING") redirect("/pending");
  return user;
}

export async function requireWriter() {
  const user = await requireUser();
  if (user.role === "VIEWER") redirect("/?error=" + encodeURIComponent("هذه الصلاحية للعرض فقط / View-only access"));
  return user;
}
