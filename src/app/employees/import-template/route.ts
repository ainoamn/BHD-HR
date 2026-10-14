import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/employee-import";
import { getI18n } from "@/lib/lang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Empty import sheet with two-language column names, plus a sheet explaining each column. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "employees.create")) return new NextResponse("Forbidden", { status: 403 });
  const { lang, t } = await getI18n();
  const rtl = lang === "ar";
  const columns = IMPORT_COLUMNS.filter((column) => !column.salary || can(user, "salaries.edit"));
  const book = new ExcelJS.Workbook();
  book.creator = "BHD HR";
  book.created = new Date();

  const sheet = book.addWorksheet(t("الموظفون", "Employees"), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ key: column.key, width: Math.max(16, column.ar.length + column.en.length + 4) }));
  const header = sheet.getRow(1);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = `${column.ar} / ${column.en}${column.required ? " *" : ""}`;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.required ? "FF075C45" : "FF092D24" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    if (column.kind === "date") sheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
    if (column.kind === "text" || column.kind === "account" || column.kind === "phone") sheet.getColumn(index + 1).numFmt = "@";
  });
  header.height = 34;

  const help = book.addWorksheet(t("شرح الأعمدة", "Column guide"), { views: [{ rightToLeft: rtl }] });
  help.columns = [
    { header: t("العمود", "Column"), key: "name", width: 38 },
    { header: t("ما يُكتب فيه", "What to enter"), key: "hint", width: 70 },
  ];
  help.getRow(1).font = { bold: true };
  const hints: Record<string, string> = {
    text: t("نص", "Text"),
    date: t("تاريخ: 2027-03-31 أو 31/03/2027", "Date: 2027-03-31 or 31/03/2027"),
    money: t("مبلغ بالريال العماني، مثل 350.500", "Amount in OMR, e.g. 350.500"),
    nationality: t("رمز الدولة (OM, IN, PK…) أو اسم الجنسية بالعربية أو الإنجليزية", "Country code (OM, IN, PK…) or the nationality in Arabic or English"),
    gender: t("ذكر / أنثى أو Male / Female", "Male / Female"),
    bank: t("اسم البنك أو رمز SWIFT", "Bank name or SWIFT code"),
    account: t("رقم الحساب", "Account number"),
    phone: t("رقم الهاتف، يُضاف رمز عُمان 968 إن لم يُكتب رمز", "Phone; Oman's 968 is added when no code is given"),
    email: t("البريد الإلكتروني", "Email address"),
    employerKind: t("شركة أو فرد (Company / Individual)", "Company or Individual"),
  };
  const columnHints: Record<string, string> = {
    employerName: t("اسم الكفيل أو المنشأة؛ إن لم يكن مسجلاً يُفتح كفيل جديد تلقائياً", "Sponsor or establishment name; a new sponsor is opened automatically if not on record"),
    employerIdNumber: t("السجل التجاري للشركة أو الرقم المدني للكفيل الفرد", "The company's CR number, or the individual sponsor's civil number"),
    workPermitNumber: t("يُحفظ ضمن وثائق الموظف كتصريح عمل مع تاريخ انتهائه", "Kept in the employee's documents as a work permit with its expiry"),
  };
  for (const column of columns) {
    help.addRow({ name: `${column.ar} / ${column.en}${column.required ? " *" : ""}`, hint: columnHints[column.key] ?? hints[column.kind] });
  }
  help.addRow({});
  help.addRow({
    name: t("ملاحظات", "Notes"),
    hint: t(
      "الصف الأول أسماء الأعمدة ولا يُغيَّر. يمكن حذف الأعمدة غير المطلوبة، ويُقبل ملف وزارة العمل المصدّر بأسماء أعمدته. الحد 500 موظف في الملف. من كان رقمه المدني أو جوازه أو تصريح عمله مسجلاً يُنبَّه عليه، ويمكن اختيار تحديث بياناته.",
      "Keep the first row as the column names. Columns you do not need can be removed; a Ministry of Labour export is accepted with its own column names. Up to 500 employees per file. Rows whose civil, passport or work permit number is already on file are flagged, and you can choose to update them.",
    ),
  });

  const buffer = await book.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees-import-template.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
