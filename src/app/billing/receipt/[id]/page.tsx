import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { secondaryBtn } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { getPlatformAdmin, platformConfig, receiptNumber } from "@/lib/platform";
import { CYCLE_LABEL, PROVIDER_LABEL, formatRial, type Cycle } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** A paid payment's receipt, for the company's administrators and the platform admin. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, platformAdmin] = await Promise.all([getSessionUser(), getPlatformAdmin()]);
  const payment = await prisma.payment.findUnique({ where: { id }, include: { company: true } });
  const allowed = payment && payment.status === "PAID" && (platformAdmin || (user && user.memberships.some((member) => member.companyId === payment.companyId && member.role === "ADMIN")));
  if (!payment || !allowed) notFound();
  const { lang, t } = await getI18n();
  const config = await platformConfig();
  const rows: [string, string][] = [
    [t("رقم الإيصال", "Receipt no."), receiptNumber(payment.number)],
    [t("تاريخ الدفع", "Paid on"), formatDate(payment.paidAt)],
    [t("المنشأة", "Company"), payment.company.name],
    [t("الباقة", "Plan"), `${payment.planName} — ${CYCLE_LABEL[payment.cycle as Cycle]?.[lang] ?? payment.cycle}`],
    [t("الفترة", "Period"), payment.periodStart && payment.periodEnd ? `${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}` : "—"],
    [t("طريقة الدفع", "Method"), PROVIDER_LABEL[payment.provider]?.[lang] ?? payment.provider],
    ...(payment.reference ? ([[t("المرجع", "Reference"), payment.reference]] as [string, string][]) : []),
  ];

  return (
    <div className="min-h-dvh bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-2xl flex-wrap justify-end gap-2 px-4">
        <Link href={platformAdmin && user?.companyId !== payment.companyId ? `/admin/companies/${payment.companyId}` : "/billing"} className={secondaryBtn}>
          {t("رجوع", "Back")}
        </Link>
        <PrintButton label={t("طباعة", "Print")} />
      </div>
      <article className="mx-auto max-w-2xl rounded-3xl bg-surface p-8 text-slate-900 shadow-raised print:rounded-none print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <span className="official-logo official-logo-mark official-logo-ink w-12" aria-hidden="true" />
            <div>
              <p className="font-bold">BHD · {t("الموظفون والرواتب", "HR & Payroll")}</p>
              {config.supportEmail ? (
                <p className="text-xs text-slate-500" dir="ltr">
                  {config.supportEmail}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-end">
            <p className="text-xl font-bold">{t("إيصال دفع", "Payment receipt")}</p>
            <p className="text-sm text-slate-500" dir="ltr">
              {receiptNumber(payment.number)}
            </p>
          </div>
        </header>
        <dl className="divide-y divide-slate-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-end font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-4">
          <span className="font-semibold">{t("المبلغ المدفوع", "Amount paid")}</span>
          <span className="tabular text-2xl font-bold">{formatRial(payment.amount, lang)}</span>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">{t("شكراً لاختياركم BHD.", "Thank you for choosing BHD.")}</p>
      </article>
    </div>
  );
}
