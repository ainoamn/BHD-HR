import Link from "next/link";
import { Banknote, CalendarX2, FileWarning, HandCoins, PieChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PeriodFilter } from "@/components/period-filter";
import { ReportToolbar } from "@/components/report-toolbar";
import { PageHeader, ToneBadge } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { buildMonthlyReport } from "@/lib/report-data";
import { daysLabel, formatDate, money, readPeriod, text } from "@/lib/utils";

const th = "px-4 py-3 text-start whitespace-nowrap";
const td = "px-4 py-3 whitespace-nowrap tabular";

function ReportSection({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <h2 className="flex items-center gap-2.5 font-bold text-slate-900">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
            <Icon size={16} />
          </span>
          {title}
        </h2>
        {aside ? <div className="text-sm text-slate-600">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("reports.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const report = await buildMonthlyReport(user, year, month, lang);
  const currency = report.currency;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const urgentDocs = report.documents.filter((row) => row.status.key !== "ok" && row.status.key !== "none");
  const statusTones = ["text-teal-700", "text-gold-600", "text-navy-500", "text-slate-500"];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={PieChart}
        title={t("التقارير", "Reports")}
        description={t(`ملخص ${report.title}. اطبع التقرير أو حمّله Excel أو PDF.`, `${report.title} summary. Print it or download it as Excel or PDF.`)}
      />

      <div className="no-print mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PeriodFilter year={year} month={month} />
        <ReportToolbar
          targetId="report-content"
          excelHref={`/reports/export?year=${year}&month=${month}`}
          fileName={`bhd-hr-report-${period}.pdf`}
          canExport={can(user, "reports.export")}
        />
      </div>

      <div id="report-content" className="space-y-5">
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">
            {report.company} — {t("تقرير", "Report")} {report.title}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {report.statusCounts.map((item, index) => (
            <div key={item.status} className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-5">
              <p className="truncate text-xs font-medium text-slate-500 sm:text-sm">{item.label}</p>
              <p className={`tabular mt-1.5 text-2xl font-bold sm:text-[1.65rem] ${statusTones[index % statusTones.length]}`}>{item.count}</p>
            </div>
          ))}
        </div>

        {report.show.salaries ? (
          <ReportSection icon={Banknote} title={t(`رواتب ${report.title}`, `${report.title} payroll`)}>
            <dl className="grid grid-cols-2 gap-px bg-slate-100 text-sm lg:grid-cols-4">
              {(
                [
                  [t("الإجمالي", "Gross"), money(report.totals.gross, currency), "text-slate-900"],
                  [t("الخصومات", "Deductions"), money(report.totals.deductions, currency), "text-red-700"],
                  [t("الصافي", "Net"), money(report.totals.net, currency), "text-teal-800"],
                  [t("مصروف / غير مصروف", "Paid / unpaid"), `${report.totals.paid} / ${report.totals.unpaid}`, "text-slate-900"],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="min-w-0 bg-white px-4 py-3 sm:px-5">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className={`tabular mt-0.5 truncate font-bold ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {report.payroll.length ? (
              <div className="table-shell rounded-none border-x-0 border-b-0 shadow-none">
                <table className="table-stack text-sm">
                  <thead>
                    <tr>
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
                      <tr key={row.id}>
                        <td className="cell-title px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          <div className="tabular text-xs text-slate-500">{row.employeeNumber}</div>
                        </td>
                        <td data-label={t("صاحب العمل", "Employer")} className="px-4 py-3">
                          {row.employer || "—"}
                        </td>
                        <td data-label={t("الإجمالي", "Gross")} className={td}>
                          {money(row.gross, currency)}
                        </td>
                        <td data-label={t("الخصومات", "Deductions")} className={`${td} ${row.deductions ? "text-red-700" : "text-slate-400"}`}>
                          {money(row.deductions, currency)}
                        </td>
                        <td data-label={t("الصافي", "Net")} className={`${td} font-bold text-slate-900`}>
                          {money(row.net, currency)}
                        </td>
                        <td data-label={t("الحالة", "Status")} className="px-4 py-3">
                          <ToneBadge tone={row.paid ? "green" : "amber"}>{row.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                        </td>
                        <td data-label={t("الإيصال", "Receipt")} className={`${td} text-xs text-slate-500`}>
                          {row.paid ? `${row.receiptNo} · ${formatDate(row.paidAt)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-4 py-3" colSpan={2}>
                        {t("المجموع", "Total")}
                      </td>
                      <td data-label={t("الإجمالي", "Gross")} className={td}>
                        {money(report.totals.gross, currency)}
                      </td>
                      <td data-label={t("الخصومات", "Deductions")} className={td}>
                        {money(report.totals.deductions, currency)}
                      </td>
                      <td data-label={t("الصافي", "Net")} className={td}>
                        {money(report.totals.net, currency)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Empty>{t("لا يوجد مسير لهذا الشهر.", "No payroll for this month.")}</Empty>
            )}
            {report.totals.extraEarnings || report.totals.extraDeductions ? (
              <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">
                {t(
                  `منها مكافآت وبدلات واستحقاقات ${money(report.totals.extraEarnings, currency)}، وأقساط سلف وخصومات ${money(report.totals.extraDeductions, currency)}.`,
                  `Including bonuses, allowances and entitlements of ${money(report.totals.extraEarnings, currency)}, and advance instalments and deductions of ${money(report.totals.extraDeductions, currency)}.`,
                )}
              </p>
            ) : null}
          </ReportSection>
        ) : null}

        {report.show.salaries && report.advances.length ? (
          <ReportSection
            icon={HandCoins}
            title={t("السلف القائمة", "Open advances")}
            aside={
              <>
                {t("المتبقي", "Outstanding")}: <strong className="tabular text-slate-900">{money(report.advancesOutstanding, currency)}</strong>
              </>
            }
          >
            <div className="table-shell rounded-none border-0 shadow-none">
              <table className="table-stack text-sm">
                <thead>
                  <tr>
                    <th className={th}>{t("الموظف", "Employee")}</th>
                    <th className={th}>{t("السلفة", "Advance")}</th>
                    <th className={th}>{t("تاريخ التسليم", "Handed over")}</th>
                    <th className={th}>{t("المبلغ", "Amount")}</th>
                    <th className={th}>{t("المسدّد", "Repaid")}</th>
                    <th className={th}>{t("المتبقي", "Outstanding")}</th>
                    <th className={th}>{t("قسط هذا الشهر", "This month")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.advances.map((row) => (
                    <tr key={row.id}>
                      <td className="cell-title px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="tabular text-xs text-slate-500">{row.employeeNumber}</div>
                      </td>
                      <td data-label={t("السلفة", "Advance")} className="px-4 py-3">
                        {row.title}
                      </td>
                      <td data-label={t("تاريخ التسليم", "Handed over")} className={td}>
                        {formatDate(row.issuedAt)}
                      </td>
                      <td data-label={t("المبلغ", "Amount")} className={td}>
                        {money(row.amount, currency)}
                      </td>
                      <td data-label={t("المسدّد", "Repaid")} className={`${td} text-emerald-700`}>
                        {money(row.repaid, currency)}
                      </td>
                      <td data-label={t("المتبقي", "Outstanding")} className={`${td} font-bold text-slate-900`}>
                        {money(row.remaining, currency)}
                      </td>
                      <td data-label={t("قسط هذا الشهر", "This month")} className={td}>
                        {money(row.thisMonth, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportSection>
        ) : null}

        <div className="space-y-5">
          {report.show.attendance ? (
            <ReportSection icon={CalendarX2} title={t("الغياب والخصم", "Absence & deductions")}>
              {report.absence.length ? (
                <div className="table-shell rounded-none border-0 shadow-none">
                  <table className="table-stack text-sm">
                    <thead>
                      <tr>
                        <th className={th}>{t("الموظف", "Employee")}</th>
                        <th className={th}>{t("أيام الخصم", "Deducted days")}</th>
                        {report.show.salaries ? <th className={th}>{t("قيمة الخصم في المسير", "Deduction in payroll")}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {report.absence.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-title px-4 py-3">
                            <Link href={`/employees/${row.id}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                              {row.name}
                            </Link>
                          </td>
                          <td data-label={t("أيام الخصم", "Deducted days")} className={td}>
                            {daysLabel(row.days)}
                          </td>
                          {report.show.salaries ? (
                            <td data-label={t("قيمة الخصم في المسير", "Deduction in payroll")} className={`${td} text-red-700`}>
                              {money(row.deduction || 0, currency)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>{t("لا يوجد غياب مخصوم هذا الشهر.", "No deducted absence this month.")}</Empty>
              )}
            </ReportSection>
          ) : null}

          {report.show.documents ? (
            <ReportSection
              icon={FileWarning}
              title={t("المستندات التي تحتاج متابعة", "Documents needing attention")}
              aside={
                <span className="flex flex-wrap gap-1.5">
                  <ToneBadge tone="red">
                    {t("منتهية", "Expired")}: {report.documentCounts.expired}
                  </ToneBadge>
                  <ToneBadge tone="amber">
                    {t("خلال التحذير", "Within warning")}: {report.documentCounts.soon}
                  </ToneBadge>
                </span>
              }
            >
              {urgentDocs.length ? (
                <div className="table-shell rounded-none border-0 shadow-none">
                  <table className="table-stack text-sm">
                    <thead>
                      <tr>
                        <th className={th}>{t("الموظف", "Employee")}</th>
                        <th className={th}>{t("المستند", "Document")}</th>
                        <th className={th}>{t("الرقم", "Number")}</th>
                        <th className={th}>{t("الانتهاء", "Expiry")}</th>
                        <th className={th}>{t("الحالة", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {urgentDocs.map((row) => (
                        <tr key={row.key}>
                          <td className="cell-title px-4 py-3 font-semibold text-slate-900">{row.employeeName}</td>
                          <td data-label={t("المستند", "Document")} className="px-4 py-3">
                            {row.label}
                          </td>
                          <td data-label={t("الرقم", "Number")} className={td}>
                            {text(row.number)}
                          </td>
                          <td data-label={t("الانتهاء", "Expiry")} className={td}>
                            {formatDate(row.expiry)}
                          </td>
                          <td data-label={t("الحالة", "Status")} className="px-4 py-3">
                            <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>{t("كل المستندات سارية.", "All documents are valid.")}</Empty>
              )}
            </ReportSection>
          ) : null}
        </div>

        <p className="text-xs text-slate-400">
          {report.company} — {t("أُنشئ في", "Generated on")} {formatDate(new Date())}
        </p>
      </div>
    </div>
  );
}
