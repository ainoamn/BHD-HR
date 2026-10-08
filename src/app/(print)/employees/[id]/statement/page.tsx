import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, SalaryDocsList, headerFor, readDocsMode, sheetClass } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { bothTerm, monthBoth } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { formatDate, money, parseDateInput, round3, text } from "@/lib/utils";

function monthIntersects(year: number, month: number, from: Date, to: Date) {
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 0, 12);
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return monthEnd >= fromUtc && monthStart <= toUtc;
}

const cell = "border border-slate-200 px-2 py-2";

export default async function SalaryStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; from?: string; to?: string; docs?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      employer: true,
      salaries: { orderBy: [{ year: "asc" }, { month: "asc" }], include: { employer: true } },
    },
  });
  if (!employee) notFound();
  const docs = readDocsMode(sp.docs, "slips");

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12));
  let from: Date | null = employee.joiningDate ? new Date(employee.joiningDate) : null;
  let to: Date | null = employee.contractEnd ? new Date(employee.contractEnd) : todayUtc;
  let periodError = "";
  if (sp.mode === "custom") {
    from = parseDateInput(sp.from);
    to = parseDateInput(sp.to);
    if (!from || !to) periodError = "حدد تاريخ البداية والنهاية / Choose start and end dates";
    else if (to < from) periodError = "تاريخ النهاية قبل البداية / End date is before start date";
  } else if (!employee.joiningDate) {
    periodError = "أدخل تاريخ الالتحاق لاستخدام مدة العقد / Enter the joining date to use the contract period";
  }

  const salaries = from && to && !periodError ? employee.salaries.filter((salary) => monthIntersects(salary.year, salary.month, from, to)) : [];
  const paidCount = salaries.filter((salary) => salary.paid).length;
  const currency = user.company.currency;
  const totalNet = round3(salaries.reduce((sum, salary) => sum + salary.netSalary, 0));
  const totalDeduction = round3(salaries.reduce((sum, salary) => sum + salary.absenceDeduction + salary.otherDeduction, 0));
  const totalGross = round3(salaries.reduce((sum, salary) => sum + packageGross(salary), 0));
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);

  const info: [string, string, string][] = [
    ["الموظف", "Employee", employee.nameEn ? `${employee.fullName} — ${employee.nameEn}` : employee.fullName],
    ["الرقم الوظيفي", "Employee no.", employee.employeeNumber],
    ["الوظيفة", "Job title", text(bothTerm(employee.jobTitle))],
    ["تاريخ الالتحاق", "Joining date", formatDate(employee.joiningDate)],
    ["نهاية العقد", "Contract end", formatDate(employee.contractEnd)],
    ["الفترة", "Period", from && to && !periodError ? `${formatDate(from)} — ${formatDate(to)}` : "—"],
  ];

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } .slip-break { break-before: page; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/employees/${employee.id}?tab=salaries`} className="text-sm font-semibold text-teal-800">
          {t("رجوع لرواتب الموظف", "Back to employee salaries")}
        </Link>
        <PrintButton label={t("طباعة الكشف / حفظ PDF", "Print statement / Save PDF")} />
      </div>

      <article className={sheetClass}>
        <HeaderBar header={header} titleAr="كشف رواتب موظف" titleEn="Employee Salary Statement" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {info.map(([ar, en, value]) => (
            <div key={en} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <Bi ar={ar} en={en} className="text-slate-500" />
              <strong className="text-end">{value}</strong>
            </div>
          ))}
        </div>
        {periodError ? <p className="mt-4 text-sm text-red-700">{periodError}</p> : null}
        {!periodError && salaries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">لا توجد رواتب محفوظة في هذه الفترة / No salaries saved in this period</p>
        ) : null}
        {salaries.length > 0 ? (
          <div className="mt-5 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[480px] border-collapse text-sm print:min-w-0">
            <thead>
              <tr className="bg-slate-100">
                <th className={`${cell} text-start`}><Bi ar="الشهر" en="Month" /></th>
                <th className={`${cell} text-start`}><Bi ar="الإجمالي" en="Gross" /></th>
                <th className={`${cell} text-start`}><Bi ar="الخصم" en="Deductions" /></th>
                <th className={`${cell} text-start`}><Bi ar="الصافي" en="Net" /></th>
                <th className={`${cell} text-start`}><Bi ar="الحالة" en="Status" /></th>
              </tr>
            </thead>
            <tbody>
              {salaries.map((salary) => (
                <tr key={salary.id}>
                  <td className={cell}>{monthBoth(salary.month)} {salary.year}</td>
                  <td className={cell}>{money(packageGross(salary), currency)}</td>
                  <td className={cell}>{money(salary.absenceDeduction + salary.otherDeduction, currency)}</td>
                  <td className={cell}>{money(salary.netSalary, currency)}</td>
                  <td className={cell}>{salary.paid ? "مصروف / Paid" : "غير مصروف / Unpaid"}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className={cell}>الإجمالي / Total</td>
                <td className={cell}>{money(totalGross, currency)}</td>
                <td className={cell}>{money(totalDeduction, currency)}</td>
                <td className={cell}>{money(totalNet, currency)}</td>
                <td className={cell}>{paidCount} / {salaries.length}</td>
              </tr>
            </tbody>
          </table>
          </div>
        ) : null}
      </article>

      <SalaryDocsList salaries={salaries} docs={docs} company={user.company} />
    </div>
  );
}
