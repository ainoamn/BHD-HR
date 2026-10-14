import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, ToneBadge } from "@/components/ui";
import { cardPaymentsReady, thawaniConfig } from "@/lib/billing";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { CYCLE_LABEL, PAYMENT_STATUS, PROVIDER_LABEL, formatRial, type Cycle } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { cn, formatDateTime } from "@/lib/utils";
import { decidePayment } from "@/server/admin-actions";

const STATUSES = ["PENDING", "PAID", "FAILED", "CANCELED"] as const;

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const status = (STATUSES as readonly string[]).includes(sp.status || "") ? sp.status! : null;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { company: { select: { id: true, name: true } } },
  });
  const card = thawaniConfig();
  const back = `/admin/payments${status ? `?status=${status}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader icon={CreditCard} title={t("المدفوعات", "Payments")} description={t("كل المدفوعات ومحاولات الدفع، وطلبات التحويل البنكي بانتظار التأكيد.", "Every payment and attempt, and bank transfers awaiting confirmation.")} />
      <Flash error={sp.error} message={sp.message} />
      <p className={cn("rounded-xl px-4 py-2.5 text-sm ring-1 ring-inset", cardPaymentsReady() ? (card?.live ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : "bg-amber-50 text-amber-800 ring-amber-200/70") : "bg-slate-50 text-slate-600 ring-slate-200/70")}>
        {cardPaymentsReady()
          ? card?.live
            ? t("الدفع بالبطاقة (ثواني) مفعّل في الوضع الحقيقي.", "Card payment (Thawani) is live.")
            : t("الدفع بالبطاقة (ثواني) في وضع الاختبار: أي بطاقة اختبار تفعّل الاشتراك. اضبط THAWANI_MODE=live بعد استلام مفاتيح التاجر الحقيقية.", "Card payment (Thawani) is in TEST mode: any test card activates a plan. Set THAWANI_MODE=live with real merchant keys.")
          : t("الدفع بالبطاقة غير مفعّل: الشركات تدفع بالتحويل وتؤكده أنت هنا. لتفعيله أضف THAWANI_SECRET_KEY و THAWANI_PUBLISHABLE_KEY و THAWANI_MODE=live في Vercel.", "Card payment is off: companies pay by transfer and you confirm here. Add THAWANI_SECRET_KEY, THAWANI_PUBLISHABLE_KEY and THAWANI_MODE=live in Vercel to enable it.")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Link href="/admin/payments" className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 ring-inset", !status ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200")}>
          {t("الكل", "All")}
        </Link>
        {STATUSES.map((value) => (
          <Link key={value} href={`/admin/payments?status=${value}`} className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 ring-inset", status === value ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200")}>
            {PAYMENT_STATUS[value][lang]}
          </Link>
        ))}
      </div>
      {payments.length ? (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-3 text-start font-medium">{t("الإيصال", "Receipt")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الشركة", "Company")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الباقة", "Plan")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("المبلغ", "Amount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الطريقة / المرجع", "Method / ref")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("التاريخ", "Date")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => {
                  const label = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.PENDING;
                  return (
                    <tr key={payment.id} className="align-top">
                      <td className="px-4 py-3 font-semibold" dir="ltr">
                        {payment.status === "PAID" ? (
                          <Link href={`/billing/receipt/${payment.id}`} className="text-teal-700 hover:underline">
                            {receiptNumber(payment.number)}
                          </Link>
                        ) : (
                          receiptNumber(payment.number)
                        )}
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <Link href={`/admin/companies/${payment.company.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                          {payment.company.name}
                        </Link>
                        {payment.ip ? (
                          <p className="text-xs text-slate-400" dir="ltr">
                            IP {payment.ip}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {payment.planName} · {CYCLE_LABEL[payment.cycle as Cycle]?.[lang]}
                      </td>
                      <td className="tabular px-4 py-3 font-semibold">{formatRial(payment.amount, lang)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {PROVIDER_LABEL[payment.provider]?.[lang] ?? payment.provider}
                        {payment.reference ? (
                          <p className="text-xs text-slate-500" dir="ltr">
                            {payment.reference}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(payment.paidAt ?? payment.createdAt)}</td>
                      <td className="px-4 py-3">
                        <ToneBadge tone={label.tone}>{label[lang]}</ToneBadge>
                        {payment.status === "PENDING" && payment.provider === "MANUAL" ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <form action={decidePayment}>
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <input type="hidden" name="decision" value="confirm" />
                              <input type="hidden" name="back" value={back} />
                              <SubmitButton variant="secondary" confirm={t("تأكيد وصول المبلغ وتفعيل الاشتراك؟", "Confirm the money arrived and apply the plan?")}>
                                {t("تأكيد", "Confirm")}
                              </SubmitButton>
                            </form>
                            <form action={decidePayment}>
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <input type="hidden" name="back" value={back} />
                              <SubmitButton variant="link" confirm={t("رفض طلب الدفع؟", "Reject this payment request?")}>
                                {t("رفض", "Reject")}
                              </SubmitButton>
                            </form>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={CreditCard} title={t("لا توجد مدفوعات", "No payments")} text={t("ستظهر هنا كل عملية دفع أو طلب تحويل.", "Every payment or transfer request shows here.")} />
      )}
    </div>
  );
}
