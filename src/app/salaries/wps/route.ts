import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPeriod, round3 } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const amount = (value: number) => round3(value).toFixed(3);

/**
 * Salary Information File (SIF) for the Wage Protection System, in the CSV layout most Omani banks accept: a payer
 * header row, then one row per employee with bank details. Employees without a bank or account are left out (the
 * payroll check lists them). Confirm the layout with the bank before the first upload.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "salaries.pay")) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const { year, month } = readPeriod({ year: url.searchParams.get("year") || undefined, month: url.searchParams.get("month") || undefined });
  const employerId = url.searchParams.get("employerId") || "";
  const employer = employerId && employerId !== "none" ? await prisma.employer.findFirst({ where: { id: employerId, companyId: user.companyId } }) : null;
  const salaries = await prisma.salary.findMany({
    where: {
      companyId: user.companyId,
      year,
      month,
      netSalary: { gt: 0 },
      ...(employerId === "none" ? { employerId: null } : employer ? { employerId: employer.id } : {}),
    },
    include: { employee: true, lines: { where: { kind: "SOCIAL" }, select: { amount: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  const rows = salaries.filter((salary) => salary.employee.bankAccount && salary.employee.bankBic);
  const company = user.company;
  const cr = employer?.idNumber || company.crNumber || "";
  const total = round3(rows.reduce((sum, salary) => sum + salary.netSalary, 0));
  const lines: (string | number | null)[][] = [
    ["Employer CR-NO", "Payer CR-NO", "Payer Bank Short Name", "Payer Account Number", "Salary Year", "Salary Month", "Total Salaries", "Number Of Records", "Payment Type"],
    [cr, cr, company.bankBic, company.bankAccount, year, String(month).padStart(2, "0"), amount(total), rows.length, "Salary"],
    [
      "Employee ID Type",
      "Employee ID",
      "Reference Number",
      "Employee Name",
      "Employee BIC Code",
      "Employee Account",
      "Salary Frequency",
      "Number Of Working days",
      "Net Salary",
      "Basic Salary",
      "Extra Hours",
      "Extra Income",
      "Deductions",
      "Social Security Deductions",
      "Notes / Comments",
    ],
  ];
  for (const salary of rows) {
    const employee = salary.employee;
    const civil = employee.idNumber || employee.residenceNumber;
    const social = round3(salary.lines.reduce((sum, line) => sum + line.amount, 0));
    const extraIncome = round3(salary.housingAllowance + salary.transportAllowance + salary.otherAllowance + salary.extraEarnings);
    const deductions = round3(salary.absenceDeduction + salary.otherDeduction + salary.extraDeductions - social);
    lines.push([
      civil ? "C" : "P",
      civil || employee.passportNumber || "",
      salary.employeeNumber,
      (salary.employeeNameEn || salary.employeeName).toUpperCase(),
      employee.bankBic,
      employee.bankAccount,
      "M",
      Math.max(0, round3(company.salaryDays - salary.absenceDays)),
      amount(salary.netSalary),
      amount(salary.basicSalary),
      0,
      amount(extraIncome),
      amount(deductions),
      amount(social),
      "",
    ]);
  }
  await writeAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "WPS_EXPORT",
    message: `ملف WPS لشهر ${month}/${year}: ${rows.length} موظف، ${amount(total)}${salaries.length > rows.length ? ` (${salaries.length - rows.length} بلا حساب بنكي)` : ""}`,
  });
  const csv = lines.map((line) => line.map(cell).join(",")).join("\r\n");
  return new NextResponse(`${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wps-${year}-${String(month).padStart(2, "0")}${employer ? `-${employer.id.slice(-6)}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
