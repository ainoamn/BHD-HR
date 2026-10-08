import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { buildMonthlyReport } from "@/lib/report-data";
import { formatDate, readPeriod } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONEY = "#,##0.000";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF115E59" } };

type Column = { header: string; key: string; width: number; money?: boolean };

function addSheet(book: ExcelJS.Workbook, name: string, title: string, columns: Column[], rows: Record<string, unknown>[], rtl: boolean) {
  const sheet = book.addWorksheet(name, { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 3 }] });
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  sheet.mergeCells(1, 1, 1, columns.length);
  const heading = sheet.getCell(1, 1);
  heading.value = title;
  heading.font = { bold: true, size: 14 };
  heading.alignment = { horizontal: rtl ? "right" : "left" };
  const header = sheet.getRow(3);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  header.height = 22;
  for (const row of rows) sheet.addRow(row);
  columns.forEach((column, index) => {
    if (column.money) sheet.getColumn(index + 1).numFmt = MONEY;
  });
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
  return sheet;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "reports.export")) return new NextResponse("Forbidden", { status: 403 });
  const { lang, t } = await getI18n();
  const url = new URL(request.url);
  const { year, month } = readPeriod({ year: url.searchParams.get("year") || undefined, month: url.searchParams.get("month") || undefined });
  const report = await buildMonthlyReport(user, year, month, lang);
  const rtl = lang === "ar";
  const book = new ExcelJS.Workbook();
  book.creator = "BHD HR";
  book.created = new Date();
  const heading = (section: string) => `${report.company} — ${section} — ${report.title}`;

  const summary = addSheet(
    book,
    t("الملخص", "Summary"),
    heading(t("ملخص الشهر", "Monthly summary")),
    [
      { header: t("البند", "Item"), key: "item", width: 34 },
      { header: t("القيمة", "Value"), key: "value", width: 22 },
    ],
    [
      ...report.statusCounts.map((row) => ({ item: `${t("موظفون", "Employees")} — ${row.label}`, value: row.count })),
      ...(report.show.salaries
        ? [
            { item: t("إجمالي الرواتب", "Gross payroll"), value: report.totals.gross },
            { item: t("الخصومات", "Deductions"), value: report.totals.deductions },
            { item: t("صافي الرواتب", "Net payroll"), value: report.totals.net },
            { item: t("مسيرات مصروفة", "Paid records"), value: report.totals.paid },
            { item: t("مسيرات غير مصروفة", "Unpaid records"), value: report.totals.unpaid },
          ]
        : []),
      ...(report.show.documents
        ? [
            { item: t("مستندات منتهية", "Expired documents"), value: report.documentCounts.expired },
            { item: t("مستندات خلال التحذير", "Documents within warning"), value: report.documentCounts.soon },
          ]
        : []),
    ],
    rtl,
  );
  summary.getColumn(2).alignment = { horizontal: "center" };

  if (report.show.salaries) {
    const sheet = addSheet(
      book,
      t("الرواتب", "Payroll"),
      heading(t("مسير الرواتب", "Payroll")),
      [
        { header: t("الرقم", "No."), key: "employeeNumber", width: 12 },
        { header: t("الموظف", "Employee"), key: "name", width: 28 },
        { header: t("صاحب العمل", "Employer"), key: "employer", width: 24 },
        { header: t("الأساسي", "Basic"), key: "basic", width: 13, money: true },
        { header: t("البدلات", "Allowances"), key: "allowances", width: 13, money: true },
        { header: t("الإجمالي", "Gross"), key: "gross", width: 13, money: true },
        { header: t("أيام الغياب", "Absence days"), key: "absenceDays", width: 11 },
        { header: t("خصم الغياب", "Absence deduction"), key: "absenceDeduction", width: 13, money: true },
        { header: t("خصومات أخرى", "Other deductions"), key: "otherDeduction", width: 13, money: true },
        { header: t("الصافي", "Net"), key: "net", width: 14, money: true },
        { header: t("الحالة", "Status"), key: "status", width: 12 },
        { header: t("تاريخ الصرف", "Pay date"), key: "paidAt", width: 12 },
        { header: t("طريقة الدفع", "Method"), key: "method", width: 14 },
        { header: t("رقم الإيصال", "Receipt"), key: "receiptNo", width: 20 },
      ],
      report.payroll.map((row) => ({
        ...row,
        status: row.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid"),
        paidAt: row.paidAt ? formatDate(row.paidAt) : "",
      })),
      rtl,
    );
    const total = sheet.addRow({ name: t("المجموع", "Total"), gross: report.totals.gross, net: report.totals.net });
    total.font = { bold: true };
  }

  if (report.show.attendance) {
    addSheet(
      book,
      t("الغياب", "Absence"),
      heading(t("الغياب والخصم", "Absence & deductions")),
      [
        { header: t("الرقم", "No."), key: "employeeNumber", width: 12 },
        { header: t("الموظف", "Employee"), key: "name", width: 30 },
        { header: t("أيام الخصم", "Deducted days"), key: "days", width: 14 },
        ...(report.show.salaries ? [{ header: t("قيمة الخصم", "Deduction"), key: "deduction", width: 16, money: true }] : []),
      ],
      report.absence,
      rtl,
    );
  }

  if (report.show.documents) {
    addSheet(
      book,
      t("المستندات", "Documents"),
      heading(t("المستندات وحالة الانتهاء", "Documents and expiry")),
      [
        { header: t("الرقم", "No."), key: "employeeNumber", width: 12 },
        { header: t("الموظف", "Employee"), key: "employeeName", width: 28 },
        { header: t("المستند", "Document"), key: "label", width: 20 },
        { header: t("رقم المستند", "Number"), key: "number", width: 18 },
        { header: t("الانتهاء", "Expiry"), key: "expiry", width: 12 },
        { header: t("الحالة", "Status"), key: "status", width: 22 },
      ],
      report.documents.map((row) => ({ ...row, expiry: row.expiry ? formatDate(row.expiry) : "", status: row.status.label })),
      rtl,
    );
  }

  if (report.show.employees) {
    addSheet(
      book,
      t("الموظفون", "Employees"),
      heading(t("سجل الموظفين", "Employee register")),
      [
        { header: t("الرقم", "No."), key: "employeeNumber", width: 12 },
        { header: t("الموظف", "Employee"), key: "name", width: 28 },
        { header: t("الجنسية", "Nationality"), key: "nationality", width: 14 },
        { header: t("الوظيفة", "Job"), key: "jobTitle", width: 18 },
        { header: t("الكفيل", "Sponsor"), key: "employer", width: 24 },
        { header: t("الحالة", "Status"), key: "status", width: 12 },
        { header: t("الالتحاق", "Joined"), key: "joiningDate", width: 12 },
        { header: t("الهاتف", "Phone"), key: "phone", width: 16 },
        ...(report.show.salaries ? [{ header: t("الراتب", "Salary"), key: "gross", width: 14, money: true }] : []),
      ],
      report.staff.map((row) => ({ ...row, joiningDate: row.joiningDate ? formatDate(row.joiningDate) : "" })),
      rtl,
    );
  }

  const buffer = await book.xlsx.writeBuffer();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  await writeAudit({ companyId: user.companyId, userId: user.id, action: "REPORT_EXPORT", message: t(`صدّر تقرير ${period} (Excel)`, `Exported the ${period} report (Excel)`) });
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bhd-hr-report-${period}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
