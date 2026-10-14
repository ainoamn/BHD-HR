import { cleanAccount, cleanBic, OMAN_BANKS } from "./banks";
import { NATIONALITIES, findNationality } from "./nationalities";
import { normalizePhone } from "./phone";

/**
 * Employees from a spreadsheet (Excel .xlsx or CSV): the first row names the columns in Arabic or English (the
 * template has both), every other non-empty row is one employee. Rows are checked here; the server action
 * checks again before creating anything.
 */

export const MAX_IMPORT_ROWS = 500;

type Kind = "text" | "date" | "money" | "nationality" | "gender" | "bank" | "account" | "phone" | "email" | "employerKind";

/**
 * Columns the import reads. `aliases` are other headings for the same data, including those used in
 * Ministry of Labour worker lists, so an exported sheet works without renaming its columns.
 */
export const IMPORT_COLUMNS: { key: string; ar: string; en: string; kind: Kind; required?: boolean; salary?: boolean; aliases?: string[] }[] = [
  {
    key: "fullName",
    ar: "الاسم الكامل",
    en: "Full name",
    kind: "text",
    required: true,
    aliases: ["اسم العامل", "اسم الموظف", "الاسم", "الاسم بالعربي", "الاسم بالعربية", "الاسم العربي", "Worker name", "Employee name", "Name", "Arabic name", "Name Arabic"],
  },
  { key: "nameEn", ar: "الاسم بالإنجليزية", en: "Name in English", kind: "text", aliases: ["الاسم بالانجليزي", "الاسم الانجليزي", "English name", "Name English", "Worker name English"] },
  { key: "nationality", ar: "الجنسية", en: "Nationality", kind: "nationality", aliases: ["البلد", "Country"] },
  { key: "gender", ar: "الجنس", en: "Gender", kind: "gender", aliases: ["النوع", "Sex"] },
  { key: "dateOfBirth", ar: "تاريخ الميلاد", en: "Date of birth", kind: "date", aliases: ["الميلاد", "DOB", "Birth date", "Birthdate"] },
  { key: "phone", ar: "الهاتف", en: "Phone", kind: "phone", aliases: ["رقم الهاتف", "الجوال", "رقم الجوال", "النقال", "رقم النقال", "Mobile", "Mobile number", "GSM", "Phone number", "Tel"] },
  { key: "email", ar: "البريد الإلكتروني", en: "Email", kind: "email", aliases: ["البريد", "الايميل", "E-mail", "Email address"] },
  {
    key: "idNumber",
    ar: "رقم البطاقة",
    en: "ID number",
    kind: "text",
    aliases: ["الرقم المدني", "رقم البطاقة الشخصية", "رقم البطاقة المدنية", "رقم بطاقة المقيم", "رقم بطاقة الاقامة", "Civil number", "Civil No", "Civil ID", "ID No", "National ID", "Resident card number"],
  },
  { key: "idExpiry", ar: "انتهاء البطاقة", en: "ID expiry", kind: "date", aliases: ["تاريخ انتهاء البطاقة", "انتهاء البطاقة الشخصية", "تاريخ انتهاء البطاقة الشخصية", "Civil ID expiry", "ID expiry date", "Card expiry"] },
  { key: "passportNumber", ar: "رقم الجواز", en: "Passport number", kind: "text", aliases: ["رقم جواز السفر", "جواز السفر", "Passport No", "Passport"] },
  { key: "passportExpiry", ar: "انتهاء الجواز", en: "Passport expiry", kind: "date", aliases: ["تاريخ انتهاء الجواز", "انتهاء جواز السفر", "تاريخ انتهاء جواز السفر", "Passport expiry date"] },
  { key: "residenceNumber", ar: "رقم الإقامة", en: "Residence number", kind: "text", aliases: ["Residence No", "Residence permit number"] },
  { key: "residenceExpiry", ar: "انتهاء الإقامة", en: "Residence expiry", kind: "date", aliases: ["تاريخ انتهاء الاقامة", "Residence expiry date"] },
  {
    key: "workPermitNumber",
    ar: "رقم تصريح العمل",
    en: "Work permit number",
    kind: "text",
    aliases: ["رقم ترخيص العمل", "رقم الترخيص", "رقم بطاقة العمل", "رقم بطاقة العمل للعامل", "Work permit No", "Labour card number", "Labour card No", "Labor card number", "Permit number", "Permit No"],
  },
  {
    key: "workPermitExpiry",
    ar: "انتهاء تصريح العمل",
    en: "Work permit expiry",
    kind: "date",
    aliases: ["تاريخ انتهاء تصريح العمل", "تاريخ انتهاء الترخيص", "انتهاء الترخيص", "تاريخ انتهاء بطاقة العمل", "Labour card expiry", "Labor card expiry", "Permit expiry", "Permit expiry date", "Work permit expiry date"],
  },
  { key: "jobTitle", ar: "المسمى الوظيفي", en: "Job title", kind: "text", aliases: ["المهنة", "الوظيفة", "المسمى", "Occupation", "Profession", "Designation", "Position", "Job"] },
  { key: "jobTitleEn", ar: "المسمى بالإنجليزية", en: "Job title in English", kind: "text", aliases: ["المهنة بالانجليزي", "Occupation English", "Profession English"] },
  { key: "department", ar: "القسم", en: "Department", kind: "text", aliases: ["الادارة", "Dept"] },
  {
    key: "joiningDate",
    ar: "تاريخ الالتحاق",
    en: "Joining date",
    kind: "date",
    aliases: ["تاريخ التعيين", "تاريخ الالتحاق بالعمل", "تاريخ بدء العمل", "تاريخ المباشرة", "تاريخ التسجيل", "Date of joining", "Joining", "Hire date", "Hiring date", "Start date", "Employment date"],
  },
  { key: "contractEnd", ar: "نهاية العقد", en: "Contract end", kind: "date", aliases: ["تاريخ انتهاء العقد", "انتهاء العقد", "Contract expiry", "Contract end date"] },
  { key: "basicSalary", ar: "الراتب الأساسي", en: "Basic salary", kind: "money", salary: true, aliases: ["الراتب", "الاجر", "الاجر الاساسي", "Salary", "Basic", "Wage", "Basic wage"] },
  { key: "housingAllowance", ar: "بدل السكن", en: "Housing allowance", kind: "money", salary: true, aliases: ["Housing"] },
  { key: "transportAllowance", ar: "بدل النقل", en: "Transport allowance", kind: "money", salary: true, aliases: ["بدل المواصلات", "Transport"] },
  { key: "otherAllowance", ar: "بدلات أخرى", en: "Other allowances", kind: "money", salary: true },
  { key: "bankBic", ar: "البنك", en: "Bank", kind: "bank", salary: true, aliases: ["اسم البنك", "Bank name"] },
  { key: "bankAccount", ar: "رقم الحساب", en: "Account number", kind: "account", salary: true, aliases: ["رقم الحساب البنكي", "Account No", "IBAN"] },
  {
    key: "employerName",
    ar: "الكفيل",
    en: "Sponsor",
    kind: "text",
    aliases: ["اسم الكفيل", "صاحب العمل", "اسم صاحب العمل", "اسم المنشاه", "المنشاه", "Sponsor name", "Employer", "Employer name", "Establishment name", "Company name"],
  },
  { key: "employerNameEn", ar: "الكفيل بالإنجليزية", en: "Sponsor in English", kind: "text", aliases: ["اسم الكفيل بالانجليزي", "Employer name English", "Sponsor name English"] },
  {
    key: "employerIdNumber",
    ar: "رقم الكفيل",
    en: "Sponsor number",
    kind: "text",
    aliases: ["السجل التجاري", "رقم السجل التجاري", "رقم المنشاه", "رقم صاحب العمل", "الرقم المدني للكفيل", "CR number", "CR No", "Commercial registration", "Employer number", "Establishment number", "Sponsor ID"],
  },
  { key: "employerKind", ar: "نوع الكفيل", en: "Sponsor type", kind: "employerKind", aliases: ["نوع صاحب العمل", "Employer type"] },
];

export type ImportValues = Record<string, string>;
export type ExistingEmployee = { id: string; fullName: string; employeeNumber: string };
export type ImportRow = { line: number; values: ImportValues; errors: string[]; existing?: ExistingEmployee | null };

const normal = (value: string) => value.replace(/[\s_\-*:().#]+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
const HEADER_MAP = new Map<string, string>(
  IMPORT_COLUMNS.flatMap((column) => [column.key, column.ar, column.en, ...(column.aliases ?? [])].map((name) => [normal(name), column.key] as [string, string])),
);

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

const LONG_TEXT = new Set(["fullName", "nameEn", "employerName", "employerNameEn"]);

/** COMPANY or PERSON from "شركة", "فرد", "Individual"...; "" when the text says neither. */
export function readEmployerKind(value: string) {
  const text = normal(value);
  if (!text) return "";
  if (text === "company" || text === "person") return text.toUpperCase();
  if (/شركه|منشاه|مؤسسه|company|establishment|corporate|llc/.test(text)) return "COMPANY";
  if (/فرد|شخص|افراد|individual|person|private/.test(text)) return "PERSON";
  return "";
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
      case "employerKind": {
        const kind = readEmployerKind(text);
        if (kind) values[column.key] = kind;
        break;
      }
      default:
        values[column.key] = text.slice(0, LONG_TEXT.has(column.key) ? 150 : 80);
    }
  }
  if (values.fullName && values.fullName.length < 2) errors.push("الاسم قصير جداً / Name is too short");
  return { line, values, errors };
}

/** The column key of each header cell; a key is used once, by its first column. */
export function headerKeys(header: string[]) {
  const used = new Set<string>();
  return header.map((cell) => {
    const key = matchHeader(String(cell ?? ""));
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

/** Exported sheets often start with a title or company rows: the header is the row (of the first 15) naming the most columns. */
export function findHeaderRow(table: string[][]) {
  let best = 0;
  let bestCount = 0;
  table.slice(0, 15).forEach((row, index) => {
    const count = headerKeys(row ?? []).filter(Boolean).length;
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best;
}

/**
 * Header row + data rows → checked rows. Empty rows are skipped; the same ID or passport twice in the file is
 * an error on the later row. `keys` (one per header cell) replaces the automatic header matching, for columns
 * the AI recognised.
 */
export function readTable(table: string[][], options: { headerRow?: number; keys?: (string | null)[] } = {}) {
  const headerRow = options.headerRow ?? findHeaderRow(table);
  const header = table[headerRow] ?? [];
  const body = table.slice(headerRow + 1);
  const keys = options.keys ?? headerKeys(header);
  if (!keys.includes("fullName") && !keys.includes("nameEn")) return { rows: [] as ImportRow[], missingName: true, ignored: [] as string[] };
  const ignored = header.filter((cell, index) => String(cell ?? "").trim() && !keys[index]).map(String);
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  body.forEach((cells, index) => {
    if (!cells?.some((cell) => String(cell ?? "").trim())) return;
    const raw: ImportValues = {};
    keys.forEach((key, column) => {
      if (key && raw[key] === undefined) raw[key] = String(cells[column] ?? "");
    });
    const filled = keys.map((key, column) => (key && String(cells[column] ?? "").trim() ? column : -1)).filter((column) => column >= 0);
    if (filled.length && filled.every((column) => matchHeader(String(cells[column])) === keys[column])) return;
    if (!raw.fullName?.trim()) {
      if (Object.values(raw).filter((value) => value.trim()).length <= 1) return;
      if (raw.nameEn?.trim()) raw.fullName = raw.nameEn;
    }
    const row = checkRow(raw, headerRow + index + 2);
    for (const key of ["idNumber", "passportNumber", "workPermitNumber"]) {
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
