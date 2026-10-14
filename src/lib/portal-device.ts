import crypto from "crypto";
import { cookies } from "next/headers";
import { authSecret, getSessionUser, isStaffRole } from "./auth";

/**
 * New-device check for portal links: the first time a link opens on a browser, the employee types the last 4
 * characters of their ID number (or passport when there is no ID). The browser then keeps a signed cookie, scoped
 * to that portal's path, for 180 days. Renewing the link invalidates every remembered device. Signed-in staff of
 * the same company and the employee's own signed-in account skip the check. Employees with neither number on file,
 * and companies that turned the check off, are not asked.
 */
export const DEVICE_COOKIE = "hr_pdev";
export const DEVICE_DAYS = 180;

type PortalPerson = { id: string; companyId: string; portalToken: string | null; idNumber: string | null; passportNumber: string | null; company: { portalDeviceCheck: boolean } };

const lastFour = (value: string | null) => {
  const clean = (value || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return clean.length >= 4 ? clean.slice(-4) : null;
};

/** What the employee is asked for; null when there is nothing on file to ask. */
export function deviceChallenge(employee: Pick<PortalPerson, "idNumber" | "passportNumber">) {
  const id = lastFour(employee.idNumber);
  if (id) return { kind: "ID" as const, answer: id };
  const passport = lastFour(employee.passportNumber);
  if (passport) return { kind: "PASSPORT" as const, answer: passport };
  return null;
}

export function answerMatches(expected: string, given: string) {
  const left = Buffer.from(expected.toUpperCase());
  const right = Buffer.from(given.replace(/[^0-9a-z]/gi, "").toUpperCase());
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function deviceProof(employee: Pick<PortalPerson, "id" | "portalToken">) {
  return crypto.createHmac("sha256", authSecret()).update(`portal-device:${employee.id}:${employee.portalToken}`).digest("base64url");
}

export async function deviceTrusted(employee: PortalPerson) {
  if (!employee.company.portalDeviceCheck || !deviceChallenge(employee)) return true;
  const cookie = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (cookie) {
    const left = Buffer.from(cookie);
    const right = Buffer.from(deviceProof(employee));
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return true;
  }
  const session = await getSessionUser();
  if (session && (session.employeeId === employee.id || (isStaffRole(session.role) && session.companyId === employee.companyId))) return true;
  return false;
}

/** Remembers this browser for the portal; called only from the verification POST. */
export async function rememberDevice(employee: Pick<PortalPerson, "id" | "portalToken">) {
  (await cookies()).set(DEVICE_COOKIE, deviceProof(employee), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/portal/${employee.portalToken}`,
    maxAge: DEVICE_DAYS * 86400,
  });
}
