import { Layers, Plus } from "lucide-react";
import type { Plan } from "@prisma/client";
import { Flash } from "@/components/flash";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { ensureDefaultPlans } from "@/lib/platform";
import { FEATURES, FEATURE_LABEL, formatRial, limitText, readFeatures } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { savePlan } from "@/server/admin-actions";

function PlanForm({ plan, lang }: { plan?: Plan; lang: Lang }) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const features = readFeatures(plan?.features);
  const check = (name: string, label: string, checked: boolean) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-teal-700" />
      {label}
    </label>
  );
  return (
    <form action={savePlan} className="space-y-4">
      <input type="hidden" name="id" value={plan?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("الرمز", "Code")} hint={t("بالإنجليزية، لا يتغير بعد الإنشاء", "Latin letters; fixed after creation")}>
          <input name="code" className={`${fieldClass} w-full`} defaultValue={plan?.code} readOnly={Boolean(plan)} required maxLength={20} dir="ltr" />
        </Field>
        <Field label={t("الاسم بالعربية", "Arabic name")}>
          <input name="name" className={`${fieldClass} w-full`} defaultValue={plan?.name} required maxLength={60} />
        </Field>
        <Field label={t("الاسم بالإنجليزية", "English name")}>
          <input name="nameEn" className={`${fieldClass} w-full`} defaultValue={plan?.nameEn ?? ""} maxLength={60} dir="ltr" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("وصف قصير بالعربية", "Arabic tagline")}>
          <input name="tagline" className={`${fieldClass} w-full`} defaultValue={plan?.tagline ?? ""} maxLength={120} />
        </Field>
        <Field label={t("وصف قصير بالإنجليزية", "English tagline")}>
          <input name="taglineEn" className={`${fieldClass} w-full`} defaultValue={plan?.taglineEn ?? ""} maxLength={120} dir="ltr" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label={t("السعر الشهري (ر.ع)", "Monthly (OMR)")}>
          <input name="priceMonthly" type="number" step="0.001" min={0} className={`${fieldClass} w-full`} defaultValue={plan?.priceMonthly ?? 0} dir="ltr" />
        </Field>
        <Field label={t("السعر السنوي (ر.ع)", "Yearly (OMR)")}>
          <input name="priceYearly" type="number" step="0.001" min={0} className={`${fieldClass} w-full`} defaultValue={plan?.priceYearly ?? 0} dir="ltr" />
        </Field>
        <Field label={t("حد الموظفين", "Employee limit")} hint={t("فارغ = بلا حد", "Blank = unlimited")}>
          <input name="maxEmployees" type="number" min={0} className={`${fieldClass} w-full`} defaultValue={plan?.maxEmployees ?? ""} dir="ltr" />
        </Field>
        <Field label={t("حد المستخدمين", "User limit")} hint={t("فارغ = بلا حد", "Blank = unlimited")}>
          <input name="maxUsers" type="number" min={0} className={`${fieldClass} w-full`} defaultValue={plan?.maxUsers ?? ""} dir="ltr" />
        </Field>
        <Field label={t("الترتيب", "Order")}>
          <input name="sortOrder" type="number" min={0} className={`${fieldClass} w-full`} defaultValue={plan?.sortOrder ?? 50} dir="ltr" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">{t("الميزات فوق الأساسيات", "Features on top of the essentials")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <label key={feature} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="features" value={feature} defaultChecked={features.includes(feature)} className="size-4 accent-teal-700" />
              {FEATURE_LABEL[feature][lang]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-4">
        {check("isActive", t("مفعّلة", "Active"), plan?.isActive ?? true)}
        {check("isPublic", t("تظهر في صفحة الأسعار", "On the pricing page"), plan?.isPublic ?? true)}
        {check("highlight", t("مميزة (الأكثر طلباً)", "Highlighted"), plan?.highlight ?? false)}
        {check("contactOnly", t("السعر بالتواصل", "Contact for price"), plan?.contactOnly ?? false)}
      </div>
      <SubmitButton>{t("حفظ الباقة", "Save plan")}</SubmitButton>
    </form>
  );
}

export default async function AdminPlans({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });

  return (
    <div className="space-y-5">
      <PageHeader icon={Layers} title={t("الباقات", "Plans")} description={t("الأسعار والحدود والميزات. أي تعديل يسري فوراً على كل الشركات المشتركة في الباقة.", "Prices, limits and features. A change applies at once to every company on the plan.")}>
        <Modal
          label={
            <>
              <Plus size={16} />
              {t("باقة جديدة", "New plan")}
            </>
          }
          title={t("باقة جديدة", "New plan")}
          triggerClassName={primaryBtn}
        >
          <PlanForm lang={lang} />
        </Modal>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const features = readFeatures(plan.features);
          return (
            <Card key={plan.id} className={plan.isActive ? undefined : "opacity-70"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">
                    {(lang === "en" && plan.nameEn) || plan.name} <span className="text-xs font-medium text-slate-400" dir="ltr">{plan.code}</span>
                  </h2>
                  <p className="text-sm text-slate-500">{(lang === "en" ? plan.taglineEn : plan.tagline) || plan.tagline}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!plan.isActive ? <ToneBadge tone="slate">{t("موقوفة", "Inactive")}</ToneBadge> : null}
                  {!plan.isPublic ? <ToneBadge tone="slate">{t("مخفية", "Hidden")}</ToneBadge> : null}
                  {plan.highlight ? <ToneBadge tone="teal">{t("مميزة", "Highlighted")}</ToneBadge> : null}
                  <ToneBadge tone="sky">{t(`${plan._count.subscriptions} شركة`, `${plan._count.subscriptions} companies`)}</ToneBadge>
                </div>
              </div>
              <p className="tabular mt-3 text-xl font-bold text-slate-900">
                {plan.contactOnly ? t("بالتواصل", "Contact") : `${formatRial(plan.priceMonthly, lang)} / ${t("شهر", "mo")} · ${formatRial(plan.priceYearly, lang)} / ${t("سنة", "yr")}`}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t("موظفون", "Employees")}: {limitText(plan.maxEmployees, lang)} · {t("مستخدمون", "Users")}: {limitText(plan.maxUsers, lang)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FEATURES.map((feature) => (
                  <span key={feature} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${features.includes(feature) ? "bg-teal-50 text-teal-800 ring-teal-200/70" : "bg-slate-50 text-slate-400 line-through ring-slate-200/70"}`}>
                    {FEATURE_LABEL[feature][lang]}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <Modal label={t("تعديل", "Edit")} title={t(`تعديل ${plan.name}`, `Edit ${plan.nameEn || plan.name}`)} triggerClassName={secondaryBtn}>
                  <PlanForm plan={plan} lang={lang} />
                </Modal>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
