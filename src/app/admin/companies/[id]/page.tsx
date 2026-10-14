import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Ban, CalendarPlus, CircleCheck, CreditCard, History, KeyRound, Layers, Receipt, Users } from "lucide-react";
import { Meter, Monogram } from "@/components/admin/admin-ui";
import { Flash } from "@/components/flash";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, InfoItem, SectionTitle, Stat, ToneBadge, dangerBtn, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { STAFF_ROLES } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { CYCLE_LABEL, FEATURES, FEATURE_LABEL, PAYMENT_STATUS, PROVIDER_LABEL, formatRial, limitText, readFeatures, type Cycle } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE, computeAccess } from "@/lib/subscription";
import { ACCOUNT_ROLE_LABEL } from "@/lib/team";
import { formatDate, formatDateTime, toDateInput } from "@/lib/utils";
import { decidePayment, extendSubscription, recordPayment, setCompanyPlan, setCompanyStatus } from "@/server/admin-actions";

export default async function AdminCompany({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      memberships: { include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, lastLoginIp: true, disabledAt: true, isPlatformAdmin: true } } }, orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { employees: true } },
    },
  });
  if (!company) notFound();
  const [activeEmployees, plans, logins, logs] = await Promise.all([
    prisma.employee.count({ where: { companyId: id, status: { not: "TERMINATED" } } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.loginEvent.findMany({ where: { user: { memberships: { some: { companyId: id } } } }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { email: true } } } }),
    prisma.platformLog.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const access = computeAccess({ companyStatus: company.status, subscription: company.subscription });
  const sub = company.subscription;
  const staff = company.memberships.filter((member) => (STAFF_ROLES as readonly string[]).includes(member.role));
  const accounts = company.memberships.length - staff.length;
  const paid = company.payments.filter((payment) => payment.status === "PAID");
  const paidTotal = Math.round(paid.reduce((sum, payment) => sum + payment.amount, 0) * 1000) / 1000;
  const currentEnd = sub ? (sub.status === "TRIAL" ? sub.trialEndsAt : sub.currentPeriodEnd) : null;
  const extra = readFeatures(sub?.extraFeatures);
  const back = `/admin/companies/${id}`;
  const lastSeen = company.memberships
    .map((member) => member.user)
    .filter((user): user is NonNullable<typeof user> => Boolean(user?.lastLoginAt))
    .sort((a, b) => b.lastLoginAt!.getTime() - a.lastLoginAt!.getTime())[0];
  const planName = (plan: { name: string; nameEn: string | null }) => (lang === "en" && plan.nameEn) || plan.name;

  return (
    <div className="space-y-5">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900">
        <ArrowRight size={16} className="ltr:rotate-180" />
        {t("الشركات", "Companies")}
      </Link>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Monogram name={company.name} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
              <p className="truncate text-sm text-slate-500">{[company.nameEn, company.crNumber ? `${t("س.ت", "CR")} ${company.crNumber}` : null, company.email, company.phone].filter(Boolean).join(" · ") || "—"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ToneBadge tone={ACCESS_TONE[access.state]}>{ACCESS_LABEL[access.state][lang]}</ToneBadge>
                <ToneBadge tone="teal">{access.planName ? access.planName[lang] : t("بلا باقة", "No plan")}</ToneBadge>
                {access.endsAt ? <ToneBadge tone={access.daysLeft !== null && access.daysLeft <= 7 ? "amber" : "slate"}>{t(`ينتهي ${formatDate(access.endsAt)}`, `Ends ${formatDate(access.endsAt)}`)}</ToneBadge> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Modal
              label={
                <>
                  <Layers size={16} />
                  {t("تغيير الباقة", "Change plan")}
                </>
              }
              title={t("باقة الشركة واشتراكها", "Company plan & subscription")}
              triggerClassName={primaryBtn}
            >
              <form action={setCompanyPlan} className="space-y-4">
                <input type="hidden" name="companyId" value={id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t("الباقة", "Plan")}>
                    <select name="planId" className={`${fieldClass} w-full`} defaultValue={sub?.planId} required>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {planName(plan)}
                          {plan.isActive ? "" : ` (${t("موقوفة", "inactive")})`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("النوع", "Type")}>
                    <select name="status" className={`${fieldClass} w-full`} defaultValue={sub?.status === "TRIAL" ? "TRIAL" : "ACTIVE"}>
                      <option value="TRIAL">{t("تجربة", "Trial")}</option>
                      <option value="ACTIVE">{t("مدفوع / ممنوح", "Paid / granted")}</option>
                    </select>
                  </Field>
                  <Field label={t("المدة", "Cycle")}>
                    <select name="cycle" className={`${fieldClass} w-full`} defaultValue={sub?.cycle ?? "MONTHLY"}>
                      <option value="MONTHLY">{CYCLE_LABEL.MONTHLY[lang]}</option>
                      <option value="YEARLY">{CYCLE_LABEL.YEARLY[lang]}</option>
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("ينتهي في", "Ends on")}>
                    <input type="date" name="endsAt" className={`${fieldClass} w-full`} defaultValue={toDateInput(currentEnd)} />
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-slate-700">
                    <input type="checkbox" name="noEnd" defaultChecked={Boolean(sub && !currentEnd)} className="size-4 accent-teal-700" />
                    {t("بلا تاريخ انتهاء", "No end date")}
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("حد الموظفين (فارغ = حد الباقة)", "Employee limit (blank = plan's)")}>
                    <input type="number" min={0} name="maxEmployees" className={`${fieldClass} w-full`} defaultValue={sub?.maxEmployees ?? ""} />
                  </Field>
                  <Field label={t("حد المستخدمين (فارغ = حد الباقة)", "User limit (blank = plan's)")}>
                    <input type="number" min={0} name="maxUsers" className={`${fieldClass} w-full`} defaultValue={sub?.maxUsers ?? ""} />
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-slate-700">{t("ميزات إضافية فوق الباقة", "Extra features on top of the plan")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FEATURES.map((feature) => (
                      <label key={feature} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="extraFeatures" value={feature} defaultChecked={extra.includes(feature)} className="size-4 accent-teal-700" />
                        {FEATURE_LABEL[feature][lang]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label={t("ملاحظات داخلية", "Internal notes")}>
                  <textarea name="notes" rows={2} className={`${fieldClass} w-full`} defaultValue={sub?.notes ?? ""} maxLength={1000} />
                </Field>
                <SubmitButton>{t("حفظ الاشتراك", "Save subscription")}</SubmitButton>
              </form>
            </Modal>
            <Modal
              label={
                <>
                  <Receipt size={16} />
                  {t("تسجيل دفعة", "Record payment")}
                </>
              }
              title={t("تسجيل دفعة مستلمة", "Record a payment received")}
              triggerClassName={secondaryBtn}
              size="sm"
            >
              <form action={recordPayment} className="space-y-3">
                <input type="hidden" name="companyId" value={id} />
                <Field label={t("الباقة", "Plan")}>
                  <select name="planId" className={`${fieldClass} w-full`} defaultValue={sub?.planId} required>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {planName(plan)} — {formatRial(plan.priceMonthly, lang)} / {formatRial(plan.priceYearly, lang)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("المدة", "Cycle")}>
                  <select name="cycle" className={`${fieldClass} w-full`} defaultValue={sub?.cycle ?? "MONTHLY"}>
                    <option value="MONTHLY">{CYCLE_LABEL.MONTHLY[lang]}</option>
                    <option value="YEARLY">{CYCLE_LABEL.YEARLY[lang]}</option>
                  </select>
                </Field>
                <Field label={t("المبلغ (فارغ = سعر الباقة)", "Amount (blank = plan price)")}>
                  <input type="number" step="0.001" min={0} name="amount" className={`${fieldClass} w-full`} dir="ltr" />
                </Field>
                <Field label={t("المرجع", "Reference")}>
                  <input name="reference" className={`${fieldClass} w-full`} maxLength={120} dir="ltr" />
                </Field>
                <Field label={t("ملاحظة", "Note")}>
                  <input name="note" className={`${fieldClass} w-full`} maxLength={500} />
                </Field>
                <SubmitButton confirm={t("تسجيل الدفعة كمدفوعة وتمديد الاشتراك؟", "Record as paid and extend the subscription?")}>{t("تسجيل وتفعيل", "Record & apply")}</SubmitButton>
              </form>
            </Modal>
            <Modal
              label={
                <>
                  <CalendarPlus size={16} />
                  {t("تمديد", "Extend")}
                </>
              }
              title={t("تمديد الاشتراك", "Extend the subscription")}
              triggerClassName={secondaryBtn}
              size="sm"
            >
              <form action={extendSubscription} className="space-y-3">
                <input type="hidden" name="companyId" value={id} />
                <p className="text-sm text-slate-600">
                  {access.endsAt ? t(`ينتهي حالياً في ${formatDate(access.endsAt)}.`, `Currently ends on ${formatDate(access.endsAt)}.`) : t("الاشتراك بلا تاريخ انتهاء حالياً.", "The subscription has no end date now.")}
                </p>
                <Field label={t("عدد الأيام", "Days")}>
                  <input type="number" name="days" min={1} max={3650} defaultValue={30} className={`${fieldClass} w-full`} />
                </Field>
                <SubmitButton pendingLabel={t("جارٍ التمديد...", "Extending...")}>{t("تمديد", "Extend")}</SubmitButton>
              </form>
            </Modal>
            {company.status === "SUSPENDED" ? (
              <form action={setCompanyStatus}>
                <input type="hidden" name="companyId" value={id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <SubmitButton variant="secondary">
                  <CircleCheck size={16} />
                  {t("إعادة التفعيل", "Reactivate")}
                </SubmitButton>
              </form>
            ) : (
              <Modal
                label={
                  <>
                    <Ban size={16} />
                    {t("إيقاف", "Suspend")}
                  </>
                }
                title={t("إيقاف الشركة", "Suspend the company")}
                triggerClassName={dangerBtn}
                size="sm"
              >
                <form action={setCompanyStatus} className="space-y-3">
                  <input type="hidden" name="companyId" value={id} />
                  <input type="hidden" name="status" value="SUSPENDED" />
                  <p className="text-sm text-slate-600">{t("لن يستطيع أحد من أعضائها أو موظفيها العمل حتى إعادة التفعيل.", "Nobody in it can work until it is reactivated.")}</p>
                  <Field label={t("سبب الإيقاف (يظهر للشركة)", "Reason (shown to the company)")}>
                    <input name="reason" maxLength={300} className={`${fieldClass} w-full`} />
                  </Field>
                  <SubmitButton variant="danger" confirm={t("إيقاف الشركة؟ لن يستطيع أحد من أعضائها أو موظفيها العمل حتى إعادة التفعيل.", "Suspend the company? Nobody in it can work until it is reactivated.")}>
                    {t("إيقاف الشركة", "Suspend")}
                  </SubmitButton>
                </form>
              </Modal>
            )}
          </div>
        </div>
        {company.status === "SUSPENDED" ? (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
            {t("موقوفة", "Suspended")}
            {company.suspendedReason ? `: ${company.suspendedReason}` : ""}
          </p>
        ) : null}
      </Card>

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("مستخدمو النظام", "System users")} value={`${staff.length} / ${limitText(access.maxUsers, lang)}`} hint={t(`+${accounts} حساب موظف أو كفيل`, `+${accounts} employee/sponsor accounts`)} icon={Users} />
        <Stat label={t("الموظفون النشطون", "Active employees")} value={`${activeEmployees} / ${limitText(access.maxEmployees, lang)}`} hint={t(`${company._count.employees} في السجل كله`, `${company._count.employees} on file`)} icon={Users} tone="navy" />
        <Stat label={t("المدفوع إجمالاً", "Paid in total")} value={formatRial(paidTotal, lang)} hint={t(`${paid.length} دفعة`, `${paid.length} payment(s)`)} icon={CreditCard} tone="gold" />
        <Stat label={t("تاريخ التسجيل", "Signed up")} value={formatDate(company.createdAt)} hint={company.signupIp ? `IP ${company.signupIp}` : undefined} icon={CalendarPlus} tone="aqua" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle>{t("الاشتراك", "Subscription")}</SectionTitle>
            <dl className="grid gap-3 sm:grid-cols-2">
              <InfoItem label={t("الباقة", "Plan")} value={access.planName ? access.planName[lang] : t("بلا اشتراك (كل الميزات)", "None (everything open)")} />
              <InfoItem
                label={t("النوع والمدة", "Type & cycle")}
                value={sub ? `${sub.status === "TRIAL" ? t("تجربة", "Trial") : sub.status === "CANCELED" ? t("ملغى", "Cancelled") : t("مدفوع", "Paid")}${sub.status !== "TRIAL" ? ` · ${CYCLE_LABEL[sub.cycle as Cycle]?.[lang] ?? sub.cycle}` : ""}` : "—"}
              />
              <InfoItem label={t("بداية الفترة", "Period start")} value={sub?.currentPeriodStart ? formatDate(sub.currentPeriodStart) : sub ? formatDate(sub.createdAt) : "—"} />
              <InfoItem label={t("الانتهاء", "Ends")} value={access.endsAt ? `${formatDate(access.endsAt)}${access.daysLeft !== null ? ` · ${t(`${access.daysLeft} يوم`, `${access.daysLeft}d`)}` : ""}` : t("بلا تاريخ", "No end")} />
            </dl>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Meter value={activeEmployees} max={access.maxEmployees} label={t("الموظفون مقابل الحد", "Employees against the limit")} />
              <Meter value={staff.length} max={access.maxUsers} label={t("المستخدمون مقابل الحد", "Users against the limit")} />
            </div>
            <p className="mb-2 mt-5 text-sm font-medium text-slate-700">{t("الميزات المتاحة", "Features available")}</p>
            <div className="flex flex-wrap gap-1.5">
              {FEATURES.map((feature) => (
                <span
                  key={feature}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${access.features.includes(feature) ? "bg-teal-50 text-teal-800 ring-teal-200/70" : "bg-slate-50 text-slate-400 line-through ring-slate-200/70"}`}
                >
                  {FEATURE_LABEL[feature][lang]}
                  {extra.includes(feature) ? ` · ${t("إضافية", "extra")}` : ""}
                </span>
              ))}
            </div>
            {sub?.notes ? <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{sub.notes}</p> : null}
          </Card>

          <Card>
            <SectionTitle hint={t("الأدوار داخل هذه الشركة فقط؛ لا تنتقل إلى أي شركة أخرى.", "Roles inside this company only; they never carry over to another company.")}>{t(`الأعضاء (${company.memberships.length})`, `Members (${company.memberships.length})`)}</SectionTitle>
            <ul className="divide-y divide-slate-100">
              {company.memberships.map((member) => (
                <li key={member.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Monogram name={member.user?.name || member.email} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{member.user?.name || "—"}</p>
                      <p className="truncate text-xs text-slate-500" dir="ltr">
                        {member.user?.email || member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <ToneBadge tone="slate">{pick(ACCOUNT_ROLE_LABEL[member.role], lang, member.role)}</ToneBadge>
                    {member.user?.disabledAt ? (
                      <ToneBadge tone="red">{t("موقوف", "Disabled")}</ToneBadge>
                    ) : member.userId ? (
                      <ToneBadge tone="green">{t("فعّال", "Active")}</ToneBadge>
                    ) : (
                      <ToneBadge tone="amber">{t("دعوة معلّقة", "Invited")}</ToneBadge>
                    )}
                    {member.user?.isPlatformAdmin ? <ToneBadge tone="gold">{t("مدير منصة", "Platform admin")}</ToneBadge> : null}
                  </div>
                  <p className="shrink-0 text-xs text-slate-500 sm:w-36 sm:text-end">
                    {member.user?.lastLoginAt ? formatDateTime(member.user.lastLoginAt) : t("لم يدخل بعد", "Never signed in")}
                    {member.user?.lastLoginIp ? (
                      <span className="block truncate" dir="ltr">
                        {member.user.lastLoginIp}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>{t("المدفوعات", "Payments")}</SectionTitle>
            {company.payments.length ? (
              <ul className="divide-y divide-slate-100">
                {company.payments.map((payment) => {
                  const status = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.PENDING;
                  return (
                    <li key={payment.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {payment.status === "PAID" ? (
                            <Link href={`/billing/receipt/${payment.id}`} className="text-teal-700 hover:underline" dir="ltr">
                              {receiptNumber(payment.number)}
                            </Link>
                          ) : (
                            <span dir="ltr">{receiptNumber(payment.number)}</span>
                          )}{" "}
                          · {payment.planName} · {CYCLE_LABEL[payment.cycle as Cycle]?.[lang]} · {formatRial(payment.amount, lang)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {PROVIDER_LABEL[payment.provider]?.[lang] ?? payment.provider} · {formatDateTime(payment.paidAt ?? payment.createdAt)}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                          {payment.ip ? ` · IP ${payment.ip}` : ""}
                          {payment.createdByName ? ` · ${payment.createdByName}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <ToneBadge tone={status.tone}>{status[lang]}</ToneBadge>
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
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t("لا توجد مدفوعات.", "No payments.")}</p>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle>{t("بيانات الحساب", "Account details")}</SectionTitle>
            <dl className="grid gap-2.5">
              <InfoItem label={t("رقم الشركة في المنصة", "Platform id")} value={company.id} dir="ltr" />
              <InfoItem label={t("عنوان التسجيل (IP)", "Sign-up IP")} value={company.signupIp || "—"} dir="ltr" />
              <InfoItem
                label={t("آخر دخول", "Last sign-in")}
                value={
                  lastSeen ? (
                    <>
                      {formatDateTime(lastSeen.lastLoginAt)}
                      {lastSeen.lastLoginIp ? (
                        <span className="block text-xs font-normal text-slate-500" dir="ltr">
                          {lastSeen.lastLoginIp}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoItem label={t("آخر دفعة", "Last payment")} value={paid[0] ? `${formatDate(paid[0].paidAt)} · ${formatRial(paid[0].amount, lang)}` : "—"} />
            </dl>
          </Card>

          <Card>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <KeyRound size={17} className="text-teal-700" />
                {t("آخر عمليات الدخول", "Recent sign-ins")}
              </span>
            </SectionTitle>
            {logins.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {logins.map((login) => (
                  <li key={login.id} className="py-2">
                    <p className="truncate font-medium text-slate-800" dir="ltr">
                      {login.user.email}
                    </p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {login.ip || "—"} · {login.method} · {formatDateTime(login.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("لا توجد عمليات دخول مسجلة بعد.", "No sign-ins recorded yet.")}</p>
            )}
          </Card>

          <Card>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <History size={17} className="text-teal-700" />
                {t("إجراءات الإدارة على هذه الشركة", "Admin actions on this company")}
              </span>
            </SectionTitle>
            {logs.length ? (
              <ol className="relative space-y-3 border-s border-slate-200 ps-4">
                {logs.map((log) => (
                  <li key={log.id} className="relative text-sm">
                    <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-teal-600 ring-4 ring-surface" aria-hidden="true" />
                    <p className="break-words font-medium text-slate-800">{log.message}</p>
                    <p className="text-xs text-slate-500">
                      <span dir="ltr">{log.action}</span> · {log.userName || "—"} · {formatDateTime(log.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">{t("لا توجد إجراءات بعد.", "No actions yet.")}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
