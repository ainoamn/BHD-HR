import Link from "next/link";
import { PeriodFilter } from "@/components/period-filter";
import { ReportToolbar } from "@/components/report-toolbar";
import { PageHeader, ToneBadge } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { buildMonthlyReport } from "@/lib/report-data";
import { daysLabel, formatDate, money, readPeriod, text } from "@/lib/utils";

const th = "px-3 py-2 text-start font-semibold whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("reports.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const report = await buildMonthlyReport(user, year, month, lang);
  const currency = report.currency;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const urgentDocs = report.documents.filter((row) => row.status.key !== "ok" && row.status.key !== "none");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("التقارير", "Reports")}
        description={t(`ملخص ${report.title}. اطبع التقرير أو حمّله Excel أو PDF.`, `${report.title} summary. Print it or download it as Excel or PDF.`)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter year={year} month={month} />
          <ReportToolbar
            targetId="report-content"
            excelHref={`/reports/export?year=${year}&month=${month}`}
            fileName={`bhd-hr-report-${period}.pdf`}
            canExport={can(user, "reports.export")}
          />
        </div>
      </PageHeader>

      <div id="report-content" className="space-y-6 bg-white sm:bg-transparent">
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">
            {report.company} — {t("تقرير", "Report")} {report.title}
          </h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.statusCounts.map((item) => (
            <div key={item.status} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="text-2xl font-bold">{item.count}</p>
            </div>
          ))}
        </div>

        {report.show.salaries ? (
          <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 font-bold">{t(`رواتب ${report.title}`, `${report.title} payroll`)}</h2>
            <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p>
                {t("الإجمالي", "Gross")}: <strong>{money(report.totals.gross, currency)}</strong>
              </p>
              <p>
                {t("الخصومات", "Deductions")}: <strong>{money(report.totals.deductions, currency)}</strong>
              </p>
              <p>
                {t("الصافي", "Net")}: <strong>{money(report.totals.net, currency)}</strong>
              </p>
              <p>
                {t("المصروف", "Paid")}: <strong>{report.totals.paid}</strong> / {t("غير المصروف", "Unpaid")}: <strong>{report.totals.unpaid}</strong>
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className={th}>{t("الموظف", "Employee")}</th>
                  <th className={th}>{t("صاحب العمل", "Employer")}</th>
                  <th className={th}>{t("الإجمالي", "Gross")}</th>
                  <th className={th}>{t("الخصومات", "Deductions")}</th>
                  <th className={th}>{t("الصافي", "Net")}</th>
                  <th className={th}>{t("الحالة", "Status")}</th>
                  <th className={th}>{t("الإيصال", "Receipt")}</th>
                </tr>
              </thead>
              <tbody>
                {report.payroll.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2">{row.employer || "—"}</td>
                    <td className={td}>{money(row.gross, currency)}</td>
                    <td className={td}>{money(row.absenceDeduction + row.otherDeduction, currency)}</td>
                    <td className={`${td} font-semibold`}>{money(row.net, currency)}</td>
                    <td className="px-3 py-2">
                      <ToneBadge tone={row.paid ? "green" : "amber"}>{row.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                    </td>
                    <td className={`${td} text-xs text-slate-500`}>{row.paid ? `${row.receiptNo} · ${formatDate(row.paidAt)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {report.payroll.length ? (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold">
                    <td className="px-3 py-2" colSpan={2}>
                      {t("المجموع", "Total")}
                    </td>
                    <td className={td}>{money(report.totals.gross, currency)}</td>
                    <td className={td}>{money(report.totals.deductions, currency)}</td>
                    <td className={td}>{money(report.totals.net, currency)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {report.payroll.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t("لا يوجد مسير لهذا الشهر.", "No payroll for this month.")}</p> : null}
          </section>
        ) : null}

        {report.show.attendance ? (
          <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 font-bold">{t("الغياب والخصم", "Absence & deductions")}</h2>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className={th}>{t("الموظف", "Employee")}</th>
                  <th className={th}>{t("أيام الخصم", "Deducted days")}</th>
                  {report.show.salaries ? <th className={th}>{t("قيمة الخصم في المسير", "Deduction in payroll")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {report.absence.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link href={`/employees/${row.id}?tab=attendance`} className="font-semibold hover:text-teal-800">
                        {row.name}
                      </Link>
                    </td>
                    <td className={td}>{daysLabel(row.days)}</td>
                    {report.show.salaries ? <td className={td}>{money(row.deduction || 0, currency)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {report.absence.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t("لا يوجد غياب مخصوم هذا الشهر.", "No deducted absence this month.")}</p> : null}
          </section>
        ) : null}

        {report.show.documents ? (
          <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="font-bold">{t("المستندات التي تحتاج متابعة", "Documents needing attention")}</h2>
              <p className="text-sm text-slate-600">
                {t("منتهية", "Expired")}: <strong>{report.documentCounts.expired}</strong> — {t("خلال التحذير", "Within warning")}:{" "}
                <strong>{report.documentCounts.soon}</strong>
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className={th}>{t("الموظف", "Employee")}</th>
                  <th className={th}>{t("المستند", "Document")}</th>
                  <th className={th}>{t("الرقم", "Number")}</th>
                  <th className={th}>{t("الانتهاء", "Expiry")}</th>
                  <th className={th}>{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {urgentDocs.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.employeeName}</td>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className={td}>{text(row.number)}</td>
                    <td className={td}>{formatDate(row.expiry)}</td>
                    <td className="px-3 py-2">
                      <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {urgentDocs.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t("كل المستندات سارية.", "All documents are valid.")}</p> : null}
          </section>
        ) : null}

        <p className="text-xs text-slate-400">
          {report.company} — {t("أُنشئ في", "Generated on")} {formatDate(new Date())}
        </p>
      </div>
    </div>
  );
}
