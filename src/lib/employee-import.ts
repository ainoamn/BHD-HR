import { cleanAccount, cleanBic, OMAN_BANKS } from "./banks";
import { NATIONALITIES, findNationality } from "./nationalities";
import { normalizePhone } from "./phone";

/**
 * Employees from a spreadsheet (Excel .xlsx or CSV): the first row names the columns in Arabic or English (the
 * template has both), every other non-empty row is one employee. Rows are checked here; the server action
 * checks again before creating anything.
 */

export const MAX_IMPORT_ROWS = 500;

type Kind = "text" | "date" | "money" | "nationality" | "gender" | "bank" | "account" | "phone" | "email";

export const IMPORT_COLUMNS: { key: string; ar: string; en: string; kind: Kind; required?: boolean; salary?: boolean }[] = [
  { key: "fullName", ar: "الاسم الكامل", en: "Full name", kind: "text", required: true },
  { key: "nameEn", ar: "الاسم بالإنجليزية", en: "Name in English", kind: "text" },
  { key: "nationality", ar: "الجنسية", en: "Nationality", kind: "nationality" },
  { key: "gender", ar: "الجنس", en: "Gender", kind: "gender" },
  { key: "dateOfBirth", ar: "تاريخ الميلاد", en: "Date of birth", kind: "date" },
  { key: "phone", ar: "الهاتف", en: "Phone", kind: "phone" },
  { key: "email", ar: "البريد الإلكتروني", en: "Email", kind: "email" },
  { key: "idNumber", ar: "رقم البطاقة", en: "ID number", kind: "text" },
  { key: "idExpiry", ar: "انتهاء البطاقة", en: "ID expiry", kind: "date" },
  { key: "passportNumber", ar: "رقم الجواز", en: "Passport number", kind: "text" },
  { key: "passportExpiry", ar: "انتهاء الجواز", en: "Passport expiry", kind: "date" },
  { key: "residenceNumber", ar: "رقم الإقامة", en: "Residence number", kind: "text" },
  { key: "residenceExpiry", ar: "انتهاء الإقامة", en: "Residence expiry", kind: "date" },
  { key: "jobTitle", ar: "المسمى الوظيفي", en: "Job title", kind: "text" },
  { key: "department", ar: "القسم", en: "Department", kind: "text" },
  { key: "joiningDate", ar: "تاريخ الالتحاق", en: "Joining date", kind: "date" },
  { key: "contractEnd", ar: "نهاية العقد", en: "Contract end", kind: "date" },
  { key: "basicSalary", ar: "الراتب الأساسي", en: "Basic salary", kind: "money", salary: true },
  { key: "housingAllowance", ar: "بدل السكن", en: "Housing allowance", kind: "money", salary: true },
  { key: "transportAllowance", ar: "بدل النقل", en: "Transport allowance", kind: "money", salary: true },
  { key: "otherAllowance", ar: "بدلات أخرى", en: "Other allowances", kind: "money", salary: true },
  { key: "bankBic", ar: "البنك", en: "Bank", kind: "bank", salary: true },
  { key: "bankAccount", ar: "رقم الحساب", en: "Account number", kind: "account", salary: true },
];

export type ImportValues = Record<string, string>;
export type ImportRow = { line: number; values: ImportValues; errors: string[] };

const normal = (value: string) => value.replace(/[\s_\-*:]+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
const HEADER_MAP = new Map<string, string>(IMPORT_COLUMNS.flatMap((column) => [[normal(column.key), column.key], [normal(column.ar), column.key], [normal(column.en), column.key]]));

/** The column a header names; "الاسم الكامل / Full name" style headers match either half. */
export function matchHeader(header: string) {
  const parts = [header, ...header.split(/[/|]/)].map((part) => normal(part)).filter(Boolean);
  for (const part of parts) {
    const key = HEADER_MAP.get(part);
    if (key) return key;
  }
  return null;
}

/** A spreadsheet date: a real date, an Excel serial number, YYYY-MM-DD or DD/MM/YYYY. "" when unreadable. */
export function readDate(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  let parts: [number, number, number] | null = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  if (!parts) {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
    if (match) parts = [Number(match[3]), Number(match[2]), Number(match[1])];
  }
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** "India" for "Indian", "Pakistan" for "Pakistani": the one nationality whose English name starts with the text. */
function nationalityByPrefix(value: string) {
  const text = normal(value);
  if (text.length < 4) return null;
  const matches = NATIONALITIES.filter((item) => normal(item.en).startsWith(text));
  return matches.length === 1 ? matches[0] : null;
}

function readBank(value: string) {
  const text = value.trim();
  if (!text) return "";
  const bic = cleanBic(text);
  if (bic) return bic;
  const bank = OMAN_BANKS.find((item) => normal(item.ar) === normal(text) || normal(item.en) === normal(text));
  return bank ? bank.bic : null;
}

/** Cleans one row; errors are in Arabic and English for the preview. */
export function checkRow(raw: ImportValues, line: number): ImportRow {
  const values: ImportValues = {};
  const errors: string[] = [];
  for (const column of IMPORT_COLUMNS) {
    const text = (raw[column.key] ?? "").toString().trim();
    if (!text) {
      if (column.required) errors.push(`${column.ar} مطلوب / ${column.en} is required`);
      continue;
    }
    switch (column.kind) {
      case "date": {
        const date = readDate(text);
        if (date === null) errors.push(`${column.ar}: تاريخ غير مفهوم / ${column.en}: unreadable date "${text}"`);
        else values[column.key] = date;
        break;
      }
      case "money": {
        const amount = Number(text.replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) errors.push(`${column.ar}: مبلغ غير صحيح / ${column.en}: invalid amount`);
        else values[column.key] = String(Math.round(amount * 1000) / 1000);
        break;
      }
      case "nationality": {
        const found = findNationality(text) || nationalityByPrefix(text);
        if (!found) errors.push(`${column.ar}: غير معروفة "${text}" / ${column.en}: unknown`);
        else values[column.key] = found.code;
        break;
      }
      case "gender": {
        const value = normal(text);
        if (["male", "m", "ذكر"].includes(value)) values[column.key] = "MALE";
        else if (["female", "f", "انثي", "انثى"].includes(value)) values[column.key] = "FEMALE";
        else errors.push(`${column.ar}: ذكر أو أنثى / ${column.en}: male or female`);
        break;
      }
      case "bank": {
        const bic = readBank(text);
        if (!bic) errors.push(`${column.ar}: غير معروف "${text}" / ${column.en}: unknown bank`);
        else values[column.key] = bic;
        break;
      }
      case "account": {
        const account = cleanAccount(text);
        if (account) values[column.key] = account;
        break;
      }
      case "phone": {
        const phone = normalizePhone(text);
        if (phone) values[column.key] = phone.slice(0, 30);
        break;
      }
      case "email": {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors.push(`${column.ar}: غير صحيح / ${column.en}: invalid`);
        else values[column.key] = text.slice(0, 120);
        break;
      }
      default:
        values[column.key] = text.slice(0, column.key === "fullName" || column.key === "nameEn" ? 150 : 80);
    }
  }
  if (values.fullName && values.fullName.length < 2) errors.push("الاسم قصير جداً / Name is too short");
  return { line, values, errors };
}

/**
 * Header row + data rows → checked rows. Empty rows are skipped; the same ID or passport twice in the file is
 * an error on the later row.
 */
export function readTable(table: string[][]) {
  const [header = [], ...body] = table;
  const keys = header.map((cell) => matchHeader(String(cell ?? "")));
  if (!keys.includes("fullName")) return { rows: [] as ImportRow[], missingName: true, ignored: [] as string[] };
  const ignored = header.filter((cell, index) => String(cell ?? "").trim() && !keys[index]).map(String);
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  body.forEach((cells, index) => {
    if (!cells.some((cell) => String(cell ?? "").trim())) return;
    const raw: ImportValues = {};
    keys.forEach((key, column) => {
      if (key && raw[key] === undefined) raw[key] = String(cells[column] ?? "");
    });
    const row = checkRow(raw, index + 2);
    for (const key of ["idNumber", "passportNumber"]) {
      const value = row.values[key]?.toUpperCase();
      if (!value) continue;
      const first = seen.get(`${key}:${value}`);
      if (first) row.errors.push(`مكرر مع السطر ${first} / Same as line ${first}`);
      else seen.set(`${key}:${value}`, row.line);
    }
    rows.push(row);
  });
  return { rows: rows.slice(0, MAX_IMPORT_ROWS), missingName: false, ignored, tooMany: rows.length > MAX_IMPORT_ROWS };
}

/** Minimal CSV reader: commas or semicolons, quoted fields with "" escapes, a UTF-8 BOM is dropped. */
export function parseCsv(text: string) {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
