import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Building2, CalendarPlus, CircleCheck, CreditCard, History, KeyRound, Layers, Receipt, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, InfoItem, PageHeader, SectionTitle, Stat, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
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
    prisma.loginEvent.findMany({ where: { user: { memberships: { some: { companyId: id } } } }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { email: true } } } }),
    prisma.platformLog.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const access = computeAccess({ companyStatus: company.status, subscription: company.subscription });
  const sub = company.subscription;
  const staff = company.memberships.filter((member) => (STAFF_ROLES as readonly string[]).includes(member.role));
  const accounts = company.memberships.length - staff.length;
  const paidTotal = company.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + payment.amount, 0);
  const currentEnd = sub ? (sub.status === "TRIAL" ? sub.trialEndsAt : sub.currentPeriodEnd) : null;
  const extra = readFeatures(sub?.extraFeatures);
  const back = `/admin/companies/${id}`;

  return (
    <div className="space-y-5">
      <PageHeader icon={Building2} title={company.name} description={[company.nameEn, company.crNumber ? `${t("س.ت", "CR")} ${company.crNumber}` : null, company.email, company.phone].filter(Boolean).join(" · ") || undefined}>
        <ToneBadge tone={ACCESS_TONE[access.state]}>{ACCESS_LABEL[access.state][lang]}</ToneBadge>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("مستخدمو النظام", "System users")} value={`${staff.length} / ${limitText(access.maxUsers, lang)}`} hint={t(`+${accounts} حساب موظف أو كفيل`, `+${accounts} employee/sponsor accounts`)} icon={Users} />
        <Stat label={t("الموظفون النشطون", "Active employees")} value={`${activeEmployees} / ${limitText(access.maxEmployees, lang)}`} hint={t(`${company._count.employees} في السجل كله`, `${company._count.employees} on file`)} icon={Users} tone="navy" />
        <Stat label={t("المدفوع إجمالاً", "Paid in total")} value={formatRial(paidTotal, lang)} icon={CreditCard} tone="gold" />
        <Stat label={t("تاريخ التسجيل", "Signed up")} value={formatDate(company.createdAt)} hint={company.signupIp ? `IP ${company.signupIp}` : undefined} icon={CalendarPlus} tone="aqua" />
      </div>

      <Card>
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-2">
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
                            {(lang === "en" && plan.nameEn) || plan.name}
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
                          {(lang === "en" && plan.nameEn) || plan.name} — {formatRial(plan.priceMonthly, lang)} / {formatRial(plan.priceYearly, lang)}
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
            </div>
          }
        >
          {t("الاشتراك", "Subscription")}
        </SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label={t("الباقة", "Plan")} value={access.planName ? access.planName[lang] : t("بلا اشتراك (كل الميزات)", "None (everything open)")} />
          <InfoItem label={t("النوع والمدة", "Type & cycle")} value={sub ? `${sub.status === "TRIAL" ? t("تجربة", "Trial") : sub.status === "CANCELED" ? t("ملغى", "Cancelled") : t("مدفوع", "Paid")}${sub.status !== "TRIAL" ? ` · ${CYCLE_LABEL[sub.cycle as Cycle]?.[lang] ?? sub.cycle}` : ""}` : "—"} />
          <InfoItem label={t("بداية الفترة", "Period start")} value={sub?.currentPeriodStart ? formatDate(sub.currentPeriodStart) : sub ? formatDate(sub.createdAt) : "—"} />
          <InfoItem label={t("الانتهاء", "Ends")} value={access.endsAt ? `${formatDate(access.endsAt)}${access.daysLeft !== null ? ` · ${t(`${access.daysLeft} يوم`, `${access.daysLeft}d`)}` : ""}` : t("بلا تاريخ", "No end")} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FEATURES.map((feature) => (
            <span key={feature} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${access.features.includes(feature) ? "bg-teal-50 text-teal-800 ring-teal-200/70" : "bg-slate-50 text-slate-400 line-through ring-slate-200/70"}`}>
              {FEATURE_LABEL[feature][lang]}
            </span>
          ))}
        </div>
        {sub?.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{sub.notes}</p> : null}
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
          <form action={extendSubscription} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="companyId" value={id} />
            <Field label={t("تمديد بالأيام", "Extend by days")}>
              <input type="number" name="days" min={1} max={3650} defaultValue={30} className={`${fieldClass} w-28`} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={t("جارٍ التمديد...", "Extending...")}>
              <CalendarPlus size={16} />
              {t("تمديد", "Extend")}
            </SubmitButton>
          </form>
          {company.status === "SUSPENDED" ? (
            <form action={setCompanyStatus} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="companyId" value={id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <span className="text-sm text-red-700">{company.suspendedReason || t("موقوفة", "Suspended")}</span>
              <SubmitButton variant="secondary">
                <CircleCheck size={16} />
                {t("إعادة التفعيل", "Reactivate")}
              </SubmitButton>
            </form>
          ) : (
            <form action={setCompanyStatus} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="companyId" value={id} />
              <input type="hidden" name="status" value="SUSPENDED" />
              <Field label={t("سبب الإيقاف (يظهر للشركة)", "Reason (shown to the company)")}>
                <input name="reason" maxLength={300} className={`${fieldClass} w-full sm:w-72`} />
              </Field>
              <SubmitButton variant="danger" confirm={t("إيقاف الشركة؟ لن يستطيع أحد من أعضائها أو موظفيها العمل حتى إعادة التفعيل.", "Suspend the company? Nobody in it can work until it is reactivated.")}>
                <Ban size={16} />
                {t("إيقاف الشركة", "Suspend")}
              </SubmitButton>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle hint={t("الأدوار داخل هذه الشركة فقط؛ لا تنتقل إلى أي شركة أخرى.", "Roles inside this company only; they never carry over to another company.")}>{t("الأعضاء", "Members")}</SectionTitle>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-4 py-2 text-start font-medium">{t("الاسم / البريد", "Name / email")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("الدور", "Role")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("الحالة", "Status")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("آخر دخول", "Last sign-in")}</th>
                <th className="px-4 py-2 text-start font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {company.memberships.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-900">{member.user?.name || "—"}</p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {member.user?.email || member.email}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">{pick(ACCOUNT_ROLE_LABEL[member.role], lang, member.role)}</td>
                  <td className="px-4 py-2.5">
                    {member.user?.disabledAt ? (
                      <ToneBadge tone="red">{t("موقوف", "Disabled")}</ToneBadge>
                    ) : member.userId ? (
                      <ToneBadge tone="green">{t("فعّال", "Active")}</ToneBadge>
                    ) : (
                      <ToneBadge tone="amber">{t("دعوة معلّقة", "Invited")}</ToneBadge>
                    )}
                    {member.user?.isPlatformAdmin ? <ToneBadge tone="gold" className="ms-1">{t("مدير منصة", "Platform admin")}</ToneBadge> : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{member.user?.lastLoginAt ? formatDateTime(member.user.lastLoginAt) : "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600" dir="ltr">
                    {member.user?.lastLoginIp || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <p className="text-sm text-slate-500">{t("لا توجد مدفوعات.", "No payments.")}</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <KeyRound size={17} className="text-teal-700" />
              {t("آخر عمليات الدخول", "Recent sign-ins")}
            </span>
          </SectionTitle>
          {logins.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {logins.map((login) => (
                <li key={login.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate" dir="ltr">
                    {login.user.email}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500" dir="ltr">
                    {login.ip || "—"} · {login.method} · {formatDateTime(login.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد عمليات دخول مسجلة بعد.", "No sign-ins recorded yet.")}</p>
          )}
        </Card>
        <Card className="min-w-0">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <History size={17} className="text-teal-700" />
              {t("إجراءات الإدارة على هذه الشركة", "Admin actions on this company")}
            </span>
          </SectionTitle>
          {logs.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="py-2">
                  <p className="font-medium text-slate-800">{log.message}</p>
                  <p className="text-xs text-slate-500">
                    {log.action} · {log.userName || "—"} · {formatDateTime(log.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد إجراءات بعد.", "No actions yet.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
