import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { cache } from "react";
import { prisma } from "./prisma";
import { lookupByToken } from "./rate-limit";

/** 16 random bytes (22 characters) keep the QR code small enough to scan from a printed card. */
export function newBadgeToken() {
  return randomBytes(16).toString("base64url");
}

export function badgeUrl(origin: string, token: string) {
  return `${origin}/id/${token}`;
}

/** The employee's badge key, created on first use for employees added before badges existed. */
export async function ensureBadgeToken(employee: { id: string; badgeToken: string | null }) {
  if (employee.badgeToken) return employee.badgeToken;
  const token = newBadgeToken();
  await prisma.employee.updateMany({ where: { id: employee.id, badgeToken: null }, data: { badgeToken: token } });
  return (await prisma.employee.findUnique({ where: { id: employee.id }, select: { badgeToken: true } }))?.badgeToken ?? token;
}

export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#092d24", light: "#ffffff" } });
}

/** The employee behind a scanned badge; null for an unknown or retired key. */
export const badgeEmployee = cache((token: string) =>
  lookupByToken(token, (badgeToken) => prisma.employee.findUnique({ where: { badgeToken }, include: { company: true, employer: true } })),
);
