import Link from "next/link";
import { Activity, Banknote, Gift, LifeBuoy, Megaphone, Settings2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction } from "@/components/ui";
import { thawaniConfig } from "@/lib/billing";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { ensureDefaultPlans, platformConfig } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { saveConfig } from "@/server/admin-actions";

function Section({ icon: Icon, title, hint, children }: { icon: typeof Gift; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-xs leading-5 text-slate-500">{hint}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  await ensureDefaultPlans();
  const [config, plans] = await Promise.all([platformConfig(), prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  const card = thawaniConfig();
  const services = [
    { label: t("الدفع بالبطاقة (ثواني)", "Card payment (Thawani)"), ready: Boolean(card), note: card ? (card.live ? t("حقيقي", "Live") : t("اختبار", "Test")) : "THAWANI_SECRET_KEY, THAWANI_PUBLISHABLE_KEY, THAWANI_MODE" },
    { label: t("البريد الإلكتروني", "Email"), ready: channelReady("EMAIL"), note: "RESEND_API_KEY, MAIL_FROM" },
    { label: t("واتساب", "WhatsApp"), ready: channelReady("WHATSAPP"), note: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={Settings2} title={t("إعدادات المنصة", "Platform settings")} description={t("التجربة المجانية، بيانات الدفع بالتحويل، التواصل، والإعلان العام.", "Free trial, bank transfer details, contact, and the global notice.")} />
      <Flash error={sp.error} message={sp.message} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form action={saveConfig} className="min-w-0 space-y-5">
          <Section icon={Gift} title={t("التجربة المجانية", "Free trial")} hint={t("كل شركة جديدة تبدأ عليها تلقائياً.", "Every new company starts on it automatically.")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("باقة التجربة المجانية", "Free trial plan")}>
                <select name="trialPlanCode" className={`${fieldClass} w-full`} defaultValue={config.trialPlanCode}>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {(lang === "en" && plan.nameEn) || plan.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("أيام التجربة", "Trial days")} hint={t("من 1 إلى 90", "1 to 90")}>
                <input type="number" name="trialDays" min={1} max={90} className={`${fieldClass} w-full`} defaultValue={config.trialDays} />
              </Field>
            </div>
          </Section>

          <Section icon={Banknote} title={t("الدفع بالتحويل البنكي", "Bank transfer")} hint={t("تظهر للشركات في صفحة الاشتراك عند اختيار التحويل.", "Shown to companies on the subscription page when they pay by transfer.")}>
            <Field label={t("بيانات الحساب البنكي للتحويل", "Bank account for transfers")} hint={t("اسم البنك، اسم الحساب، رقم الحساب و IBAN.", "Bank, account name, number and IBAN.")}>
              <textarea name="bankDetails" rows={4} className={`${fieldClass} w-full`} defaultValue={config.bankDetails ?? ""} maxLength={1000} />
            </Field>
          </Section>

          <Section icon={LifeBuoy} title={t("الدعم والتواصل", "Support & contact")} hint={t("يظهر للشركات في صفحة الاشتراك ورسائل التذكير.", "Shown to companies on the subscription page and in reminders.")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("بريد الدعم", "Support email")}>
                <input type="email" name="supportEmail" className={`${fieldClass} w-full`} defaultValue={config.supportEmail ?? ""} dir="ltr" maxLength={120} />
              </Field>
              <Field label={t("هاتف / واتساب الدعم", "Support phone / WhatsApp")}>
                <input name="supportPhone" className={`${fieldClass} w-full`} defaultValue={config.supportPhone ?? ""} dir="ltr" maxLength={40} />
              </Field>
            </div>
          </Section>

          <Section icon={Megaphone} title={t("الإعلان العام", "Global notice")} hint={t("يظهر أعلى صفحات كل الشركات (صيانة، عرض). اتركه فارغاً لإخفائه.", "Shown at the top of every company's pages (maintenance, offer). Leave blank to hide.")}>
            <Field label={t("نص الإعلان", "Notice text")}>
              <input name="announcement" className={`${fieldClass} w-full`} defaultValue={config.announcement ?? ""} maxLength={300} />
            </Field>
            {config.announcement ? (
              <p className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-gold-700 ring-1 ring-inset ring-gold-200/70">
                {t("يظهر الآن: ", "Showing now: ")}
                {config.announcement}
              </p>
            ) : null}
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>{t("حفظ الإعدادات", "Save settings")}</SubmitButton>
            <span className="text-xs text-slate-500">{t(`آخر تعديل: ${formatDateTime(config.updatedAt)}`, `Last changed: ${formatDateTime(config.updatedAt)}`)}</span>
          </div>
        </form>

        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle hint={t("تُضبط من متغيرات البيئة في Vercel.", "Set as environment variables in Vercel.")}>{t("الخدمات المرتبطة", "Connected services")}</SectionTitle>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.label} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{service.label}</span>
                    <ToneBadge tone={service.ready ? "green" : "slate"}>{service.ready ? t("مفعّل", "On") : t("غير مفعّل", "Off")}</ToneBadge>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-slate-500" dir="ltr">
                    {service.note}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>{t("صحة النظام", "System health")}</SectionTitle>
            <p className="text-sm text-slate-600">{t("أخطاء المنصة والنسخ الاحتياطية اليومية.", "Platform errors and daily backups.")}</p>
            <Link href="/settings/system" className={`${linkAction} mt-2`}>
              <Activity size={15} />
              {t("فتح صحة النظام", "Open system health")}
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
