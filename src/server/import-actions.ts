"use server";

import ExcelJS from "exceljs";
import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { newBadgeToken } from "@/lib/badge";
import { MAX_IMPORT_ROWS, checkRow, parseCsv, readTable, type ImportRow, type ImportValues } from "@/lib/employee-import";
import { nextEmployeeNumber } from "@/lib/employee-number";
import { getHrCatalog } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { fitsLimit, limitMessage } from "@/lib/subscription";
import { parseDateInput } from "@/lib/utils";

const MAX_FILE = 5 * 1024 * 1024;

export type ImportPreview = { rows: ImportRow[]; ignored: string[]; tooMany?: boolean; error?: string; fileName?: string };

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

/** Rows whose ID or passport number another employee of the company already has get an error. */
async function markExisting(companyId: string, rows: ImportRow[]) {
  const ids = rows.map((row) => row.values.idNumber).filter(Boolean);
  const passports = rows.map((row) => row.values.passportNumber).filter(Boolean);
  if (!ids.length && !passports.length) return;
  const existing = await prisma.employee.findMany({
    where: { companyId, OR: [{ idNumber: { in: ids, mode: "insensitive" } }, { passportNumber: { in: passports, mode: "insensitive" } }] },
    select: { fullName: true, employeeNumber: true, idNumber: true, passportNumber: true },
  });
  for (const row of rows) {
    const match = existing.find(
      (employee) =>
        (row.values.idNumber && employee.idNumber?.toUpperCase() === row.values.idNumber.toUpperCase()) ||
        (row.values.passportNumber && employee.passportNumber?.toUpperCase() === row.values.passportNumber.toUpperCase()),
    );
    if (match) row.errors.push(`موجود مسبقاً: ${match.fullName} (${match.employeeNumber}) / Already on file`);
  }
}

/** Step 1: reads the uploaded file and returns every row checked, without saving anything. */
export async function previewEmployeeImport(_previous: ImportPreview | null, formData: FormData): Promise<ImportPreview> {
  const user = await requirePermission("employees.create", "/employees");
  const { t } = await getI18n();
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
  const result = readTable(table);
  if (result.missingName) {
    return { rows: [], ignored: [], error: t("لم يُعثر على عمود «الاسم الكامل» في الصف الأول. استخدم القالب.", "No “Full name” column in the first row. Use the template.") };
  }
  if (!result.rows.length) return { rows: [], ignored: result.ignored, error: t("لا توجد صفوف بيانات في الملف", "The file has no data rows") };
  await markExisting(user.companyId, result.rows);
  return { rows: result.rows, ignored: result.ignored, tooMany: result.tooMany, fileName: file.name };
}

/** Step 2: creates the rows that passed, checking each one again. Rows with any problem are skipped. */
export async function importEmployees(formData: FormData) {
  const user = await requirePermission("employees.create", "/employees");
  const { t } = await getI18n();
  let payload: ImportValues[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("payload") || "[]"));
    if (Array.isArray(parsed)) payload = parsed.slice(0, MAX_IMPORT_ROWS).filter((item) => item && typeof item === "object");
  } catch {
    payload = [];
  }
  const rows = payload.map((values, index) => checkRow(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "")])), index + 2));
  await markExisting(user.companyId, rows);
  const valid = rows.filter((row) => !row.errors.length);
  if (!valid.length) go("/employees/import", { error: t("لا توجد صفوف صالحة للاستيراد", "No valid rows to import") });
  const room = await fitsLimit(user.companyId, "employees", valid.length);
  if (!room.ok) {
    go("/employees/import", {
      error: `${limitMessage("employees", room, t)} ${t(`المتاح الآن: ${Math.max(0, room.limit - room.used)}.`, `Room left: ${Math.max(0, room.limit - room.used)}.`)}`,
    });
  }
  const salaryAccess = can(user, "salaries.edit");
  const catalog = await getHrCatalog(user.companyId);
  const jobs = [...catalog.jobTitles];
  const departments = [...catalog.departments];
  const findOrCreate = async <T extends { id: string; nameAr: string; nameEn: string | null }>(list: T[], name: string | undefined, create: (nameAr: string) => Promise<T>) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    let item = list.find((entry) => entry.nameAr === name || entry.nameEn?.toLowerCase() === lower);
    if (!item) {
      item = await create(name);
      list.push(item);
    }
    return item;
  };
  const first = Number((await nextEmployeeNumber(user.companyId)).replace(/\D/g, ""));
  let created = 0;
  for (const [index, { values }] of valid.entries()) {
    const job = await findOrCreate(jobs, values.jobTitle, (nameAr) => prisma.jobTitle.create({ data: { companyId: user.companyId, nameAr } }));
    const department = await findOrCreate(departments, values.department, (nameAr) => prisma.department.create({ data: { companyId: user.companyId, nameAr } }));
    const date = (key: string) => (values[key] ? parseDateInput(values[key]) : null);
    const amount = (key: string) => (salaryAccess && values[key] ? Number(values[key]) : 0);
    await prisma.employee.create({
      data: {
        companyId: user.companyId,
        employeeNumber: `EMP-${String(first + index).padStart(4, "0")}`,
        badgeToken: newBadgeToken(),
        fullName: values.fullName,
        nameEn: values.nameEn || null,
        nationality: values.nationality || null,
        gender: values.gender || null,
        dateOfBirth: date("dateOfBirth"),
        phone: values.phone || null,
        email: values.email || null,
        idNumber: values.idNumber || null,
        idExpiry: date("idExpiry"),
        passportNumber: values.passportNumber || null,
        passportExpiry: date("passportExpiry"),
        residenceNumber: values.residenceNumber || null,
        residenceExpiry: date("residenceExpiry"),
        joiningDate: date("joiningDate"),
        contractEnd: date("contractEnd"),
        jobTitleId: job?.id ?? null,
        jobTitle: job?.nameAr ?? null,
        jobTitleEn: job?.nameEn ?? null,
        departmentId: department?.id ?? null,
        department: department?.nameAr ?? null,
        departmentEn: department?.nameEn ?? null,
        basicSalary: amount("basicSalary"),
        housingAllowance: amount("housingAllowance"),
        transportAllowance: amount("transportAllowance"),
        otherAllowance: amount("otherAllowance"),
        bankBic: salaryAccess ? values.bankBic || null : null,
        bankAccount: salaryAccess ? values.bankAccount || null : null,
      },
    });
    created += 1;
  }
  const skipped = rows.length - valid.length;
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_IMPORT",
    message: t(`استورد ${created} موظفاً من ملف${skipped ? ` (تخطى ${skipped} صفاً فيه أخطاء)` : ""}`, `Imported ${created} employee(s) from a file${skipped ? ` (skipped ${skipped} with errors)` : ""}`),
  });
  refreshAll();
  go("/employees", {
    message: t(
      `استُورد ${created} موظفاً${skipped ? `، وتُخطّي ${skipped} صفاً فيه أخطاء` : ""}. افتح ملف كل موظف لإضافة الوثائق وفتح حساب البوابة.`,
      `Imported ${created} employee(s)${skipped ? `; skipped ${skipped} with errors` : ""}. Open each file to add documents and portal access.`,
    ),
  });
}