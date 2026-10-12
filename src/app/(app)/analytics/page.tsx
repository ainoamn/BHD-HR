import Link from "next/link";
import { BriefcaseBusiness, CalendarX2, ChartNoAxesCombined, Flag, HandCoins, Repeat2, Sparkles, Users, Wallet } from "lucide-react";
import { OwnerInsights } from "@/components/owner-insights";
import { Card, EmptyState, PageHeader, SectionTitle, Stat, ToneBadge, linkAction } from "@/components/ui";
import { CONTRACT_HORIZON_DAYS, type MonthPoint, loadAnalytics } from "@/lib/analytics";
import { ASSET_STATUS_LABEL } from "@/lib/assets";
import { can, requirePermission } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/expenses";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { STAGES, STAGE_LABEL } from "@/lib/recruitment";
import { cn, formatDate, money } from "@/lib/utils";

type Bar = { key: number; label: string; title: string; segments: { value: number; className: string }[]; note?: string };

/** Vertical bars, one per month; stacked when a month has several segments. Pure CSS so it scales down to 360px. */
function Bars({ bars, empty, caption }: { bars: Bar[]; empty: string; caption: string }) {
  const max = Math.max(0, ...bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0)));
  if (!max) return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <figure>
      <div className="grid grid-cols-12 items-start gap-1 sm:gap-2" dir="ltr">
        {bars.map((bar) => {
          const total = bar.segments.reduce((sum, segment) => sum + segment.value, 0);
          return (
            <div key={bar.key} className="flex min-w-0 flex-col items-center gap-1" title={bar.title}>
              <div className="flex h-36 w-full items-end justify-center">
                <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-md transition-[height] duration-300" style={{ height: `${Math.max(total ? 3 : 0, (total / max) * 100)}%` }}>
                  {bar.segments.map((segment, index) => (segment.value ? <span key={index} className={cn("block w-full", segment.className)} style={{ height: `${(segment.value / total) * 100}%` }} /> : null))}
                </div>
              </div>
              <span className="tabular text-center text-[0.65rem] leading-4 text-slate-500">{bar.label}</span>
              {bar.note ? <span className="tabular text-center text-[0.6rem] leading-3 text-slate-400">{bar.note}</span> : null}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-center text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", item.className)} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Meter({ label, value, max, text, className = "bg-teal-600" }: { label: string; value: number; max: number; text: string; className?: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="truncate text-slate-600">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <span className={cn("block h-full rounded-full", className)} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="tabular text-end font-semibold text-slate-800">{text}</span>
    </li>
  );
}

export default async function AnalyticsPage() {
  const user = await requirePermission("reports.view");
  const { lang, t } = await getI18n();
  const withMoney = can(user, "salaries.view");
  const data = await loadAnalytics(user.companyId, { money: withMoney });
  const currency = user.company.currency;
  const label = (point: MonthPoint) => String(point.month);
  const period = (point: MonthPoint) => `${monthName(point.month, lang)} ${point.year}`;
  const caption = `${t("الأشهر", "Months")}: ${period(data.months[0])} – ${period(data.months.at(-1)!)}`;
  const hasEmployees = data.headcount > 0 || data.months.some((point) => point.headcount > 0);
  const funnelMax = Math.max(0, ...data.funnel.map((item) => item.count));
  const expenseMax = Math.max(0, ...data.expenses.map((item) => item.amount));
  const lastCostLabel = data.lastCost ? t(`راتب ${period(data.lastCost)}`, `${period(data.lastCost)} payroll`) : t("لا رواتب مسجلة بعد", "No payroll recorded yet");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={ChartNoAxesCombined}
        title={t("لوحة المالك", "Owner dashboard")}
        description={t(
          "صورة الشركة في صفحة واحدة لآخر 12 شهراً: عدد الموظفين وتكلفتهم، الدوران والغياب، التعمين، التزامات نهاية الخدمة، والتوظيف والمصروفات — مع قراءة بالذكاء الاصطناعي.",
          "The company on one page for the last 12 months: headcount and cost, turnover and absence, Omanization, end-of-service liability, hiring and expenses — with an AI reading.",
        )}
      />

      {!hasEmployees ? (
        <EmptyState icon={Users} title={t("لا توجد بيانات بعد", "No data yet")} text={t("أضف موظفين وسجّل الرواتب والحضور لتظهر التحليلات هنا.", "Add employees and record payroll and attendance to see analytics here.")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <Stat icon={Users} label={t("الموظفون النشطون", "Active employees")} value={String(data.headcount)} hint={t(`تعيين ${data.hires12} · خروج ${data.leavers12} خلال 12 شهراً`, `${data.hires12} hired · ${data.leavers12} left in 12 months`)} />
            {withMoney ? <Stat icon={Wallet} tone="navy" label={t("تكلفة آخر مسير", "Last payroll cost")} value={data.lastCost?.cost !== undefined && data.lastCost?.cost !== null ? money(data.lastCost.cost, currency) : "—"} hint={lastCostLabel} /> : null}
            <Stat icon={Repeat2} tone="gold" label={t("معدل الدوران السنوي", "Annual turnover")} value={`${data.turnover}%`} hint={t("الخارجون ÷ متوسط عدد الموظفين", "Leavers ÷ average headcount")} />
            <Stat icon={CalendarX2} label={t("أيام الغياب لكل موظف", "Absence days per employee")} value={String(data.absencePerHead)} hint={t(`${data.absence12} يوم غياب خلال 12 شهراً`, `${data.absence12} absence days in 12 months`)} />
            <Stat icon={Flag} tone="navy" label={t("نسبة التعمين", "Omanization")} value={`${data.omanization.percent}%`} hint={t(`${data.omanization.omani} من ${data.omanization.total}`, `${data.omanization.omani} of ${data.omanization.total}`)} />
            {withMoney ? <Stat icon={HandCoins} tone="gold" label={t("مكافآت نهاية الخدمة المستحقة", "End-of-service liability")} value={money(data.liability, currency)} hint={t(`لـ ${data.liabilityCount} موظف غير عُماني لو انتهت خدمتهم اليوم`, `For ${data.liabilityCount} non-Omani employees if they left today`)} /> : null}
          </div>

          <Card>
            <SectionTitle hint={t("يقرأ أرقام هذه الصفحة ويقترح ما يستحق انتباهك.", "Reads the figures on this page and points out what needs your attention.")}>
              <span className="inline-flex items-center gap-2">
                <Sparkles size={17} className="text-gold-600" />
                {t("قراءة ذكية للأرقام", "AI reading of the figures")}
              </span>
            </SectionTitle>
            <OwnerInsights />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {withMoney ? (
              <Card>
                <SectionTitle hint={t(`الصافي + الحماية الاجتماعية بحصتيها · المجموع ${money(data.cost12, currency)}`, `Net + social protection (both shares) · total ${money(data.cost12, currency)}`)}>{t("تكلفة الرواتب الشهرية", "Monthly payroll cost")}</SectionTitle>
                <Bars
                  caption={caption}
                  empty={t("لا رواتب مسجلة في آخر 12 شهراً", "No payroll in the last 12 months")}
                  bars={data.months.map((point) => ({
                    key: point.key,
                    label: label(point),
                    title: `${period(point)}: ${point.cost !== null ? money(point.cost, currency) : "—"}${point.paidCount ? ` · ${point.paidCount} ${t("موظف", "employees")}` : ""}`,
                    segments: [{ value: point.cost || 0, className: "bg-teal-600" }],
                  }))}
                />
              </Card>
            ) : null}
            <Card>
              <SectionTitle hint={t("في نهاية كل شهر، مع التعيينات (+) والخروج (−)", "At each month end, with hires (+) and leavers (−)")}>{t("عدد الموظفين", "Headcount")}</SectionTitle>
              <Bars
                caption={caption}
                empty={t("لا موظفين", "No employees")}
                bars={data.months.map((point) => ({
                  key: point.key,
                  label: label(point),
                  title: `${period(point)}: ${point.headcount} · +${point.hires} / −${point.leavers}`,
                  segments: [{ value: point.headcount, className: "bg-navy-500" }],
                  note: [point.hires ? `+${point.hires}` : "", point.leavers ? `−${point.leavers}` : ""].filter(Boolean).join(" ") || undefined,
                }))}
              />
            </Card>
            <Card>
              <SectionTitle hint={t(`غياب ${data.absence12} · مرضية ${data.sick12} · إجازات ${data.leave12} يوماً`, `Absence ${data.absence12} · sick ${data.sick12} · leave ${data.leave12} days`)}>{t("الغياب والإجازات", "Absence & leave")}</SectionTitle>
              <Bars
                caption={caption}
                empty={t("لا حضور مسجل في آخر 12 شهراً", "No attendance in the last 12 months")}
                bars={data.months.map((point) => ({
                  key: point.key,
                  label: label(point),
                  title: `${period(point)}: ${t("غياب", "absence")} ${point.absence} · ${t("مرضية", "sick")} ${point.sick} · ${t("إجازات", "leave")} ${point.leave}`,
                  segments: [
                    { value: point.absence, className: "bg-red-500" },
                    { value: point.sick, className: "bg-amber-400" },
                    { value: point.leave, className: "bg-teal-300" },
                  ],
                }))}
              />
              <Legend
                items={[
                  { label: t("غياب", "Absence"), className: "bg-red-500" },
                  { label: t("إجازة مرضية", "Sick leave"), className: "bg-amber-400" },
                  { label: t("إجازات أخرى", "Other leave"), className: "bg-teal-300" },
                ]}
              />
            </Card>
            <Card>
              <SectionTitle hint={t("الموظفون النشطون حسب القسم", "Active employees by department")}>{t("الأقسام", "Departments")}</SectionTitle>
              <div className="table-shell">
                <table className="table-stack w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="px-2 py-2 text-start font-medium">{t("القسم", "Department")}</th>
                      <th className="px-2 py-2 text-start font-medium">{t("الموظفون", "Staff")}</th>
                      <th className="px-2 py-2 text-start font-medium">{t("التعمين", "Omani")}</th>
                      {withMoney ? <th className="px-2 py-2 text-start font-medium">{t("الرواتب شهرياً", "Monthly pay")}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.departments.map((group) => (
                      <tr key={group.name || "-"}>
                        <td className="cell-title px-2 py-2 font-medium text-slate-900" data-label={t("القسم", "Department")}>
                          {(lang === "en" && group.nameEn) || group.name || t("بلا قسم", "No department")}
                        </td>
                        <td className="tabular px-2 py-2" data-label={t("الموظفون", "Staff")}>
                          {group.headcount}
                        </td>
                        <td className="tabular px-2 py-2" data-label={t("التعمين", "Omani")}>
                          {group.omani} ({group.headcount ? Math.round((group.omani / group.headcount) * 100) : 0}%)
                        </td>
                        {withMoney ? (
                          <td className="tabular px-2 py-2" data-label={t("الرواتب شهرياً", "Monthly pay")}>
                            {money(group.monthly, currency)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <SectionTitle
                hint={t(`${data.openJobs} وظيفة مفتوحة · مرشحو آخر 12 شهراً`, `${data.openJobs} open vacancies · last 12 months`)}
                action={
                  <Link href="/recruitment" className={linkAction}>
                    {t("التوظيف", "Recruitment")}
                  </Link>
                }
              >
                <span className="inline-flex items-center gap-2">
                  <BriefcaseBusiness size={17} className="text-teal-700" />
                  {t("مسار التوظيف", "Hiring funnel")}
                </span>
              </SectionTitle>
              {data.funnel.length ? (
                <ul className="space-y-2">
                  {STAGES.map((stage) => {
                    const count = data.funnel.find((item) => item.stage === stage)?.count || 0;
                    return <Meter key={stage} label={pick(STAGE_LABEL[stage], lang, stage)} value={count} max={funnelMax} text={String(count)} className={stage === "REJECTED" ? "bg-slate-400" : stage === "HIRED" ? "bg-emerald-500" : "bg-teal-600"} />;
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t("لا مرشحين بعد.", "No candidates yet.")}</p>
              )}
            </Card>
            {withMoney ? (
              <Card>
                <SectionTitle
                  hint={t("المعتمدة والمصروفة · آخر 12 شهراً", "Approved and paid · last 12 months")}
                  action={
                    <Link href="/expenses?view=PAID" className={linkAction}>
                      {t("المصروفات", "Expenses")}
                    </Link>
                  }
                >
                  {t("المصروفات حسب النوع", "Expenses by category")}
                </SectionTitle>
                {data.expenses.length ? (
                  <ul className="space-y-2">
                    {data.expenses.map((item) => (
                      <Meter key={item.category} label={pick(EXPENSE_CATEGORY_LABEL[item.category], lang, item.category)} value={item.amount} max={expenseMax} text={money(item.amount, currency)} className="bg-gold-500" />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{t("لا مصروفات معتمدة.", "No approved expenses.")}</p>
                )}
              </Card>
            ) : null}
            <Card>
              <SectionTitle
                action={
                  <Link href="/assets" className={linkAction}>
                    {t("العهد", "Assets")}
                  </Link>
                }
              >
                {t("العُهد والأصول", "Assets")}
              </SectionTitle>
              {data.assets.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.assets.map((item) => (
                    <li key={item.status} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-slate-700">{pick(ASSET_STATUS_LABEL[item.status], lang, item.status)}</span>
                      <span className="tabular font-semibold text-slate-900">
                        {item.count}
                        {item.value ? <span className="ms-2 text-xs font-normal text-slate-500">{money(item.value, currency)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t("لا عهد مسجلة.", "No assets recorded.")}</p>
              )}
              {data.reviewAverage !== null ? (
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-100">
                  {t("متوسط تقييم الأداء", "Average performance score")}: <span className="tabular font-bold text-slate-900">{data.reviewAverage} / 5</span>
                  <span className="text-xs text-slate-500"> · {t(`${data.reviewCount} تقييم`, `${data.reviewCount} reviews`)}</span>
                </p>
              ) : null}
            </Card>
          </div>

          <Card>
            <SectionTitle hint={t(`المنتهية والتي تنتهي خلال ${CONTRACT_HORIZON_DAYS} يوماً`, `Ended or ending within ${CONTRACT_HORIZON_DAYS} days`)}>{t("عقود تحتاج قراراً", "Contracts needing a decision")}</SectionTitle>
            {data.contracts.length ? (
              <ul className="divide-y divide-slate-100">
                {data.contracts.map((item) => (
                  <li key={item.id}>
                    <Link href={`/employees/${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition hover:text-teal-800">
                      <span className="font-medium text-slate-900">{lang === "en" && item.nameEn ? item.nameEn : item.fullName}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-500">{formatDate(item.contractEnd)}</span>
                        <ToneBadge tone={item.days < 0 ? "red" : item.days <= 30 ? "orange" : "amber"}>
                          {item.days < 0 ? t("منتهٍ", "Ended") : t(`بعد ${item.days} يوماً`, `in ${item.days} days`)}
                        </ToneBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("لا عقود تنتهي قريباً.", "No contracts ending soon.")}</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
