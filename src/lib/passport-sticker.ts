import type { Company, Employee, EmployeeDocument, Employer } from "@prisma/client";
import { headerFor } from "@/components/salary-docs";
import { badgeUrl, ensureBadgeToken, qrSvg } from "./badge";
import { DOC_LABEL } from "./constants";
import { describeExpiry } from "./expiry";
import type { Bi } from "./i18n";
import { nationalityName } from "./nationalities";

export type StickerRow = { label: Bi; number: string | null; expiry: Date | null; tone: "red" | "amber" | null };

export type PassportStickerData = {
  id: string;
  name: string;
  nameEn: string | null;
  job: string | null;
  number: string;
  nationality: Bi | null;
  dateOfBirth: Date | null;
  photo: string | null;
  issuer: string;
  issuerEn: string | null;
  logo: string | null;
  phone: string | null;
  rows: StickerRow[];
  qr: string;
};

/** The sticker has room for this many document rows; the soonest expiries win. */
const MAX_ROWS = 7;
const PRIMARY = ["PASSPORT", "RESIDENCE", "ID_CARD"];

type StickerEmployee = Employee & { company: Company; employer: Employer | null; documents: EmployeeDocument[] };

export async function passportStickerData(employee: StickerEmployee, origin: string): Promise<PassportStickerData> {
  const company = employee.company;
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, company);
  const limits = { urgent: company.alertUrgentDays, warning: company.alertWarningDays, early: company.alertEarlyDays };
  const tone = (expiry: Date | null): StickerRow["tone"] => {
    if (!expiry) return null;
    const key = describeExpiry(expiry, limits).key;
    return key === "expired" || key === "today" ? "red" : key === "urgent" || key === "warning" ? "amber" : null;
  };
  const row = (label: Bi, number: string | null, expiry: Date | null): StickerRow | null => (number || expiry ? { label, number, expiry, tone: tone(expiry) } : null);

  const primary = [
    row(DOC_LABEL.PASSPORT, employee.passportNumber, employee.passportExpiry),
    row(DOC_LABEL.RESIDENCE, employee.residenceNumber, employee.residenceExpiry),
    row(DOC_LABEL.ID_CARD, employee.idNumber, employee.idExpiry),
  ].filter((item): item is StickerRow => Boolean(item));

  const latest = new Map<string, EmployeeDocument>();
  for (const doc of employee.documents) {
    if (PRIMARY.includes(doc.type) || !doc.expiryDate || (doc.submittedAt && !doc.reviewedAt)) continue;
    const kept = latest.get(doc.type);
    if (!kept || kept.expiryDate! < doc.expiryDate) latest.set(doc.type, doc);
  }
  const extra = [...latest.values()].map((doc) => row(DOC_LABEL[doc.type] || DOC_LABEL.OTHER, doc.documentNo, doc.expiryDate)!);
  if (employee.contractEnd && !latest.has("CONTRACT")) extra.push(row({ ar: "عقد العمل", en: "Work contract" }, null, employee.contractEnd)!);
  extra.sort((a, b) => a.expiry!.getTime() - b.expiry!.getTime());

  const nationalityAr = nationalityName(employee.nationality, "ar");
  return {
    id: employee.id,
    name: employee.fullName,
    nameEn: employee.nameEn,
    job: [employee.jobTitle, employee.jobTitleEn].filter(Boolean).join(" · ") || null,
    number: employee.employeeNumber,
    nationality: nationalityAr ? { ar: nationalityAr, en: nationalityName(employee.nationality, "en") || nationalityAr } : null,
    dateOfBirth: employee.dateOfBirth,
    photo: employee.photoUrl,
    issuer: header.name,
    issuerEn: header.nameEn && header.nameEn !== header.name ? header.nameEn : null,
    logo: header.logoUrl,
    phone: header.phone,
    rows: [...primary, ...extra].slice(0, MAX_ROWS),
    qr: await qrSvg(badgeUrl(origin, await ensureBadgeToken(employee))),
  };
}
