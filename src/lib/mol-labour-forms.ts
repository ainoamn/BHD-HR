/**
 * Official Ministry of Labour (Oman) printouts from the e-services portal
 * (mol.gov.om / Manpower) that the HR import recognises for bulk employee intake.
 */

import type { LabourWorker } from "@/lib/ai";

export const MOL_LABOUR_FORM = {
  REGISTER_WORKER: {
    ar: "تسجيل بيانات العامل",
    en: "Registering worker details",
  },
  WORK_PERMIT: {
    ar: "تصريح مزاولة العمل",
    en: "Work permit / labour clearance",
  },
  LABOUR_CARD: {
    ar: "بطاقة العمل",
    en: "Labour card",
  },
  WORKER_LIST: {
    ar: "قائمة عمال المنشأة",
    en: "Establishment worker list",
  },
  CONTRACT: {
    ar: "عقد عمل",
    en: "Employment contract",
  },
  RENEWAL: {
    ar: "تجديد بيانات القوى العاملة",
    en: "Workforce data renewal",
  },
  UNKNOWN: {
    ar: "مستند وزارة العمل",
    en: "Ministry of Labour document",
  },
} as const;

export type MolLabourFormKind = keyof typeof MOL_LABOUR_FORM;

const FORM_RULES: { kind: MolLabourFormKind; re: RegExp }[] = [
  { kind: "REGISTER_WORKER", re: /تسجيل\s*بيانات\s*العامل|Registering\s*Worker|Worker\s*Details/i },
  { kind: "RENEWAL", re: /تجديد\s*بيانات|Renewal|تجديد\s*القوى/i },
  { kind: "WORK_PERMIT", re: /تصريح\s*مزاولة\s*العمل|تصريح\s*العمل|Work\s*Permit|Labour\s*Clearance|Labor\s*Clearance/i },
  { kind: "LABOUR_CARD", re: /بطاقة\s*العمل|Labour\s*Card|Labor\s*Card/i },
  { kind: "WORKER_LIST", re: /قائمة\s*(?:ال)?عمال|كشف\s*(?:ال)?عمال|Worker\s*List|Manpower\s*List|Establishment\s*Workers/i },
  { kind: "CONTRACT", re: /عقد\s*عمل|Employment\s*Contract|عقد\s*التوظيف/i },
];

/** Detect which MoL portal printout this is from the AI title or extracted text. */
export function detectMolLabourForm(titleOrText: string): MolLabourFormKind {
  const sample = titleOrText.slice(0, 4000);
  for (const rule of FORM_RULES) if (rule.re.test(sample)) return rule.kind;
  if (/وزارة\s*العمل|Ministry\s*of\s*Labour|Ministry\s*of\s*Labor|Manpower/i.test(sample)) return "UNKNOWN";
  return "UNKNOWN";
}

export function molLabourFormLabel(kind: MolLabourFormKind, lang: "ar" | "en") {
  return MOL_LABOUR_FORM[kind][lang];
}

/**
 * After AI extraction: Omanis keep civil-ID fields; expatriates keep residence/visa/permit.
 * Clears fields that do not apply so bulk save does not store noise.
 */
export function applyMolLabourWorkerRules(worker: LabourWorker): LabourWorker {
  const next = { ...worker };
  if (next.nationality === "OM") {
    next.residenceNumber = "";
    next.residenceExpiry = "";
    next.visaNumber = "";
    next.visaExpiry = "";
    next.workPermitNumber = "";
    next.workPermitExpiry = "";
    next.arrivalDate = "";
    next.passportNumber = next.passportNumber || "";
  } else if (next.nationality && next.nationality !== "OM") {
    if (!next.residenceNumber && next.idNumber) next.residenceNumber = next.idNumber;
  }
  return next;
}

export function summarizeMolWorkers(workers: { nationality?: string }[]) {
  let omani = 0;
  let expat = 0;
  let unknown = 0;
  for (const worker of workers) {
    if (worker.nationality === "OM") omani += 1;
    else if (worker.nationality) expat += 1;
    else unknown += 1;
  }
  return { omani, expat, unknown, total: workers.length };
}
