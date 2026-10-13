import crypto from "node:crypto";
import type { EmployeeRequest } from "@prisma/client";
import { fingerprintCode } from "./letter-seal";
import { prisma } from "./prisma";
import { SIGNATURE_MAX_BYTES } from "./resignation";
import { isUniqueError } from "./utils";

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The drawn signature as posted by the pad: a PNG data URL within the size limit, else null. */
export function readSignature(value: string | null | undefined) {
  if (!value || !value.startsWith(PNG_PREFIX)) return null;
  const data = value.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 200 || bytes.length > SIGNATURE_MAX_BYTES || !bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return `${PNG_PREFIX}${bytes.toString("base64")}`;
}

type Signed = Pick<EmployeeRequest, "companyId" | "employeeId" | "refNo" | "lastDay" | "signedText" | "signedTextEn" | "signedName" | "signature" | "signedAt">;

/** SHA-256 over everything the employee signed; the decision that follows doesn't change it. */
export function resignationFingerprint(request: Signed) {
  const content = [
    request.companyId,
    request.employeeId,
    request.refNo || "",
    request.lastDay ? request.lastDay.toISOString() : "",
    request.signedText || "",
    request.signedTextEn || "",
    request.signedName || "",
    request.signature ? crypto.createHash("sha256").update(request.signature).digest("hex") : "",
    request.signedAt ? request.signedAt.toISOString() : "",
  ];
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** Short code printed on the document, and whether the stored content still matches what was signed (null = not signed online). */
export function resignationSeal(request: Signed & { fingerprint: string | null }) {
  if (!request.fingerprint || !request.signedAt) return null;
  return { code: fingerprintCode(request.fingerprint), intact: resignationFingerprint(request) === request.fingerprint };
}

/** RS-2026-0001: per company and Muscat year of signing. */
async function nextResignationRef(companyId: string, at: Date) {
  const prefix = `RS-${new Date(at.getTime() + 4 * 3600_000).getUTCFullYear()}-`;
  const last = await prisma.employeeRequest.findFirst({ where: { companyId, refNo: { startsWith: prefix } }, orderBy: { refNo: "desc" }, select: { refNo: true } });
  const next = last?.refNo ? Number(last.refNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(4, "0")}`;
}

/** Files a resignation the employee signed in the portal, numbered and fingerprinted. */
export async function createSignedResignation(input: {
  companyId: string;
  employeeId: string;
  lastDay: Date;
  text: string;
  textEn: string | null;
  signedName: string;
  signature: string;
  signedIp: string | null;
}) {
  for (let attempt = 0; ; attempt += 1) {
    const signedAt = new Date();
    const refNo = await nextResignationRef(input.companyId, signedAt);
    const signed: Signed = {
      companyId: input.companyId,
      employeeId: input.employeeId,
      refNo,
      lastDay: input.lastDay,
      signedText: input.text,
      signedTextEn: input.textEn,
      signedName: input.signedName,
      signature: input.signature,
      signedAt,
    };
    try {
      return await prisma.employeeRequest.create({
        data: { ...signed, companyId: input.companyId, employeeId: input.employeeId, type: "RESIGNATION", signedIp: input.signedIp, fingerprint: resignationFingerprint(signed) },
      });
    } catch (error) {
      if (!isUniqueError(error) || attempt >= 4) throw error;
    }
  }
}
