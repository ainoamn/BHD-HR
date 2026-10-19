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

/**
 * QR as SVG. Pass `logo` (data URL or https/relative image) to place the company mark in the centre;
 * uses high error correction so the code still scans with the logo covering the middle.
 */
export async function qrSvg(text: string, logo?: string | null) {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: logo ? "H" : "M",
    color: { dark: "#092d24", light: "#ffffff" },
  });
  if (!logo) return svg;
  const viewBox = svg.match(/viewBox="([^"]+)"/i)?.[1];
  if (!viewBox) return svg;
  const parts = viewBox.split(/\s+/).map(Number);
  const width = parts[2] || 0;
  const height = parts[3] || 0;
  if (!width || !height) return svg;
  const box = Math.min(width, height) * 0.28;
  const pad = box * 0.12;
  const x = (width - box) / 2;
  const y = (height - box) / 2;
  const safeLogo = logo.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const overlay = `<rect x="${x - pad}" y="${y - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${pad}" fill="#ffffff"/><image href="${safeLogo}" x="${x}" y="${y}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.includes("</svg>") ? svg.replace("</svg>", `${overlay}</svg>`) : svg;
}

/** The employee behind a scanned badge; null for an unknown or retired key. */
export const badgeEmployee = cache((token: string) =>
  lookupByToken(token, (badgeToken) => prisma.employee.findUnique({ where: { badgeToken }, include: { company: true, employer: true } })),
);
