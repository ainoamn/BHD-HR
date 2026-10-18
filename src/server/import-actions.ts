"use server";

import ExcelJS from "exceljs";
import { aiMapImportColumns } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, checkRow, findHeaderRow, headerKeys, parseCsv, readTable, type ImportRow, type ImportValues } from "@/lib/employee-import";
import { findExistingEmployees, intakeContext, saveIntake } from "@/lib/employee-intake";
import { prisma } from "@/lib/prisma";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { aiOpen, fitsLimit, limitMessage } from "@/lib/subscription";

const MAX_FILE = 5 * 1024 * 1024;

export type ImportPreview = {
  rows: ImportRow[];
  ignored: string[];
  /** Columns the AI recognised: the heading in the file and the field it was read as. */
  aiColumns?: { header: string; key: string }[];
  tooMany?: boolean;
  error?: string;
  fileName?: string;
  /** No sponsor column in the file; the user may assign one sponsor to every row. */
  needsSponsor?: boolean;
  sponsors?: { id: string; name: string }[];
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

async function readSheet(file: File): Promise<string[][]> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(bytes.toString("utf8"));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = book.worksheets.find((item) => item.state === "visible" && item.actualRowCount > 0) || book.worksheets[0];
  if (!sheet) return [];
  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cells[column - 1] = cellText(cell.value).trim();
    });
    table[number - 1] = Array.from(cells, (cell) => cell ?? "");
  });
  return Array.from(table, (row) => row ?? []);
}

/** Headings the built-in names did not recognise, read by the AI from the heading and a few values under it. */
async function aiKeys(header: string[], body: string[][], keys: (string | null)[]) {
  const unknown = header.map((cell, index) => (String(cell ?? "").trim() && !keys[index] ? index : -1)).filter((index) => index >= 0);
  if (!unknown.length) return { keys, aiColumns: [] };
  const used = new Set(keys.filter(Boolean));
  const fields = IMPORT_COLUMNS.filter((column) => !used.has(column.key)).map(({ key, ar, en }) => ({ key, ar, en }));
  const samples = unknown.map((index) =>
    body
      .map((row) => String(row?.[index] ?? "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((value) => value.slice(0, 60)),
  );
  const mapped = await aiMapImportColumns({ fields, headers: unknown.map((index) => String(header[index]).slice(0, 80)), samples });
  const next = [...keys];
  const aiColumns: { header: string; key: string }[] = [];
  mapped.forEach((key, position) => {
    if (!key || used.has(key)) return;
    used.add(key);
    next[unknown[position]] = key;
    aiColumns.push({ header: String(header[unknown[position]]), key });
  });
  return { keys: next, aiColumns };
}

/** Step 1: reads the uploaded file and returns every row checked, without saving anything. */
export async function previewEmployeeImport(_previous: ImportPreview | null, formData: FormData): Promise<ImportPreview> {
  const user = await requirePermission("employees.create", "/employees");
  const { lang, t } = await getI18n();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { rows: [], ignored: [], error: t("اختر ملف Excel أو CSV", "Choose an Excel or CSV file") };
  if (file.size > MAX_FILE) return { rows: [], ignored: [], error: t("الملف أكبر من 5 ميجابايت", "The file is larger than 5 MB") };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { rows: [], ignored: [], error: t("الصيغ المقبولة: ‎.xlsx و ‎.csv", "Accepted formats: .xlsx and .csv") };
  let table: string[][];
  try {
    table = await readSheet(file);
  } catch {
    return { rows: [], ignored: [], error: t("تعذرت قراءة الملف. احفظه بصيغة ‎.xlsx أو ‎.csv وحاول مجدداً.", "Could not read the file. Save it as .xlsx or .csv and try again.") };
  }
  const headerRow = findHeaderRow(table);
  const header = table[headerRow] ?? [];
  let keys = headerKeys(header);
  let aiColumns: { header: string; key: string }[] = [];
  if (await aiOpen(user.companyId)) {
    try {
      ({ keys, aiColumns } = await aiKeys(header, table.slice(headerRow + 1, headerRow + 12), keys));
    } catch (error) {
      console.error("AI column mapping failed", error);
    }
  }
  const result = readTable(table, { headerRow, keys });
  if (result.missingName) {
    return {
      rows: [],
      ignored: [],
      error: t("لم يُعثر على عمود «الاسم الكامل» أو «اسم العامل». استخدم القالب أو أضف عنواناً لعمود الاسم.", "No “Full name” or “Worker name” column was found. Use the template or add a heading to the name column."),
    };
  }
  if (!result.rows.length) return { rows: [], ignored: result.ignored, error: t("لا توجد صفوف بيانات في الملف", "The file has no data rows") };
  const existing = await findExistingEmployees(
    user.companyId,
    result.rows.map((row) => row.values),
  );
  result.rows.forEach((row, index) => (row.existing = existing[index]));
  const needsSponsor =
    result.rows.length > 0 && result.rows.every((row) => !row.values.employerName?.trim() && !row.values.employerNameEn?.trim() && !row.values.employerIdNumber?.trim());
  const sponsors = needsSponsor
    ? (await prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } })).map((item) => ({
        id: item.id,
        name: lang === "en" && item.nameEn ? item.nameEn : item.name,
      }))
    : [];
  return { rows: result.rows, ignored: result.ignored, aiColumns, tooMany: result.tooMany, fileName: file.name, needsSponsor, sponsors };
}

/**
 * Step 2: saves the rows that passed, checking each one again. New employees are added; employees already on
 * file are updated with the file's values when `updateExisting` is on, else skipped. Rows with errors are skipped.
 */
export async function importEmployees(formData: FormData) {
  const user = await requirePermission("employees.create", "/employees");
  const { t } = await getI18n();
  const update = formData.get("updateExisting") === "on" && can(user, "employees.edit");
  let payload: ImportValues[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("payload") || "[]"));
    if (Array.isArray(parsed)) payload = parsed.slice(0, MAX_IMPORT_ROWS).filter((item) => item && typeof item === "object");
  } catch {
    payload = [];
  }
  const rows = payload.map((values, index) => checkRow(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "")])), index + 2));
  const existing = await findExistingEmployees(
    user.companyId,
    rows.map((row) => row.values),
  );
  const valid = rows.map((row, index) => ({ row, existing: existing[index] })).filter(({ row }) => !row.errors.length);
  const fresh = valid.filter((item) => !item.existing);
  const matched = valid.filter((item) => item.existing);
  if (!fresh.length && !(update && matched.length)) {
    go("/employees/import", {
      error: matched.length
        ? t("كل الموظفين في الملف مسجلون مسبقاً. فعّل «تحديث بيانات الموظفين الموجودين» لتحديثهم.", "Everyone in the file is already on record. Turn on “Update existing employees” to update them.")
        : t("لا توجد صفوف صالحة للاستيراد", "No valid rows to import"),
    });
  }
  const room = await fitsLimit(user.companyId, "employees", fresh.length);
  if (!room.ok) {
    go("/employees/import", {
      error: `${limitMessage("employees", room, t)} ${t(`المتاح الآن: ${Math.max(0, room.limit - room.used)}.`, `Room left: ${Math.max(0, room.limit - room.used)}.`)}`,
    });
  }
  const since = Date.now() - 1000;
  const ctx = await intakeContext(user);
  const chosenId = String(formData.get("sponsorId") || "");
  const chosen = chosenId ? ctx.employers.find((item) => item.id === chosenId) : undefined;
  let created = 0;
  let updated = 0;
  const sponsors = new Set<string>();
  const done = new Set<string>();
  for (const item of update ? valid : fresh) {
    if (item.existing && done.has(item.existing.id)) continue;
    const values = { ...item.row.values };
    if (chosen && !values.employerName?.trim() && !values.employerNameEn?.trim() && !values.employerIdNumber?.trim()) {
      values.employerName = chosen.name;
      if (chosen.nameEn) values.employerNameEn = chosen.nameEn;
      if (chosen.idNumber) values.employerIdNumber = chosen.idNumber;
    }
    const result = await saveIntake(ctx, values, item.existing?.id ?? null);
    done.add(result.employee.id);
    if (result.created) created += 1;
    else updated += 1;
    if (result.sponsor?.created) sponsors.add(result.sponsor.name);
  }
  const skipped = rows.length - created - updated;
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_IMPORT",
    message: t(
      `استورد ${created} موظفاً جديداً${updated ? ` وحدّث ${updated}` : ""} من ملف${sponsors.size ? `، وأضاف ${sponsors.size} كفيلاً` : ""}${skipped ? ` (تخطى ${skipped} صفاً)` : ""}`,
      `Imported ${created} new employee(s)${updated ? `, updated ${updated}` : ""} from a file${sponsors.size ? `, added ${sponsors.size} sponsor(s)` : ""}${skipped ? ` (skipped ${skipped} row(s))` : ""}`,
    ),
  });
  refreshAll();
  go(`/employees/complete?since=${since}`, {
    message: t(
      `أُضيف ${created} موظفاً${updated ? ` وحُدّثت بيانات ${updated}` : ""}${sponsors.size ? `، وفُتح ${sponsors.size} كفيل جديد` : ""}${skipped ? `، وتُخطّي ${skipped} صفاً (أخطاء أو موجود مسبقاً)` : ""}. أكمل البيانات الناقصة أدناه.`,
      `Added ${created} employee(s)${updated ? `, updated ${updated}` : ""}${sponsors.size ? `, opened ${sponsors.size} new sponsor(s)` : ""}${skipped ? `; skipped ${skipped} row(s) (errors or already on record)` : ""}. Complete the missing details below.`,
    ),
  });
}
