import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlertTriangle, Banknote, CircleX, CreditCard, Hourglass, Search } from "lucide-react";
import { CellLabel, FilterChips, Pager, Row, RowList } from "@/components/admin/admin-ui";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, PageHeader, Stat, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { cardPaymentsReady, thawaniConfig } from "@/lib/billing";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { CYCLE_LABEL, PAYMENT_STATUS, PROVIDER_LABEL, formatRial, type Cycle } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { cn, formatDateTime, parseDateInput } from "@/lib/utils";
import { decidePayment } from "@/server/admin-actions";

const STATUSES = ["PENDING", "PAID", "FAILED", "CANCELED"] as const;
const PAGE = 50;
const COLUMNS = "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]";

type Params = { status?: string; provider?: string; q?: string; from?: string; page?: string; error?: string; message?: string };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const status = (STATUSES as readonly string[]).includes(sp.status || "") ? sp.status! : null;
  const provider = sp.provider && PROVIDER_LABEL[sp.provider] ? sp.provider : null;
  const q = (sp.q || "").trim();
  const from = parseDateInput(sp.from || "");
  const receipt = Number(q.replace(/^INV-?/i, ""));
  const base: Prisma.PaymentWhereInput = {
    ...(provider ? { provider } : {}),
    ...(from ? { OR: [{ paidAt: { gte: from } }, { paidAt: null, createdAt: { gte: from } }] } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { company: { name: { contains: q, mode: "insensitive" } } },
                { reference: { contains: q, mode: "insensitive" } },
                { planName: { contains: q, mode: "insensitive" } },
                ...(Number.isInteger(receipt) && receipt > 0 ? [{ number: receipt }] : []),
              ],
            },
          ],
        }
      : {}),
  };
  const where: Prisma.PaymentWhereInput = { ...base, ...(status ? { status } : {}) };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [total, payments, counts, pending, month, failed, allPaid] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, Number(sp.page) || 1) - 1) * PAGE,
      take: PAGE,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.payment.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.payment.aggregate({ where: { provider: "MANUAL", status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: true }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const card = thawaniConfig();
  const rial = (value: number | null) => formatRial(Math.round((value ?? 0) * 1000) / 1000, lang);

  const query = (next: Partial<Record<"status" | "provider" | "q" | "from" | "page", string | null>>) => {
    const params = new URLSearchParams();
    const merged = { status, provider, q: q || null, from: sp.from || null, page: null, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/payments${params.size ? `?${params}` : ""}`;
  };
  const back = query({ page: page > 1 ? String(page) : null });
  const countOf = (value: string) => counts.find((item) => item.status === value)?._count ?? 0;
  const chips = [
    { href: query({ status: null }), label: t("الكل", "All"), count: counts.reduce((sum, item) => sum + item._count, 0), active: !status },
    ...STATUSES.map((value) => ({ href: query({ status: value }), label: PAYMENT_STATUS[value][lang], count: countOf(value), active: status === value, tone: value === "PENDING" ? ("amber" as const) : value === "FAILED" ? ("red" as const) : undefined })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={CreditCard} title={t("المدفوعات", "Payments")} description={t("كل المدفوعات ومحاولات الدفع، وطلبات التحويل البنكي بانتظار التأكيد.", "Every payment and attempt, and bank transfers awaiting confirmation.")} />
      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("بانتظار التأكيد", "Awaiting confirmation")} value={String(pending._count)} hint={rial(pending._sum.amount)} icon={Hourglass} tone="amber" emphasis={pending._count ? "amber" : undefined} href={query({ status: "PENDING", page: null })} />
        <Stat label={t("المحصّل هذا الشهر", "Collected this month")} value={rial(month._sum.amount)} hint={t(`${month._count} دفعة`, `${month._count} payment(s)`)} icon={Banknote} tone="aqua" />
        <Stat label={t("المحصّل إجمالاً", "Collected in total")} value={rial(allPaid._sum.amount)} hint={t(`${allPaid._count} دفعة`, `${allPaid._count} payment(s)`)} icon={CreditCard} tone="gold" />
        <Stat label={t("محاولات فاشلة (30 يوماً)", "Failed attempts (30 days)")} value={String(failed)} icon={CircleX} tone="red" emphasis={failed ? "red" : undefined} href={query({ status: "FAILED", page: null })} />
      </div>

      <p
        className={cn(
          "flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm ring-1 ring-inset",
          cardPaymentsReady() ? (card?.live ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : "bg-amber-50 text-amber-800 ring-amber-200/70") : "bg-slate-50 text-slate-600 ring-slate-200/70",
        )}
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          {cardPaymentsReady()
            ? card?.live
              ? t("الدفع بالبطاقة (ثواني) مفعّل في الوضع الحقيقي.", "Card payment (Thawani) is live.")
              : t("الدفع بالبطاقة (ثواني) في وضع الاختبار: أي بطاقة اختبار تفعّل الاشتراك. اضبط THAWANI_MODE=live بعد استلام مفاتيح التاجر الحقيقية.", "Card payment (Thawani) is in TEST mode: any test card activates a plan. Set THAWANI_MODE=live with real merchant keys.")
            : t("الدفع بالبطاقة غير مفعّل: الشركات تدفع بالتحويل وتؤكده أنت هنا. لتفعيله أضف THAWANI_SECRET_KEY و THAWANI_PUBLISHABLE_KEY و THAWANI_MODE=live في Vercel.", "Card payment is off: companies pay by transfer and you confirm here. Add THAWANI_SECRET_KEY, THAWANI_PUBLISHABLE_KEY and THAWANI_MODE=live in Vercel to enable it.")}
        </span>
      </p>

      <Toolbar className="space-y-3">
        <GetForm className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]" action="/admin/payments">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="relative min-w-0">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" defaultValue={q} className={`${fieldClass} w-full ps-9`} placeholder={t("الشركة، رقم الإيصال، المرجع…", "Company, receipt no., reference…")} aria-label={t("بحث", "Search")} />
          </label>
          <select name="provider" defaultValue={provider ?? ""} className={fieldClass} aria-label={t("الطريقة", "Method")}>
            <option value="">{t("كل الطرق", "All methods")}</option>
            {Object.entries(PROVIDER_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label[lang]}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={fieldClass} aria-label={t("من تاريخ", "From date")} />
          <button type="submit" className={secondaryBtn}>
            {t("تطبيق", "Apply")}
          </button>
        </GetForm>
        <FilterChips items={chips} label={t("تصفية حسب الحالة", "Filter by status")} />
      </Toolbar>

      {payments.length ? (
        <RowList
          columns={COLUMNS}
          head={[t("الإيصال", "Receipt"), t("الشركة", "Company"), t("الباقة", "Plan"), t("المبلغ", "Amount"), t("الطريقة / التاريخ", "Method / date"), t("الحالة", "Status")]}
        >
          {payments.map((payment) => {
            const label = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.PENDING;
            return (
              <Row key={payment.id} columns={COLUMNS}>
                <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
                  <span className="font-semibold" dir="ltr">
                    {payment.status === "PAID" ? (
                      <Link href={`/billing/receipt/${payment.id}`} className="text-teal-700 hover:underline">
                        {receiptNumber(payment.number)}
                      </Link>
                    ) : (
                      receiptNumber(payment.number)
                    )}
                  </span>
                  <span className="tabular font-bold text-slate-900 lg:hidden">{formatRial(payment.amount, lang)}</span>
                </div>
                <div className="min-w-0">
                  <Link href={`/admin/companies/${payment.company.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {payment.company.name}
                  </Link>
                  {payment.ip ? (
                    <p className="truncate text-xs text-slate-400" dir="ltr">
                      IP {payment.ip}
                    </p>
                  ) : null}
                </div>
                <p className="min-w-0 truncate text-sm text-slate-700">
                  {payment.planName} · {CYCLE_LABEL[payment.cycle as Cycle]?.[lang]}
                </p>
                <p className="tabular hidden font-bold text-slate-900 lg:block">{formatRial(payment.amount, lang)}</p>
                <div className="min-w-0 text-sm text-slate-600">
                  <p className="truncate">
                    <CellLabel>{t("الطريقة:", "Method:")}</CellLabel>
                    {PROVIDER_LABEL[payment.provider]?.[lang] ?? payment.provider}
                  </p>
                  {payment.reference ? (
                    <p className="truncate text-xs text-slate-500" dir="ltr">
                      {payment.reference}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <ToneBadge tone={label.tone}>{label[lang]}</ToneBadge>
                  {payment.status === "PENDING" && payment.provider === "MANUAL" ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </Row>
            );
          })}
        </RowList>
      ) : (
        <EmptyState icon={CreditCard} title={t("لا توجد مدفوعات", "No payments")} text={t("ستظهر هنا كل عملية دفع أو طلب تحويل.", "Every payment or transfer request shows here.")} />
      )}

      <Pager page={page} pages={pages} lang={lang} href={(next) => query({ page: String(next) })} />
    </div>
  );
}
