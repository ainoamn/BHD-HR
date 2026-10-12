import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { nationalityName } from "@/lib/nationalities";
import { isOmani } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { readPeriod, round3 } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONEY = "#,##0.000";

/** Social Protection Fund contributions of one month, per employee: employee share (deducted) and employer share (company cost). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "salaries.view")) return new NextResponse("Forbidden", { status: 403 });
  const { lang, t } = await getI18n();
  const url = new URL(request.url);
  const { year, month } = readPeriod({ year: url.searchParams.get("year") || undefined, month: url.searchParams.get("month") || undefined });
  const salaries = await prisma.salary.findMany({
    where: { companyId: user.companyId, year, month },
    include: { employee: { select: { nationality: true, idNumber: true, residenceNumber: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  const rtl = lang === "ar";
  const book = new ExcelJS.Workbook();
  book.creator = "BHD HR";
  const sheet = book.addWorksheet(t("الحماية الاجتماعية", "Social protection"), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 3 }] });
  const columns = [
    { header: t("الرقم الوظيفي", "Emp. no."), key: "number", width: 12 },
    { header: t("الموظف", "Employee"), key: "name", width: 30 },
    { header: t("الجنسية", "Nationality"), key: "nationality", width: 14 },
    { header: t("الرقم المدني", "Civil no."), key: "civil", width: 14 },
    { header: t("الحالة", "Status"), key: "paid", width: 11 },
    { header: t("حصة الموظف", "Employee share"), key: "employee", width: 15, money: true },
    { header: t("حصة صاحب العمل", "Employer share"), key: "employer", width: 15, money: true },
    { header: t("المجموع", "Total"), key: "total", width: 15, money: true },
  ];
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = `${user.company.name} — ${t("اشتراكات صندوق الحماية الاجتماعية", "Social Protection Fund contributions")} — ${month}/${year}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  const header = sheet.getRow(3);
  columns.forEach((column, index) => {
    const cellRef = header.getCell(index + 1);
    cellRef.value = column.header;
    cellRef.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cellRef.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075C45" } };
    cellRef.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  let employeeTotal = 0;
  let employerTotal = 0;
  for (const salary of salaries) {
    employeeTotal += salary.spfEmployee;
    employerTotal += salary.spfEmployer;
    sheet.addRow({
      number: salary.employeeNumber,
      name: lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName,
      nationality: nationalityName(salary.employee.nationality, lang) || "",
      civil: (isOmani(salary.employee.nationality) ? salary.employee.idNumber : salary.employee.residenceNumber) || "",
      paid: salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid"),
      employee: salary.spfEmployee,
      employer: salary.spfEmployer,
      total: round3(salary.spfEmployee + salary.spfEmployer),
    });
  }
  const totalRow = sheet.addRow({ name: t("الإجمالي", "Total"), employee: round3(employeeTotal), employer: round3(employerTotal), total: round3(employeeTotal + employerTotal) });
  totalRow.font = { bold: true };
  columns.forEach((column, index) => {
    if (column.money) sheet.getColumn(index + 1).numFmt = MONEY;
  });
  if (!user.company.spfEnabled) {
    sheet.addRow({});
    sheet.addRow({ name: t("الحماية الاجتماعية غير مفعّلة في الإعدادات؛ المبالغ صفر.", "Social protection is off in Settings; amounts are zero.") });
  }
  const buffer = await book.xlsx.writeBuffer();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  await writeAudit({ companyId: user.companyId, userId: user.id, action: "REPORT_EXPORT", message: t(`صدّر اشتراكات الحماية الاجتماعية ${period}`, `Exported social protection contributions ${period}`) });
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="spf-${period}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
