import crypto from "node:crypto";
import { writeAudit } from "./audit";
import type { Bi } from "./i18n";
import { prisma } from "./prisma";
import { clip, isUniqueError } from "./utils";

/** Original documents an employee leaves with the company (HeldDocument.type). */
export const HELD_DOC_TYPES = ["PASSPORT", "RESIDENT_CARD", "CIVIL_ID", "DRIVING_LICENCE", "DEGREE", "CERTIFICATE", "EXPERIENCE", "MEDICAL", "MARRIAGE", "BIRTH", "OTHER"] as const;
export type HeldDocType = (typeof HELD_DOC_TYPES)[number];

export const HELD_DOC_LABEL: Record<string, Bi> = {
  PASSPORT: { ar: "جواز السفر", en: "Passport" },
  RESIDENT_CARD: { ar: "بطاقة الإقامة", en: "Resident card" },
  CIVIL_ID: { ar: "البطاقة الشخصية", en: "Civil ID card" },
  DRIVING_LICENCE: { ar: "رخصة القيادة", en: "Driving licence" },
  DEGREE: { ar: "شهادة المؤهل الدراسي", en: "Degree / diploma" },
  CERTIFICATE: { ar: "شهادة مهنية أو تدريبية", en: "Professional / training certificate" },
  EXPERIENCE: { ar: "شهادة خبرة سابقة", en: "Previous experience certificate" },
  MEDICAL: { ar: "شهادة طبية / فحص", en: "Medical certificate" },
  MARRIAGE: { ar: "عقد الزواج", en: "Marriage certificate" },
  BIRTH: { ar: "شهادة الميلاد", en: "Birth certificate" },
  OTHER: { ar: "مستند آخر", en: "Other document" },
};

/** HELD = in the company's safekeeping; OUT = handed back to the employee (until they return it, if dueBack is set). */
export const HELD_STATUS_LABEL: Record<string, Bi> = {
  HELD: { ar: "محفوظ لدى المنشأة", en: "Held by the company" },
  OUT: { ar: "مع الموظف", en: "With the employee" },
};

export const HELD_STATUS_TONE: Record<string, string> = { HELD: "green", OUT: "sky" };

/** IN = the company receives originals from the employee; OUT = the company hands originals to the employee. */
export const CUSTODY_DIRECTION: Record<string, { title: Bi; short: Bi; handed: Bi; received: Bi }> = {
  IN: {
    title: { ar: "استمارة استلام مستندات أصلية", en: "Original Documents Receipt Form" },
    short: { ar: "استلام من الموظف", en: "Received from employee" },
    handed: { ar: "المُسلِّم (الموظف)", en: "Handed by (employee)" },
    received: { ar: "المُستلِم (عن المنشأة)", en: "Received by (company)" },
  },
  OUT: {
    title: { ar: "استمارة تسليم مستندات أصلية", en: "Original Documents Handover Form" },
    short: { ar: "تسليم للموظف", en: "Handed to employee" },
    handed: { ar: "المُسلِّم (عن المنشأة)", en: "Handed by (company)" },
    received: { ar: "المُستلِم (الموظف)", en: "Received by (employee)" },
  },
};

export function heldDocLabel(doc: { type: string; title: string | null }): Bi {
  const base = HELD_DOC_LABEL[doc.type] || HELD_DOC_LABEL.OTHER;
  return doc.title ? { ar: doc.title, en: doc.title } : base;
}

/** DC-2026-0001: per company and year. */
async function nextCustodyRef(companyId: string, at: Date) {
  const prefix = `DC-${at.getUTCFullYear()}-`;
  const last = await prisma.custodyForm.findFirst({ where: { companyId, refNo: { startsWith: prefix } }, orderBy: { refNo: "desc" }, select: { refNo: true } });
  const next = last ? Number(last.refNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(4, "0")}`;
}

export type NewHeldDocument = { type: string; title: string | null; documentNo: string | null; notes?: string | null };

/**
 * Records one receipt (IN) or handover (OUT) form and moves the documents with it, all at once:
 * IN creates the new originals and marks returned ones HELD; OUT marks the chosen ones OUT with their due-back date.
 * Only documents in the opposite state move, so a second click or a stale page can't move them twice.
 */
export async function createCustodyForm(input: {
  companyId: string;
  employee: { id: string; fullName: string };
  direction: "IN" | "OUT";
  /** Existing documents of this employee: returned ones for IN, ones to hand over for OUT. */
  documentIds: string[];
  /** IN only: originals received for the first time. */
  newDocuments?: NewHeldDocument[];
  purpose?: string | null;
  dueBack?: Date | null;
  staffName: string;
  user: { id: string | null; name: string };
  requestId?: string | null;
}): Promise<{ id: string; refNo: string; count: number } | null> {
  const { companyId, employee, direction } = input;
  const from = direction === "IN" ? "OUT" : "HELD";
  const handedByName = direction === "IN" ? employee.fullName : input.staffName;
  const receivedByName = direction === "IN" ? input.staffName : employee.fullName;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const refNo = await nextCustodyRef(companyId, new Date());
      const form = await prisma.$transaction(
        async (tx) => {
          const moving = input.documentIds.length
            ? await tx.heldDocument.findMany({ where: { id: { in: input.documentIds }, companyId, employeeId: employee.id, status: from } })
            : [];
          if (moving.length) {
            const moved = await tx.heldDocument.updateMany({
              where: { id: { in: moving.map((doc) => doc.id) }, status: from },
              data: direction === "IN" ? { status: "HELD", dueBack: null } : { status: "OUT", dueBack: input.dueBack || null },
            });
            if (moved.count !== moving.length) throw new Error("CUSTODY_RACE");
          }
          const created = [];
          for (const doc of input.newDocuments || []) {
            created.push(
              await tx.heldDocument.create({
                data: { companyId, employeeId: employee.id, type: doc.type, title: doc.title, documentNo: doc.documentNo, notes: doc.notes || null, status: "HELD" },
              }),
            );
          }
          const documents = [...moving, ...created];
          if (!documents.length) return null;
          return tx.custodyForm.create({
            data: {
              companyId,
              employeeId: employee.id,
              refNo,
              direction,
              purpose: clip(input.purpose || "", 300),
              dueBack: direction === "OUT" ? input.dueBack || null : null,
              handedByName,
              receivedByName,
              createdById: input.user.id,
              createdByName: input.user.name,
              token: crypto.randomBytes(24).toString("base64url"),
              requestId: input.requestId || null,
              items: { create: documents.map((doc) => ({ documentId: doc.id, label: heldDocLabel(doc).ar, documentNo: doc.documentNo })) },
            },
            select: { id: true, refNo: true, _count: { select: { items: true } } },
          });
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
      if (!form) return null;
      const label = CUSTODY_DIRECTION[direction].short;
      await writeAudit({
        companyId,
        userId: input.user.id,
        employeeId: employee.id,
        action: direction === "IN" ? "CUSTODY_IN" : "CUSTODY_OUT",
        message: `${label.ar}: ${form._count.items} مستند أصلي — ${employee.fullName} (${form.refNo}) / ${label.en}: ${form._count.items} original document(s) — ${employee.fullName} (${form.refNo})`,
      });
      return { id: form.id, refNo: form.refNo, count: form._count.items };
    } catch (error) {
      if (error instanceof Error && error.message === "CUSTODY_RACE") return null;
      if (!isUniqueError(error) || attempt >= 4) throw error;
    }
  }
}

/** Originals handed to employees whose return date has passed. */
export function overdueWhere(companyId: string, now = new Date()) {
  return { companyId, status: "OUT", dueBack: { lt: now } };
}
