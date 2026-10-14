import Link from "next/link";
import { AlertTriangle, Banknote, Building2, CalendarClock, CreditCard, History, Layers, TrendingUp, UserPlus, Users } from "lucide-react";
import { ColumnChart, Monogram } from "@/components/admin/admin-ui";
import { Flash } from "@/components/flash";
import { Card, PageHeader, SectionTitle, Stat, ToneBadge, linkAction } from "@/components/ui";
import { companyRows, recurringByPlan, revenueByMonth, signupsByMonth } from "@/lib/admin-data";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { formatRial } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE, type AccessState } from "@/lib/subscription";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const DAY = 86_400_000;
const STATES: AccessState[] = ["ACTIVE", "TRIAL", "GRACE", "EXPIRED", "SUSPENDED", "LEGACY"];
const STATE_BAR: Record<AccessState, string> = {
  ACTIVE: "bg-emerald-500",
  TRIAL: "bg-navy-500",
  GRACE: "bg-amber-500",
  EXPIRED: "bg-red-500",
  SUSPENDED: "bg-red-800",
  LEGACY: "bg-slate-400",
};

const rial = (value: number) => Math.round(value * 1000) / 1000;

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [rows, byPlan, revenue, plans, paidAll, pending, recentPayments, users, logs] = await Promise.all([
    companyRows(now),
    recurringByPlan(now),
    revenueByMonth(12, now),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, nameEn: true, isActive: true } }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { provider: "MANUAL", status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.payment.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 6, include: { company: { select: { id: true, name: true } } } }),
    prisma.user.count(),
    prisma.platformLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const mrr = rial([...byPlan.values()].reduce((sum, item) => sum + item.mrr, 0));
  const paying = [...byPlan.values()].reduce((sum, item) => sum + item.paying, 0);
  const thisMonth = revenue[revenue.length - 1].value;
  const lastMonth = revenue[revenue.length - 2].value;
  const change = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const yearRevenue = rial(revenue.reduce((sum, point) => sum + point.value, 0));
  const signups = signupsByMonth(rows, 12, now);
  const newIn30 = rows.filter((row) => row.createdAt.getTime() >= now.getTime() - 30 * DAY).length;
  const employees = rows.reduce((sum, row) => sum + row.employees, 0);
  const count = (state: AccessState) => rows.filter((row) => row.access.state === state).length;

  const ending = rows
    .filter((row) => row.access.active && row.access.endsAt && row.access.daysLeft !== null && row.access.daysLeft <= 7)
    .sort((a, b) => a.access.endsAt!.getTime() - b.access.endsAt!.getTime());
  const attention = [
    ...rows.filter((row) => row.access.state === "GRACE").map((row) => ({ row, why: t("في مهلة التجديد — الاشتراك منتهٍ", "In renewal grace — the plan has ended"), tone: "amber" })),
    ...ending.filter((row) => row.access.state !== "GRACE").map((row) => ({ row, why: t(`ينتهي خلال ${row.access.daysLeft} يوم`, `Ends in ${row.access.daysLeft} day(s)`), tone: "amber" })),
    ...rows
      .filter((row) => row.access.state === "EXPIRED" && row.access.endsAt && row.access.endsAt.getTime() >= now.getTime() - 30 * DAY)
      .map((row) => ({ row, why: t("انتهى خلال آخر 30 يوماً", "Ended in the last 30 days"), tone: "red" })),
  ];

  const mix = plans
    .map((plan) => ({ plan, companies: rows.filter((row) => row.access.planId === plan.id).length, mrr: rial(byPlan.get(plan.id)?.mrr ?? 0) }))
    .filter((item) => item.companies || item.plan.isActive);
  const mostCompanies = Math.max(1, ...mix.map((item) => item.companies));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("نظرة عامة على المنصة", "Platform overview")}
        description={t("الإيرادات، نمو الشركات، ومن يحتاج متابعة اليوم.", "Revenue, company growth, and who needs attention today.")}
      />
      <Flash error={sp.error} message={sp.message} />

      {pending._count ? (
        <Link
          href="/admin/payments?status=PENDING"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-300"
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {t(`${pending._count} تحويل بنكي بانتظار تأكيدك`, `${pending._count} bank transfer(s) awaiting your confirmation`)} · {formatRial(rial(pending._sum.amount ?? 0), lang)}
          </span>
          <span className="underline underline-offset-4">{t("مراجعة الآن", "Review now")}</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("الإيراد الشهري المتكرر", "Monthly recurring revenue")} value={formatRial(mrr, lang)} hint={t(`سنوياً ${formatRial(rial(mrr * 12))} · ${paying} شركة تدفع`, `${formatRial(rial(mrr * 12), "en")} a year · ${paying} paying`)} icon={TrendingUp} tone="gold" href="/admin/plans" />
        <Stat
          label={t("المحصّل هذا الشهر", "Collected this month")}
          value={formatRial(thisMonth, lang)}
          hint={change === null ? t(`الإجمالي ${formatRial(rial(paidAll._sum.amount ?? 0))}`, `Total ${formatRial(rial(paidAll._sum.amount ?? 0), "en")}`) : t(`${change >= 0 ? "+" : ""}${change}% عن الشهر الماضي`, `${change >= 0 ? "+" : ""}${change}% vs last month`)}
          icon={Banknote}
          tone="aqua"
          href={`/admin/payments?status=PAID&from=${monthStart.toISOString().slice(0, 10)}`}
        />
        <Stat label={t("الشركات", "Companies")} value={String(rows.length)} hint={t(`${newIn30} جديدة خلال 30 يوماً`, `${newIn30} new in 30 days`)} icon={Building2} href="/admin/companies" />
        <Stat label={t("المستخدمون · الموظفون", "Users · employees")} value={`${users} · ${employees}`} hint={t("حسابات الدخول · الموظفون النشطون", "Sign-in accounts · active employees")} icon={Users} tone="navy" href="/admin/users" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle hint={t(`آخر 12 شهراً: ${formatRial(yearRevenue)}`, `Last 12 months: ${formatRial(yearRevenue, "en")}`)}>{t("الإيراد المحصّل شهرياً", "Revenue collected per month")}</SectionTitle>
          <ColumnChart points={revenue} lang={lang} tone="gold" format={(value) => formatRial(value, lang)} />
        </Card>
        <Card className="min-w-0">
          <SectionTitle hint={t(`آخر 12 شهراً: ${signups.reduce((sum, point) => sum + point.value, 0)} شركة`, `Last 12 months: ${signups.reduce((sum, point) => sum + point.value, 0)} companies`)}>{t("الشركات الجديدة شهرياً", "New companies per month")}</SectionTitle>
          <ColumnChart points={signups} lang={lang} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle action={<Link href="/admin/companies" className={linkAction}>{t("كل الشركات", "All companies")}</Link>}>{t("الشركات حسب الحالة", "Companies by status")}</SectionTitle>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            {STATES.map((state) => (count(state) ? <div key={state} className={STATE_BAR[state]} style={{ width: `${(count(state) / rows.length) * 100}%` }} /> : null))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STATES.map((state) => (
              <li key={state}>
                <Link href={`/admin/companies?state=${state}`} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition hover:bg-slate-50">
                  <span className={cn("size-2.5 shrink-0 rounded-full", STATE_BAR[state])} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-slate-600">{ACCESS_LABEL[state][lang]}</span>
                  <span className="tabular font-bold text-slate-900">{count(state)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0">
          <SectionTitle action={<Link href="/admin/plans" className={linkAction}>{t("إدارة الباقات", "Manage plans")}</Link>}>
            <span className="inline-flex items-center gap-2">
              <Layers size={18} className="text-teal-700" />
              {t("توزيع الباقات", "Plan mix")}
            </span>
          </SectionTitle>
          <ul className="space-y-3">
            {mix.map(({ plan, companies, mrr: planMrr }) => (
              <li key={plan.id} className="text-sm">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <Link href={`/admin/companies?plan=${plan.id}`} className="min-w-0 truncate font-semibold text-slate-800 hover:text-teal-700">
                    {(lang === "en" && plan.nameEn) || plan.name}
                  </Link>
                  <span className="tabular shrink-0 text-xs text-slate-500">
                    {t(`${companies} شركة`, `${companies} co.`)}
                    {planMrr ? ` · ${formatRial(planMrr, lang)}/${t("شهر", "mo")}` : ""}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${(companies / mostCompanies) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle hint={t("مهلة تجديد، أو تنتهي خلال 7 أيام، أو انتهت مؤخراً.", "In grace, ending within 7 days, or recently ended.")}>
            <span className="inline-flex items-center gap-2">
              <CalendarClock size={18} className="text-amber-600" />
              {t("تحتاج متابعة", "Needs follow-up")}
            </span>
          </SectionTitle>
          {attention.length ? (
            <ul className="divide-y divide-slate-100">
              {attention.slice(0, 8).map(({ row, why, tone }) => (
                <li key={`${row.id}-${why}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <Monogram name={row.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/companies/${row.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                      {row.name}
                    </Link>
                    <p className={cn("truncate text-xs", tone === "red" ? "text-red-700" : "text-amber-700")}>{why}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(row.access.endsAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t("لا شيء يحتاج متابعة الآن.", "Nothing needs follow-up now.")}</p>
          )}
        </Card>

        <Card className="min-w-0">
          <SectionTitle action={<Link href="/admin/companies?sort=newest" className={linkAction}>{t("الكل", "All")}</Link>}>
            <span className="inline-flex items-center gap-2">
              <UserPlus size={18} className="text-teal-700" />
              {t("أحدث التسجيلات", "Latest sign-ups")}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-slate-100">
            {rows.slice(0, 6).map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Monogram name={row.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/companies/${row.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {row.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {row.owner || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <ToneBadge tone={ACCESS_TONE[row.access.state]}>{ACCESS_LABEL[row.access.state][lang]}</ToneBadge>
                  <span className="text-xs text-slate-500">{formatDate(row.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle action={<Link href="/admin/payments" className={linkAction}>{t("كل المدفوعات", "All payments")}</Link>}>
            <span className="inline-flex items-center gap-2">
              <CreditCard size={18} className="text-teal-700" />
              {t("أحدث المدفوعات", "Latest payments")}
            </span>
          </SectionTitle>
          {recentPayments.length ? (
            <ul className="divide-y divide-slate-100">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/companies/${payment.company.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                      {payment.company.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      <span dir="ltr">{receiptNumber(payment.number)}</span> · {payment.planName} · {formatDateTime(payment.paidAt)}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-bold text-slate-900">{formatRial(payment.amount, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t("لا توجد مدفوعات بعد.", "No payments yet.")}</p>
          )}
        </Card>

        <Card className="min-w-0">
          <SectionTitle action={<Link href="/admin/log" className={linkAction}>{t("السجل كاملاً", "Full log")}</Link>}>
            <span className="inline-flex items-center gap-2">
              <History size={18} className="text-teal-700" />
              {t("آخر إجراءات الإدارة", "Latest admin actions")}
            </span>
          </SectionTitle>
          {logs.length ? (
            <ol className="relative space-y-3 border-s border-slate-200 ps-4">
              {logs.map((log) => (
                <li key={log.id} className="relative text-sm">
                  <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-teal-600 ring-4 ring-surface" aria-hidden="true" />
                  <p className="break-words font-medium text-slate-800">{log.message}</p>
                  <p className="text-xs text-slate-500">
                    {log.userName || "—"} · {formatDateTime(log.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t("لا توجد إجراءات بعد.", "No actions yet.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
