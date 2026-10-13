import crypto from "node:crypto";
import type { Letter } from "@prisma/client";
import { qrSvg } from "./badge";
import { inlineLogo } from "./inline-logo";
import { prisma } from "./prisma";
import { isUniqueError } from "./utils";

/** What the letter sheet prints: the e-signature serial, the QR code to the public check page and the signing details. */
export type LetterSeal = {
  qr: string;
  url: string;
  serial: string | null;
  signedByName: string | null;
  signedAt: Date;
  code: string;
  signature: string | null;
  stamp: string | null;
};

type SealedContent = Pick<
  Letter,
  "companyId" | "employeeId" | "kind" | "refNo" | "issuedAt" | "subject" | "subjectEn" | "body" | "bodyEn" | "addressee" | "addresseeEn" | "signatoryName" | "signatoryTitle"
> & { signedByName: string | null; signedAt: Date | null };

export function newVerifyToken() {
  return crypto.randomBytes(18).toString("base64url");
}

export function verifyUrl(origin: string, token: string) {
  return `${origin}/verify/${token}`;
}

/** SHA-256 over everything that was signed. Cancelling or acknowledging doesn't change it; editing the text would. */
export function letterFingerprint(letter: SealedContent) {
  const content = [
    letter.companyId,
    letter.employeeId,
    letter.kind,
    letter.refNo,
    letter.issuedAt.toISOString(),
    letter.subject,
    letter.subjectEn || "",
    letter.body,
    letter.bodyEn || "",
    letter.addressee || "",
    letter.addresseeEn || "",
    letter.signatoryName || "",
    letter.signatoryTitle || "",
    letter.signedByName || "",
    letter.signedAt ? letter.signedAt.toISOString() : "",
  ];
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** Short form printed on the letter: ABCD-EF12-3456-7890. */
export function fingerprintCode(fingerprint: string | null | undefined) {
  return (fingerprint || "").slice(0, 16).toUpperCase().match(/.{4}/g)?.join("-") || "";
}

/** Next e-signature serial ES-2026-000001 for the company, in the Muscat year of signing. */
export async function nextSignatureNo(companyId: string, signedAt: Date) {
  const prefix = `ES-${new Date(signedAt.getTime() + 4 * 3600_000).getUTCFullYear()}-`;
  const last = await prisma.letter.findFirst({
    where: { companyId, signatureNo: { startsWith: prefix } },
    orderBy: { signatureNo: "desc" },
    select: { signatureNo: true },
  });
  const next = last?.signatureNo ? Number(last.signatureNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(6, "0")}`;
}

/** Letters issued before electronic signing (or before serials) get them the first time they are opened. */
export async function ensureLetterSeal<T extends Letter>(letter: T): Promise<T> {
  if (letter.verifyToken && letter.fingerprint && letter.signedAt && letter.signatureNo) return letter;
  if (!letter.verifyToken || !letter.fingerprint || !letter.signedAt) {
    const signedAt = letter.signedAt || letter.createdAt;
    const signedByName = letter.signedByName || letter.createdByName || letter.signatoryName;
    const fingerprint = letterFingerprint({ ...letter, signedAt, signedByName });
    await prisma.letter.updateMany({
      where: { id: letter.id, verifyToken: null },
      data: { verifyToken: newVerifyToken(), signedAt, signedByName, fingerprint },
    });
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const signatureNo = await nextSignatureNo(letter.companyId, letter.signedAt || letter.createdAt);
      await prisma.letter.updateMany({ where: { id: letter.id, signatureNo: null }, data: { signatureNo } });
      break;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
    }
  }
  const sealed = await prisma.letter.findUnique({
    where: { id: letter.id },
    select: { verifyToken: true, signedAt: true, signedByName: true, fingerprint: true, signatureNo: true },
  });
  return { ...letter, ...sealed } as T;
}

/**
 * Seals the letter if needed and builds its printed seal. `inline` embeds the signature and stamp
 * as data URLs for public pages, where /files needs a session.
 */
export async function sealedLetter<T extends Letter>(input: T, origin: string, inline: boolean): Promise<{ letter: T; seal: LetterSeal }> {
  const letter = await ensureLetterSeal(input);
  const url = verifyUrl(origin, letter.verifyToken!);
  const [qr, signature, stamp] = await Promise.all([
    qrSvg(url),
    inline ? inlineLogo(letter.signatureUrl, letter.companyId) : letter.signatureUrl,
    inline ? inlineLogo(letter.stampUrl, letter.companyId) : letter.stampUrl,
  ]);
  return {
    letter,
    seal: { qr, url, serial: letter.signatureNo, signedByName: letter.signedByName, signedAt: letter.signedAt || letter.createdAt, code: fingerprintCode(letter.fingerprint), signature, stamp },
  };
}
