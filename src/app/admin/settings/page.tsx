import Link from "next/link";
import { Activity, Settings2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction } from "@/components/ui";
import { thawaniConfig } from "@/lib/billing";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { ensureDefaultPlans, platformConfig } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { saveConfig } from "@/server/admin-actions";

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
        <Card>
          <form action={saveConfig} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("باقة التجربة المجانية", "Free trial plan")} hint={t("كل شركة جديدة تبدأ عليها", "Every new company starts on it")}>
                <select name="trialPlanCode" className={`${fieldClass} w-full`} defaultValue={config.trialPlanCode}>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {(lang === "en" && plan.nameEn) || plan.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("أيام التجربة", "Trial days")}>
                <input type="number" name="trialDays" min={1} max={90} className={`${fieldClass} w-full`} defaultValue={config.trialDays} />
              </Field>
            </div>
            <Field label={t("بيانات الحساب البنكي للتحويل", "Bank account for transfers")} hint={t("تظهر للشركات في صفحة الاشتراك: اسم البنك، اسم الحساب، رقم الحساب و IBAN.", "Shown to companies on the subscription page: bank, account name, number and IBAN.")}>
              <textarea name="bankDetails" rows={4} className={`${fieldClass} w-full`} defaultValue={config.bankDetails ?? ""} maxLength={1000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("بريد الدعم", "Support email")}>
                <input type="email" name="supportEmail" className={`${fieldClass} w-full`} defaultValue={config.supportEmail ?? ""} dir="ltr" maxLength={120} />
              </Field>
              <Field label={t("هاتف / واتساب الدعم", "Support phone / WhatsApp")}>
                <input name="supportPhone" className={`${fieldClass} w-full`} defaultValue={config.supportPhone ?? ""} dir="ltr" maxLength={40} />
              </Field>
            </div>
            <Field label={t("إعلان عام", "Global notice")} hint={t("يظهر أعلى صفحات كل الشركات (صيانة، عرض). اتركه فارغاً لإخفائه.", "Shown at the top of every company's pages (maintenance, offer). Leave blank to hide.")}>
              <input name="announcement" className={`${fieldClass} w-full`} defaultValue={config.announcement ?? ""} maxLength={300} />
            </Field>
            <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
          </form>
        </Card>
        <div className="space-y-5">
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
