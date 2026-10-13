import crypto from "node:crypto";
import { writeAudit } from "./audit";
import type { Channel } from "./delivery";
import { LETTER_KIND, type LetterKind } from "./letters";
import { letterFingerprint, newVerifyToken, nextSignatureNo } from "./letter-seal";
import { normalizePhone } from "./phone";
import { prisma } from "./prisma";
import { clip, isUniqueError } from "./utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** HR-2026-0001: per company and year. */
async function nextRefNo(companyId: string, issuedAt: Date) {
  const prefix = `HR-${issuedAt.getUTCFullYear()}-`;
  const last = await prisma.letter.findFirst({
    where: { companyId, refNo: { startsWith: prefix } },
    orderBy: { refNo: "desc" },
    select: { refNo: true },
  });
  const next = last ? Number(last.refNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(4, "0")}`;
}

export function copyTarget(channel: Channel, employee: { email: string | null; phone: string | null }) {
  if (channel === "EMAIL") return employee.email && EMAIL_PATTERN.test(employee.email.trim()) ? employee.email.trim() : null;
  return normalizePhone(employee.phone);
}

/**
 * Creates the letter already signed electronically by `user`: reference number, the company signature and stamp,
 * the public check token behind the QR code and the content fingerprint. Copies are queued per channel;
 * the caller sends them (sendPendingCopies) once all letters exist.
 */
export async function issueLetter(input: {
  companyId: string;
  employee: { id: string; fullName: string; email: string | null; phone: string | null };
  kind: LetterKind;
  issuedAt: Date;
  subject: string;
  subjectEn: string | null;
  body: string;
  bodyEn: string | null;
  addressee?: string | null;
  addresseeEn?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  /** id null = issued by the system on its own (an automatic request letter). */
  user: { id: string | null; name: string };
  channels: Channel[];
  requestId?: string | null;
}) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { signatoryName: true, signatoryTitle: true, signatureUrl: true, stampUrl: true },
  });
  const deliveries = input.channels
    .map((channel) => ({ channel, target: copyTarget(channel, input.employee) }))
    .filter((item): item is { channel: Channel; target: string } => Boolean(item.target));
  const content = {
    companyId: input.companyId,
    employeeId: input.employee.id,
    kind: input.kind,
    issuedAt: input.issuedAt,
    subject: clip(input.subject, 200) || input.subject.slice(0, 200),
    subjectEn: clip(input.subjectEn || "", 200),
    body: clip(input.body, 8000) || input.body.slice(0, 8000),
    bodyEn: clip(input.bodyEn || "", 8000),
    addressee: clip(input.addressee || "", 200),
    addresseeEn: clip(input.addresseeEn || "", 200),
    signatoryName: clip(input.signatoryName || "", 120) || company?.signatoryName || input.user.name,
    signatoryTitle: clip(input.signatoryTitle || "", 120) || company?.signatoryTitle || null,
    signedByName: input.user.name,
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      const signedAt = new Date();
      const [refNo, signatureNo] = await Promise.all([nextRefNo(input.companyId, input.issuedAt), nextSignatureNo(input.companyId, signedAt)]);
      const letter = await prisma.letter.create({
        data: {
          ...content,
          refNo,
          signatureNo,
          signedAt,
          fingerprint: letterFingerprint({ ...content, refNo, signedAt }),
          signatureUrl: company?.signatureUrl || null,
          stampUrl: company?.stampUrl || null,
          createdById: input.user.id,
          createdByName: input.user.name,
          token: crypto.randomBytes(24).toString("base64url"),
          verifyToken: newVerifyToken(),
          deliveries: { create: deliveries },
          ...(input.requestId ? { request: { connect: { id: input.requestId } } } : {}),
        },
        select: { id: true, refNo: true, token: true },
      });
      const label = LETTER_KIND[input.kind].label;
      await writeAudit({
        companyId: input.companyId,
        userId: input.user.id,
        employeeId: input.employee.id,
        action: "LETTER_ISSUE",
        message: `أصدر «${label.ar}» رقم ${letter.refNo} لـ ${input.employee.fullName} موقّعاً إلكترونياً برقم ${signatureNo} / Issued e-signed “${label.en}” ${letter.refNo} to ${input.employee.fullName}, e-signature ${signatureNo}`,
      });
      return letter;
    } catch (error) {
      if (!isUniqueError(error) || attempt >= 4) throw error;
    }
  }
}

/** Whether an image is still printed on any letter or used by a company, so replacing it doesn't break old letters. */
export async function sealImageInUse(url: string) {
  const [letters, companies] = await Promise.all([
    prisma.letter.count({ where: { OR: [{ signatureUrl: url }, { stampUrl: url }] } }),
    prisma.company.count({ where: { OR: [{ signatureUrl: url }, { stampUrl: url }] } }),
  ]);
  return letters + companies > 0;
}
