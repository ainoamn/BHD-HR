import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totalDeductions, totalEarnings } from "@/lib/salary";
import { readPeriod, round3 } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A simple journal the accountant can import: salary expense, social protection, and net payable. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "salaries.view")) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const { year, month } = readPeriod({ year: url.searchParams.get("year") || undefined, month: url.searchParams.get("month") || undefined });
  const salaries = await prisma.salary.findMany({ where: { companyId: user.companyId, year, month } });
  const gross = round3(salaries.reduce((sum, row) => sum + totalEarnings(row), 0));
  const spfEmployee = round3(salaries.reduce((sum, row) => sum + row.spfEmployee, 0));
  const spfEmployer = round3(salaries.reduce((sum, row) => sum + row.spfEmployer, 0));
  const otherDeductions = round3(salaries.reduce((sum, row) => sum + totalDeductions(row), 0) - spfEmployee);
  const net = round3(salaries.reduce((sum, row) => sum + row.netSalary, 0));
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const lines: (string | number)[][] = [
    ["Date", "Account", "Debit", "Credit", "Memo"],
    [period, "Salary expense", gross.toFixed(3), "", `Payroll ${period}`],
    [period, "Social protection expense (employer)", spfEmployer.toFixed(3), "", `SPF employer ${period}`],
    [period, "Net salaries payable", "", net.toFixed(3), `WPS ${period}`],
    [period, "Social protection payable", "", round3(spfEmployee + spfEmployer).toFixed(3), `SPF ${period}`],
    [period, "Other deductions", "", Math.max(0, otherDeductions).toFixed(3), `Deductions ${period}`],
  ];
  await writeAudit({ companyId: user.companyId, userId: user.id, action: "JOURNAL_EXPORT", message: `قيد رواتب ${period}` });
  const csv = lines.map((line) => line.map(cell).join(",")).join("\r\n");
  return new NextResponse(`${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
