import Link from "next/link";
import { PeriodFilter } from "@/components/period-filter";
import { PageHeader, ToneBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { STATUS_LABEL, monthName } from "@/lib/constants";
import { collectDocuments } from "@/lib/documents";
import { describeExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { salaryDayWeight } from "@/lib/leave";
import { packageGross } from "@/lib/salary";
import { daysLabel, money, monthRange, readPeriod, round3 } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const { start, end } = monthRange(year, month);
  const currency = user.company.currency;
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const [employees, salaries, attendance] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId },
      include: { documents: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.salary.findMany({ where: { year, month, employee: { companyId: user.companyId } } }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, employee: { companyId: user.companyId } },
    }),
  ]);
  const byStatus = Object.keys(STATUS_LABEL).map((status) => ({
    status,
    count: employees.filter((employee) => employee.status === status).length,
  }));
  const gross = salaries.reduce((sum, row) => sum + packageGross(row), 0);
  const deductions = salaries.reduce((sum, row) => sum + row.absenceDeduction + row.otherDeduction, 0);
  const net = salaries.reduce((sum, row) => sum + row.netSalary, 0);
  const paid = salaries.filter((row) => row.paid);
  const docs = collectDocuments(employees, lang).map((row) => describeExpiry(row.expiry, limits, lang));
  const expired = docs.filter((item) => item.key === "expired" || item.key === "today").length;
  const soon = docs.filter((item) => item.key === "urgent" || item.key === "warning").length;
  const monthLabel = monthName(month, lang);

  const absenceRows = employees
    .map((employee) => {
      const rows = attendance.filter((row) => row.employeeId === employee.id);
      const days = round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0));
      const salary = salaries.find((row) => row.employeeId === employee.id);
      return { employee, days, deduction: salary?.absenceDeduction || 0 };
    })
    .filter((row) => row.days > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("التقارير", "Reports")}
        description={t(`ملخص ${monthLabel} ${year}. يمكن طباعة الصفحة من المتصفح.`, `${monthLabel} ${year} summary. Print this page from the browser.`)}
      >
        <PeriodFilter year={year} month={month} />
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byStatus.map((item) => (
          <div key={item.status} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">{pick(STATUS_LABEL[item.status], lang)}</p>
            <p className="text-2xl font-bold">{item.count}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 font-bold">{t(`رواتب ${monthLabel}`, `${monthLabel} payroll`)}</h2>
        <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>{t("الإجمالي", "Gross")}: <strong>{money(gross, currency)}</strong></p>
          <p>{t("الخصومات", "Deductions")}: <strong>{money(deductions, currency)}</strong></p>
          <p>{t("الصافي", "Net")}: <strong>{money(net, currency)}</strong></p>
          <p>
            {t("المصروف", "Paid")}: <strong>{paid.length}</strong> / {t("غير المصروف", "Unpaid")}: <strong>{salaries.length - paid.length}</strong>
          </p>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-2 text-start">{t("صاحب العمل", "Employer")}</th>
              <th className="px-4 py-2 text-start">{t("الصافي", "Net")}</th>
              <th className="px-4 py-2 text-start">{t("الحالة", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {salaries.map((salary) => (
              <tr key={salary.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName}</td>
                <td className="px-4 py-2">{(lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName) || "—"}</td>
                <td className="px-4 py-2">{money(salary.netSalary, currency)}</td>
                <td className="px-4 py-2">
                  <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {salaries.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t("لا يوجد مسير لهذا الشهر.", "No payroll for this month.")}</p> : null}
      </section>

      <section className="mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 font-bold">{t("الغياب والخصم", "Absence & deductions")}</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-2 text-start">{t("أيام الخصم", "Deducted days")}</th>
              <th className="px-4 py-2 text-start">{t("قيمة الخصم في المسير", "Deduction in payroll")}</th>
            </tr>
          </thead>
          <tbody>
            {absenceRows.map((row) => (
              <tr key={row.employee.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/employees/${row.employee.id}?tab=attendance`} className="font-semibold hover:text-teal-800">
                    {lang === "en" && row.employee.nameEn ? row.employee.nameEn : row.employee.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2">{daysLabel(row.days)}</td>
                <td className="px-4 py-2">{money(row.deduction, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {absenceRows.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t("لا يوجد غياب مخصوم هذا الشهر.", "No deducted absence this month.")}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold">{t("المستندات", "Documents")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("منتهية أو تنتهي اليوم", "Expired or expiring today")}: <strong>{expired}</strong> — {t("خلال فترة التحذير", "Within warning period")}: <strong>{soon}</strong>
        </p>
        <Link href="/documents?view=expired" className="mt-3 inline-block text-sm font-semibold text-teal-800">
          {t("فتح تقرير المستندات", "Open documents report")}
        </Link>
      </section>
    </div>
  );
}
