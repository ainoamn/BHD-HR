import Link from "next/link";
import { AlertTriangle, Banknote, Building2, CalendarClock, CreditCard, TrendingUp, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { Card, PageHeader, SectionTitle, Stat, ToneBadge, linkAction } from "@/components/ui";
import { companyRows, monthlyRecurring } from "@/lib/admin-data";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { formatRial } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE, type AccessState } from "@/lib/subscription";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [rows, mrr, paidMonth, paidAll, pending, recentPayments, users] = await Promise.all([
    companyRows(now),
    monthlyRecurring(now),
    prisma.payment.aggregate({ where: { status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.payment.count({ where: { provider: "MANUAL", status: "PENDING" } }),
    prisma.payment.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 8, include: { company: { select: { id: true, name: true } } } }),
    prisma.user.count(),
  ]);
  const byState = (state: AccessState) => rows.filter((row) => row.access.state === state).length;
  const newThisMonth = rows.filter((row) => row.createdAt >= new Date(now.getTime() - 30 * 86_400_000)).length;
  const employees = rows.reduce((sum, row) => sum + row.employees, 0);
  const expiring = rows
    .filter((row) => row.access.active && row.access.endsAt && row.access.daysLeft !== null && row.access.daysLeft <= 7)
    .sort((a, b) => a.access.endsAt!.getTime() - b.access.endsAt!.getTime());
  const states: AccessState[] = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "SUSPENDED", "LEGACY"];

  return (
    <div className="space-y-6">
      <PageHeader title={t("نظرة عامة على المنصة", "Platform overview")} description={t("الشركات المشتركة، الإيرادات، ومن يحتاج متابعة.", "Subscribed companies, revenue, and who needs attention.")} />
      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("الشركات", "Companies")} value={String(rows.length)} hint={t(`${newThisMonth} جديدة خلال 30 يوماً`, `${newThisMonth} new in 30 days`)} icon={Building2} href="/admin/companies" />
        <Stat label={t("الإيراد الشهري المتكرر", "Monthly recurring revenue")} value={formatRial(Math.round(mrr * 1000) / 1000, lang)} icon={TrendingUp} tone="gold" />
        <Stat label={t("المحصّل هذا الشهر", "Collected this month")} value={formatRial(paidMonth._sum.amount ?? 0, lang)} hint={t(`${paidMonth._count} دفعة · الإجمالي ${formatRial(paidAll._sum.amount ?? 0)}`, `${paidMonth._count} payment(s) · total ${formatRial(paidAll._sum.amount ?? 0, "en")}`)} icon={Banknote} tone="aqua" href="/admin/payments" />
        <Stat label={t("المستخدمون والموظفون", "Users & employees")} value={`${users} · ${employees}`} hint={t("حسابات الدخول · الموظفون النشطون", "Sign-in accounts · active employees")} icon={Users} tone="navy" href="/admin/users" />
      </div>

      {pending ? (
        <Link href="/admin/payments?status=PENDING" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <AlertTriangle size={18} className="shrink-0" />
          {t(`${pending} تحويل بنكي بانتظار تأكيدك`, `${pending} bank transfer(s) awaiting your confirmation`)}
        </Link>
      ) : null}

      <Card>
        <SectionTitle>{t("الشركات حسب الحالة", "Companies by status")}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {states.map((state) => (
            <Link key={state} href={`/admin/companies?state=${state}`} className="rounded-2xl border border-slate-200 bg-surface px-4 py-3 shadow-card transition hover:border-teal-200">
              <ToneBadge tone={ACCESS_TONE[state]}>{ACCESS_LABEL[state][lang]}</ToneBadge>
              <p className="tabular mt-1.5 text-2xl font-bold text-slate-900">{byState(state)}</p>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle hint={t("تنتهي التجربة أو الاشتراك خلال 7 أيام.", "Trial or subscription ends within 7 days.")}>
            <span className="inline-flex items-center gap-2">
              <CalendarClock size={18} className="text-amber-600" />
              {t("قريبة الانتهاء", "Ending soon")}
            </span>
          </SectionTitle>
          {expiring.length ? (
            <ul className="divide-y divide-slate-100">
              {expiring.slice(0, 10).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/admin/companies/${row.id}`} className="min-w-0 truncate font-semibold text-slate-900 hover:text-teal-700">
                    {row.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <ToneBadge tone={ACCESS_TONE[row.access.state]}>{ACCESS_LABEL[row.access.state][lang]}</ToneBadge>
                    <span className="text-xs text-slate-500">{formatDate(row.access.endsAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد اشتراكات تنتهي قريباً.", "Nothing ends soon.")}</p>
          )}
        </Card>

        <Card className="min-w-0">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <UserPlus size={18} className="text-teal-700" />
              {t("أحدث التسجيلات", "Latest sign-ups")}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-slate-100">
            {rows.slice(0, 8).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/companies/${row.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {row.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {row.owner || "—"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{formatDate(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionTitle action={<Link href="/admin/payments" className={linkAction}>{t("كل المدفوعات", "All payments")}</Link>}>
          <span className="inline-flex items-center gap-2">
            <CreditCard size={18} className="text-teal-700" />
            {t("أحدث المدفوعات", "Latest payments")}
          </span>
        </SectionTitle>
        {recentPayments.length ? (
          <ul className="divide-y divide-slate-100">
            {recentPayments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/companies/${payment.company.id}`} className="font-semibold text-slate-900 hover:text-teal-700">
                    {payment.company.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {receiptNumber(payment.number)} · {payment.planName} · {formatDateTime(payment.paidAt)}
                  </p>
                </div>
                <span className="tabular font-bold text-slate-900">{formatRial(payment.amount, lang)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t("لا توجد مدفوعات بعد.", "No payments yet.")}</p>
        )}
      </Card>
    </div>
  );
}
