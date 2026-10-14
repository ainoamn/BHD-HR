import Link from "next/link";
import { Check, Eye, EyeOff, Layers, Pencil, Plus, Star, TrendingUp, X } from "lucide-react";
import type { Plan } from "@prisma/client";
import { Flash } from "@/components/flash";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, Stat, ToneBadge, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { companyRows, recurringByPlan } from "@/lib/admin-data";
import type { Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { ensureDefaultPlans, platformConfig } from "@/lib/platform";
import { FEATURES, FEATURE_LABEL, formatRial, limitText, readFeatures } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
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
    <form action={savePlan} className="space-y-5">
      <input type="hidden" name="id" value={plan?.id ?? ""} />
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-900">{t("الاسم والوصف", "Name & description")}</legend>
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
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-900">{t("السعر والحدود", "Price & limits")}</legend>
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
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-slate-900">{t("الميزات فوق الأساسيات", "Features on top of the essentials")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <label key={feature} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="features" value={feature} defaultChecked={features.includes(feature)} className="size-4 accent-teal-700" />
              {FEATURE_LABEL[feature][lang]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-slate-900">{t("الظهور", "Visibility")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {check("isActive", t("مفعّلة", "Active"), plan?.isActive ?? true)}
          {check("isPublic", t("تظهر في صفحة الأسعار", "On the pricing page"), plan?.isPublic ?? true)}
          {check("highlight", t("مميزة (الأكثر طلباً)", "Highlighted"), plan?.highlight ?? false)}
          {check("contactOnly", t("السعر بالتواصل", "Contact for price"), plan?.contactOnly ?? false)}
        </div>
      </fieldset>
      <SubmitButton>{t("حفظ الباقة", "Save plan")}</SubmitButton>
    </form>
  );
}

export default async function AdminPlans({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  await ensureDefaultPlans();
  const [plans, byPlan, rows, config] = await Promise.all([prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }), recurringByPlan(), companyRows(), platformConfig()]);
  const mrr = Math.round([...byPlan.values()].reduce((sum, item) => sum + item.mrr, 0) * 1000) / 1000;
  const onPlan = (planId: string) => rows.filter((row) => row.access.planId === planId).length;

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("الإيراد الشهري المتكرر", "Monthly recurring revenue")} value={formatRial(mrr, lang)} icon={TrendingUp} tone="gold" />
        <Stat label={t("باقات مفعّلة", "Active plans")} value={String(plans.filter((plan) => plan.isActive).length)} hint={t(`من ${plans.length}`, `of ${plans.length}`)} icon={Layers} />
        <Stat label={t("في صفحة الأسعار", "On the pricing page")} value={String(plans.filter((plan) => plan.isActive && plan.isPublic).length)} icon={Eye} tone="navy" />
        <Stat label={t("باقة التجربة", "Trial plan")} value={plans.find((plan) => plan.code === config.trialPlanCode)?.[lang === "en" ? "nameEn" : "name"] || config.trialPlanCode} hint={t(`${config.trialDays} يوماً`, `${config.trialDays} days`)} icon={Star} tone="aqua" href="/admin/settings" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const features = readFeatures(plan.features);
          const stats = byPlan.get(plan.id);
          const companies = onPlan(plan.id);
          return (
            <Card key={plan.id} className={cn("flex flex-col", !plan.isActive && "opacity-70", plan.highlight && "border-teal-300 ring-1 ring-inset ring-teal-200/70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-slate-900">
                    {(lang === "en" && plan.nameEn) || plan.name}
                    <span className="text-xs font-medium text-slate-400" dir="ltr">
                      {plan.code}
                    </span>
                  </h2>
                  <p className="text-sm text-slate-500">{(lang === "en" ? plan.taglineEn : plan.tagline) || plan.tagline || "—"}</p>
                </div>
                <Modal
                  label={
                    <>
                      <Pencil size={15} />
                      {t("تعديل", "Edit")}
                    </>
                  }
                  title={t(`تعديل ${plan.name}`, `Edit ${plan.nameEn || plan.name}`)}
                  triggerClassName={secondaryBtn}
                >
                  <PlanForm plan={plan} lang={lang} />
                </Modal>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.isActive ? <ToneBadge tone="green">{t("مفعّلة", "Active")}</ToneBadge> : <ToneBadge tone="slate">{t("موقوفة", "Inactive")}</ToneBadge>}
                {plan.isPublic ? null : (
                  <ToneBadge tone="slate">
                    <EyeOff size={12} /> {t("مخفية", "Hidden")}
                  </ToneBadge>
                )}
                {plan.highlight ? <ToneBadge tone="teal">{t("مميزة", "Highlighted")}</ToneBadge> : null}
                {plan.code === config.trialPlanCode ? <ToneBadge tone="sky">{t("باقة التجربة", "Trial plan")}</ToneBadge> : null}
              </div>

              <p className="tabular mt-4 text-2xl font-bold tracking-tight text-slate-900">
                {plan.contactOnly ? t("بالتواصل", "Contact") : plan.priceMonthly === 0 && plan.priceYearly === 0 ? t("مجانية", "Free") : `${formatRial(plan.priceMonthly, lang)}`}
                {!plan.contactOnly && plan.priceMonthly > 0 ? <span className="text-sm font-medium text-slate-500"> / {t("شهر", "mo")}</span> : null}
              </p>
              {!plan.contactOnly && plan.priceYearly > 0 ? (
                <p className="text-xs text-slate-500">
                  {formatRial(plan.priceYearly, lang)} / {t("سنة", "yr")}
                </p>
              ) : null}

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-inset ring-slate-100">
                  <dt className="text-[0.7rem] text-slate-500">{t("شركات", "Companies")}</dt>
                  <dd className="tabular text-base font-bold text-slate-900">{companies}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-inset ring-slate-100">
                  <dt className="text-[0.7rem] text-slate-500">{t("تدفع", "Paying")}</dt>
                  <dd className="tabular text-base font-bold text-slate-900">{stats?.paying ?? 0}</dd>
                </div>
                <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-inset ring-slate-100">
                  <dt className="text-[0.7rem] text-slate-500">{t("شهرياً", "Monthly")}</dt>
                  <dd className="tabular truncate text-sm font-bold text-slate-900">{formatRial(Math.round((stats?.mrr ?? 0) * 1000) / 1000, lang)}</dd>
                </div>
              </dl>

              <p className="mt-4 text-sm text-slate-600">
                {t("موظفون", "Employees")}: <span className="font-semibold text-slate-900">{limitText(plan.maxEmployees, lang)}</span> · {t("مستخدمون", "Users")}:{" "}
                <span className="font-semibold text-slate-900">{limitText(plan.maxUsers, lang)}</span>
              </p>
              <ul className="mt-3 grid gap-1.5 text-sm">
                {FEATURES.map((feature) => {
                  const has = features.includes(feature);
                  return (
                    <li key={feature} className={cn("flex items-center gap-2", has ? "text-slate-700" : "text-slate-400")}>
                      {has ? <Check size={15} className="shrink-0 text-teal-600" /> : <X size={15} className="shrink-0" />}
                      <span className="min-w-0 truncate">{FEATURE_LABEL[feature][lang]}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-auto pt-4">
                <Link href={`/admin/companies?plan=${plan.id}`} className={linkAction}>
                  {t("شركات هذه الباقة", "Companies on this plan")}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
