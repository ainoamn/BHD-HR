import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight, Building2, CreditCard, Landmark, LogOut, Receipt, ShieldOff, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { CycleSwitch, PlanGrid } from "@/components/plan-cards";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, InfoItem, SectionTitle, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { homePath, isStaffRole, requireUser } from "@/lib/auth";
import { cardPaymentsReady, thawaniConfig } from "@/lib/billing";
import { getI18n } from "@/lib/lang";
import { platformConfig, receiptNumber } from "@/lib/platform";
import { CYCLE_LABEL, FEATURES, FEATURE_LABEL, PAYMENT_STATUS, formatRial, isCycle, limitText, type Cycle } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE, countedEmployees, countedUsers } from "@/lib/subscription";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { logout } from "@/server/auth-actions";
import { cancelPayment, checkPayment, requestManualPayment, startCheckout } from "@/server/billing-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

function Meter({ label, used, limit, lang }: { label: string; used: number; limit: number | null; lang: "ar" | "en" }) {
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-100">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="tabular text-sm font-bold text-slate-900">
          {used} / {limitText(limit, lang)}
        </p>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full", share >= 90 ? "bg-red-600" : share >= 75 ? "bg-amber-500" : "bg-teal-600")} style={{ width: `${limit ? Math.max(share, used ? 3 : 0) : 8}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; cycle?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const { access } = user;
  const staff = isStaffRole(user.role);
  const admin = user.role === "ADMIN";
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;
  const cycle: Cycle = sp.cycle && isCycle(sp.cycle) ? sp.cycle : (access.cycle as Cycle | null) ?? "MONTHLY";

  const [config, plans, employees, users, payments] = await Promise.all([
    platformConfig(),
    admin ? prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }) : [],
    countedEmployees(user.companyId),
    countedUsers(user.companyId),
    admin ? prisma.payment.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, take: 30 }) : [],
  ]);
  const cardReady = cardPaymentsReady();
  const testMode = cardReady && !thawaniConfig()!.live;
  const pending = payments.filter((payment) => payment.status === "PENDING");
  const buyable = plans.filter((plan) => !plan.contactOnly);
  const back = staff ? "/" : homePath(user);

  return (
    <div className="min-h-dvh bg-sand-50">
      <header className="border-b border-slate-200/70 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="official-logo official-logo-mark official-logo-ink w-10 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{t("الاشتراك والباقة", "Subscription")}</p>
            <p className="truncate text-xs text-slate-500">{companyName}</p>
          </div>
          {access.active ? (
            <span className="hidden sm:contents">
              <Link href={back} className={secondaryBtn}>
                <ArrowRight size={16} className="ltr:rotate-180" />
                {t("العودة للنظام", "Back to the system")}
              </Link>
            </span>
          ) : null}
          <LangToggle />
          <form action={logout}>
            <button type="submit" className="flex size-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100" aria-label={t("خروج", "Sign out")} title={t("خروج", "Sign out")}>
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Flash error={sp.error} message={sp.message} />

        {access.state === "SUSPENDED" ? (
          <Card className="border-red-200">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 ring-1 ring-inset ring-red-100">
                <ShieldOff size={20} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900">{t("حساب المنشأة موقوف", "The company account is suspended")}</h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {user.company.suspendedReason || t("أوقفت إدارة المنصة هذا الحساب مؤقتاً.", "The platform administration suspended this account.")}{" "}
                  {t("بياناتك محفوظة كما هي. تواصل مع الدعم لإعادة التفعيل.", "Your data is kept as it is. Contact support to reactivate.")}
                </p>
                {config.supportEmail || config.supportPhone ? (
                  <p className="mt-2 text-sm font-semibold text-slate-800" dir="ltr">
                    {[config.supportEmail, config.supportPhone].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : !access.active ? (
          <Card className="border-amber-200">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900">{t("انتهى الاشتراك", "The subscription has ended")}</h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {admin
                    ? t("اختر باقة وادفع لمتابعة العمل فوراً. كل بياناتك محفوظة كما هي.", "Choose a plan and pay to carry on at once. All your data is kept as it is.")
                    : t("بيانات منشأتك محفوظة، والعمل متوقف حتى يجدّد مسؤول المنشأة الاشتراك.", "Your company's data is kept; work is paused until the company administrator renews.")}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <SectionTitle hint={t("الباقة الحالية وما تستخدمه منها.", "Your current plan and what you use of it.")}>{t("اشتراك المنشأة", "Company subscription")}</SectionTitle>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label={t("الباقة", "Plan")} value={access.planName ? access.planName[lang] : t("كل الميزات (حساب قائم)", "Everything (legacy account)")} />
            <InfoItem label={t("الحالة", "Status")} value={<ToneBadge tone={ACCESS_TONE[access.state]}>{ACCESS_LABEL[access.state][lang]}</ToneBadge>} />
            <InfoItem label={t("المدة", "Billing")} value={access.state === "TRIAL" ? t("تجربة مجانية", "Free trial") : access.cycle ? CYCLE_LABEL[access.cycle as Cycle]?.[lang] ?? access.cycle : "—"} />
            <InfoItem
              label={access.state === "TRIAL" ? t("تنتهي التجربة", "Trial ends") : access.state === "GRACE" ? t("آخر يوم للتجديد", "Renew by") : t("ينتهي في", "Ends on")}
              value={access.endsAt ? `${formatDate(access.endsAt)}${access.daysLeft !== null ? ` · ${t(`${access.daysLeft} يوم`, `${access.daysLeft} day(s)`)}` : ""}` : t("بلا تاريخ انتهاء", "No end date")}
            />
          </dl>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meter label={t("الموظفون", "Employees")} used={employees} limit={access.maxEmployees} lang={lang} />
            <Meter label={t("مستخدمو النظام", "System users")} used={users} limit={access.maxUsers} lang={lang} />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {FEATURES.map((feature) => (
              <span
                key={feature}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                  access.features.includes(feature) ? "bg-teal-50 text-teal-800 ring-teal-200/70" : "bg-slate-50 text-slate-400 line-through ring-slate-200/70",
                )}
              >
                {FEATURE_LABEL[feature][lang]}
              </span>
            ))}
          </div>
        </Card>

        {!admin ? (
          <Card>
            <div className="flex items-start gap-3">
              <Users size={20} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-sm leading-6 text-slate-600">
                {t("يدير الاشتراك والدفع مسؤول المنشأة. تواصل معه لتغيير الباقة أو تجديدها.", "The company administrator manages the plan and payments. Ask them to change or renew it.")}
              </p>
            </div>
          </Card>
        ) : access.state === "SUSPENDED" ? null : (
          <>
            {pending.length ? (
              <Card className="border-amber-200">
                <SectionTitle>{t("مدفوعات معلّقة", "Pending payments")}</SectionTitle>
                <ul className="divide-y divide-slate-100">
                  {pending.map((payment) => (
                    <li key={payment.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-slate-900">
                          {payment.planName} · {CYCLE_LABEL[payment.cycle as Cycle]?.[lang]} · {formatRial(payment.amount, lang)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {receiptNumber(payment.number)} · {formatDateTime(payment.createdAt)} ·{" "}
                          {payment.provider === "MANUAL" ? t("تحويل بنكي بانتظار تأكيد الإدارة", "Bank transfer awaiting confirmation") : t("دفع بالبطاقة لم يكتمل", "Card payment not completed")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {payment.provider === "THAWANI" ? (
                          <form action={checkPayment}>
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <SubmitButton variant="secondary" pendingLabel={t("جارٍ التحقق...", "Checking...")}>
                              {t("تحقق من الدفع", "Check payment")}
                            </SubmitButton>
                          </form>
                        ) : null}
                        <form action={cancelPayment}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <SubmitButton variant="link" confirm={t("إلغاء هذا الطلب؟", "Cancel this request?")}>
                            {t("إلغاء", "Cancel")}
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900">{t("اختر باقتك", "Choose your plan")}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {t(
                      "تجديد الباقة نفسها يكمل من تاريخ انتهائها. الانتقال لباقة أخرى يبدأ فوراً وتُحسب الأيام المتبقية لصالحك.",
                      "Renewing the same plan continues from its end date. Switching starts now, and the days left are credited to you.",
                    )}
                  </p>
                </div>
                <CycleSwitch cycle={cycle} lang={lang} hrefFor={(value) => `/billing?cycle=${value}`} />
              </div>
              {testMode ? (
                <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200/70">
                  {t("بوابة الدفع في وضع الاختبار: لا تُقبل إلا بطاقات الاختبار.", "The payment gateway is in test mode: only test cards are accepted.")}
                </p>
              ) : null}
              <PlanGrid
                plans={plans}
                cycle={cycle}
                lang={lang}
                currentPlanId={access.planId}
                action={(plan) =>
                  plan.contactOnly ? (
                    <a href={config.supportEmail ? `mailto:${config.supportEmail}` : "/#contact"} className={cn(secondaryBtn, "w-full")}>
                      {t("تواصل معنا", "Contact us")}
                    </a>
                  ) : cardReady ? (
                    <form action={startCheckout}>
                      <input type="hidden" name="plan" value={plan.code} />
                      <input type="hidden" name="cycle" value={cycle} />
                      <SubmitButton className="w-full" pendingLabel={t("جارٍ فتح صفحة الدفع...", "Opening checkout...")}>
                        <CreditCard size={16} />
                        {plan.id === access.planId && access.state !== "TRIAL" ? t("جدّد بالبطاقة", "Renew by card") : t("ادفع بالبطاقة", "Pay by card")}
                      </SubmitButton>
                    </form>
                  ) : (
                    <a href="#transfer" className={cn(plan.highlight ? primaryBtn : secondaryBtn, "w-full")}>
                      <Landmark size={16} />
                      {t("ادفع بالتحويل", "Pay by transfer")}
                    </a>
                  )
                }
              />
            </section>

            {buyable.length ? (
              <Card id="transfer" className="scroll-mt-6">
                <SectionTitle
                  hint={t(
                    "حوّل قيمة الباقة إلى الحساب أدناه ثم أرسل الطلب مع رقم المرجع. يبدأ الاشتراك فور تأكيد الإدارة لوصول المبلغ.",
                    "Transfer the plan's price to the account below, then send the request with the reference. The plan starts once the transfer is confirmed.",
                  )}
                >
                  {t("الدفع بالتحويل البنكي", "Pay by bank transfer")}
                </SectionTitle>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="min-w-0 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 ring-1 ring-inset ring-slate-100">
                    {config.bankDetails || t("ستُعرض بيانات الحساب البنكي هنا. تواصل مع الدعم للحصول عليها.", "Bank account details will appear here. Contact support for them.")}
                    {config.supportEmail || config.supportPhone ? <p className="mt-2 font-semibold" dir="ltr">{[config.supportEmail, config.supportPhone].filter(Boolean).join(" · ")}</p> : null}
                  </div>
                  <form action={requestManualPayment} className="min-w-0 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("الباقة", "Plan")}>
                        <select name="plan" className={`${fieldClass} w-full`} defaultValue={buyable.find((plan) => plan.id === access.planId)?.code ?? buyable[0].code}>
                          {buyable.map((plan) => (
                            <option key={plan.id} value={plan.code}>
                              {(lang === "en" && plan.nameEn) || plan.name} — {formatRial(plan.priceMonthly, lang)} / {t("شهر", "month")} · {formatRial(plan.priceYearly, lang)} / {t("سنة", "year")}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("المدة", "Period")}>
                        <select name="cycle" className={`${fieldClass} w-full`} defaultValue={cycle}>
                          <option value="MONTHLY">{CYCLE_LABEL.MONTHLY[lang]}</option>
                          <option value="YEARLY">{CYCLE_LABEL.YEARLY[lang]}</option>
                        </select>
                      </Field>
                    </div>
                    <Field label={t("رقم مرجع التحويل", "Transfer reference")} hint={t("اختياري، يساعد في تأكيد الدفعة بسرعة.", "Optional; helps confirm the payment quickly.")}>
                      <input name="reference" className={`${fieldClass} w-full`} maxLength={120} dir="ltr" />
                    </Field>
                    <SubmitButton pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                      <Landmark size={16} />
                      {t("أرسلت التحويل", "I have transferred")}
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            ) : null}

            <Card>
              <SectionTitle>{t("سجل المدفوعات", "Payment history")}</SectionTitle>
              {payments.length ? (
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-start text-xs text-slate-500">
                        <th className="px-4 py-2 text-start font-medium">{t("الإيصال", "Receipt")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("التاريخ", "Date")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("الباقة", "Plan")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("المبلغ", "Amount")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("الفترة", "Period")}</th>
                        <th className="px-4 py-2 text-start font-medium">{t("الحالة", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((payment) => {
                        const status = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.PENDING;
                        return (
                          <tr key={payment.id}>
                            <td className="px-4 py-2.5 font-semibold" dir="ltr">
                              {payment.status === "PAID" ? (
                                <Link href={`/billing/receipt/${payment.id}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                                  <Receipt size={14} />
                                  {receiptNumber(payment.number)}
                                </Link>
                              ) : (
                                receiptNumber(payment.number)
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                            <td className="px-4 py-2.5">
                              {payment.planName} · {CYCLE_LABEL[payment.cycle as Cycle]?.[lang]}
                            </td>
                            <td className="tabular px-4 py-2.5">{formatRial(payment.amount, lang)}</td>
                            <td className="px-4 py-2.5 text-slate-600">{payment.periodStart && payment.periodEnd ? `${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}` : "—"}</td>
                            <td className="px-4 py-2.5">
                              <ToneBadge tone={status.tone}>{status[lang]}</ToneBadge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Building2 size={16} />
                  {t("لا توجد مدفوعات بعد.", "No payments yet.")}
                </p>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
