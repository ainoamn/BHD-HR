import type { Employee } from "@prisma/client";
import { headers } from "next/headers";
import { writeAudit } from "./audit";
import { OMAN_BANKS, cleanAccount, cleanBic } from "./banks";
import type { Bi } from "./i18n";
import { LETTER_KIND, REQUEST_LETTER_KINDS, type LetterKind } from "./letters";
import { findNationality } from "./nationalities";
import { normalizePhone } from "./phone";
import { prisma } from "./prisma";
import { clip, formatDate, parseDateInput, str, todayInputValue } from "./utils";

/** File fields an employee may fill in from the portal while they are still empty; once set, only HR changes them. */
export const SELF_FIELDS = [
  "phone",
  "address",
  "nationality",
  "gender",
  "dateOfBirth",
  "idNumber",
  "idExpiry",
  "passportNumber",
  "passportExpiry",
  "bankBic",
  "bankAccount",
] as const;
export type SelfField = (typeof SELF_FIELDS)[number];
type FileValues = Pick<Employee, SelfField>;

export const SELF_FIELD_LABEL: Record<SelfField, Bi> = {
  phone: { ar: "رقم الهاتف", en: "Phone number" },
  address: { ar: "عنوان السكن", en: "Home address" },
  nationality: { ar: "الجنسية", en: "Nationality" },
  gender: { ar: "الجنس", en: "Gender" },
  dateOfBirth: { ar: "تاريخ الميلاد", en: "Date of birth" },
  idNumber: { ar: "رقم البطاقة الشخصية / بطاقة الإقامة", en: "ID / resident card number" },
  idExpiry: { ar: "انتهاء البطاقة", en: "ID card expiry" },
  passportNumber: { ar: "رقم جواز السفر", en: "Passport number" },
  passportExpiry: { ar: "انتهاء جواز السفر", en: "Passport expiry" },
  bankBic: { ar: "البنك", en: "Bank" },
  bankAccount: { ar: "رقم الحساب البنكي", en: "Bank account number" },
};

/** What each requested letter reads from the employee's file (src/lib/letter-docs.ts). */
export const LETTER_NEEDS: Partial<Record<LetterKind, readonly SelfField[]>> = {
  SALARY_TRANSFER: ["bankBic", "bankAccount"],
  BANK_ACCOUNT: ["address"],
  EMBASSY: ["nationality", "passportNumber", "passportExpiry"],
};

export function missingFields(employee: FileValues, fields: readonly SelfField[] = SELF_FIELDS): SelfField[] {
  return fields.filter((field) => {
    const value = employee[field];
    return value === null || value === undefined || (typeof value === "string" && !value.trim());
  });
}

/** For each letter the portal offers, the file fields it needs that are still empty. */
export function lettersMissing(employee: FileValues) {
  const result: Partial<Record<LetterKind, SelfField[]>> = {};
  for (const kind of REQUEST_LETTER_KINDS) {
    const missing = missingFields(employee, LETTER_NEEDS[kind] || []);
    if (missing.length) result[kind] = missing;
  }
  return result;
}

/** Employee.selfProvided: which fields the employee filled in and declared correct, and when. */
export type SelfMarks = Partial<Record<SelfField, { at: string; via?: string; ip?: string }>>;

export function readSelfMarks(value: unknown): SelfMarks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const marks: SelfMarks = {};
  for (const field of SELF_FIELDS) {
    const mark = (value as Record<string, unknown>)[field] as { at?: unknown; via?: unknown; ip?: unknown } | undefined;
    if (mark && typeof mark.at === "string") {
      marks[field] = { at: mark.at, ...(typeof mark.via === "string" ? { via: mark.via } : {}), ...(typeof mark.ip === "string" ? { ip: mark.ip } : {}) };
    }
  }
  return marks;
}

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  return (a ?? null) === (b ?? null);
}

/** Marks that still hold after HR saves the file: a value HR changed is no longer the employee's own statement. */
export function keptSelfMarks(marks: SelfMarks, before: FileValues, after: Partial<FileValues>) {
  const kept: SelfMarks = {};
  for (const field of Object.keys(marks) as SelfField[]) {
    if (!(field in after) || sameValue(before[field], after[field])) kept[field] = marks[field];
  }
  return kept;
}

const DOC_NUMBER = /^[A-Z0-9-]{4,20}$/;
const err = (ar: string, en: string): { error: Bi } => ({ error: { ar, en } });

function readField(field: SelfField, raw: string): { value: FileValues[SelfField] } | { error: Bi } {
  const label = SELF_FIELD_LABEL[field];
  const today = parseDateInput(todayInputValue())!;
  switch (field) {
    case "phone": {
      const phone = normalizePhone(raw);
      return phone && phone.replace(/\D/g, "").length >= 7 ? { value: clip(phone, 30) } : err("رقم الهاتف غير صحيح", "The phone number is not valid");
    }
    case "address": {
      const address = clip(raw, 300);
      return address && address.length >= 5 ? { value: address } : err("اكتب عنوان السكن كاملاً (المدينة والمنطقة والشارع أو رقم المبنى)", "Write your full home address (city, area, street or building)");
    }
    case "nationality": {
      const nationality = findNationality(raw);
      return nationality ? { value: nationality.code } : err("اختر الجنسية من القائمة", "Choose the nationality from the list");
    }
    case "gender":
      return raw === "MALE" || raw === "FEMALE" ? { value: raw } : err("اختر الجنس", "Choose the gender");
    case "dateOfBirth": {
      const date = parseDateInput(raw);
      const age = date ? (today.getTime() - date.getTime()) / (365.25 * 86_400_000) : 0;
      return date && age >= 14 && age <= 100 ? { value: date } : err("تاريخ الميلاد غير صحيح", "The date of birth is not valid");
    }
    case "idNumber":
    case "passportNumber": {
      const number = raw.replace(/\s/g, "").toUpperCase();
      return DOC_NUMBER.test(number) ? { value: number } : err(`${label.ar} غير صحيح (أحرف وأرقام فقط)`, `${label.en} is not valid (letters and digits only)`);
    }
    case "idExpiry":
    case "passportExpiry": {
      const date = parseDateInput(raw);
      if (!date) return err(`اختر تاريخ ${label.ar}`, `Choose the ${label.en.toLowerCase()} date`);
      if (date < today) return err(`${label.ar} (${formatDate(date)}) مضى. جدّد الوثيقة أولاً ثم أدخل بياناتها الجديدة.`, `${label.en} (${formatDate(date)}) has passed. Renew it first, then enter the new details.`);
      return { value: date };
    }
    case "bankBic": {
      const bic = cleanBic(raw);
      return bic && OMAN_BANKS.some((bank) => bank.bic === bic) ? { value: bic } : err("اختر البنك من القائمة", "Choose the bank from the list");
    }
    case "bankAccount": {
      const account = cleanAccount(raw);
      return account && account.length >= 6 ? { value: account } : err("رقم الحساب البنكي غير صحيح", "The bank account number is not valid");
    }
  }
}

/**
 * The employee's answers for `fields` (form names `self_<field>`), with their declaration (`selfConfirm=1`).
 * `required`: every field must be filled; otherwise empty ones are skipped.
 */
export function readSelfInput(formData: FormData, fields: readonly SelfField[], required: boolean): { values: Partial<FileValues> } | { error: Bi } {
  const values: Partial<Record<SelfField, unknown>> = {};
  for (const field of fields) {
    const raw = (str(formData, `self_${field}`) || "").trim();
    if (!raw) {
      if (required) return err(`أكمل «${SELF_FIELD_LABEL[field].ar}»؛ الخطاب يعتمد عليه`, `Fill in “${SELF_FIELD_LABEL[field].en}”; the letter depends on it`);
      continue;
    }
    const read = readField(field, raw);
    if ("error" in read) return read;
    values[field] = read.value;
  }
  if (Object.keys(values).length && str(formData, "selfConfirm") !== "1") {
    return err("ضع علامة الإقرار بصحة البيانات وتحمّل مسؤوليتها", "Tick the declaration that the details are correct and your responsibility");
  }
  return { values: values as Partial<FileValues> };
}

/**
 * Writes what the employee filled in, only into fields that are still empty, and records it as their own declared statement
 * (Employee.selfProvided and the audit log). Returns the fields actually saved.
 */
export async function saveSelfData(employeeId: string, values: Partial<FileValues>, via: Bi) {
  const head = await headers();
  const ip = clip(head.get("x-forwarded-for")?.split(",")[0]?.trim() || head.get("x-real-ip") || "", 64) || "";
  const current = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!current) return [];
  const fields = missingFields(current, Object.keys(values) as SelfField[]);
  if (!fields.length) return [];
  const at = new Date().toISOString();
  const marks = readSelfMarks(current.selfProvided);
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    data[field] = values[field];
    marks[field] = { at, via: via.ar, ...(ip ? { ip } : {}) };
  }
  await prisma.employee.update({ where: { id: employeeId }, data: { ...data, selfProvided: marks } });
  const names = (lang: "ar" | "en") => fields.map((field) => SELF_FIELD_LABEL[field][lang]).join(lang === "ar" ? "، " : ", ");
  await writeSelfAudit(current, names, via, ip);
  return fields;
}

async function writeSelfAudit(employee: Pick<Employee, "id" | "companyId" | "fullName" | "nameEn">, names: (lang: "ar" | "en") => string, via: Bi, ip: string) {
  await writeAudit({
    companyId: employee.companyId,
    employeeId: employee.id,
    action: "EMPLOYEE_SELF_DATA",
    message:
      `أكمل ${employee.fullName} من بوابته ${names("ar")} (${via.ar}) وأقرّ بصحتها وتحمّل مسؤوليتها${ip ? ` — IP ${ip}` : ""}` +
      ` / ${employee.nameEn || employee.fullName} filled in ${names("en")} (${via.en}) and declared them correct${ip ? ` — IP ${ip}` : ""}`,
  });
}

/** Label of the letter that needed the details, for the record. */
export function viaLetter(kind: LetterKind): Bi {
  return { ar: `لطلب ${LETTER_KIND[kind].label.ar}`, en: `for a ${LETTER_KIND[kind].label.en} request` };
}

export const VIA_PROFILE: Bi = { ar: "من «أكمل بياناتك»", en: "from “Complete your details”" };
