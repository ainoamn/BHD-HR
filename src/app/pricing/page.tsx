import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Check, Minus } from "lucide-react";
import { SiteFooter } from "@/components/bhd/site-footer";
import { MarketingHeader, PricingSection } from "@/components/marketing";
import { getI18n } from "@/lib/lang";
import { CORE_FEATURES, FEATURES, FEATURE_LABEL, isCycle, limitText, readFeatures, type Cycle } from "@/lib/plans";
import { publicInfo } from "@/lib/public-site";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("الأسعار والباقات | نظام الموظفين والرواتب", "Pricing | HR & Payroll"),
    description: t("باقات شهرية وسنوية بالريال العُماني حسب عدد الموظفين والمستخدمين، مع تجربة مجانية.", "Monthly and yearly plans in Omani rials by employees and users, with a free trial."),
    alternates: { canonical: "/pricing" },
  };
}

export default async function Pricing({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const info = await publicInfo();
  const cycle: Cycle = sp.cycle && isCycle(sp.cycle) ? sp.cycle : "MONTHLY";
  const name = (plan: (typeof info.plans)[number]) => (lang === "en" && plan.nameEn ? plan.nameEn : plan.name);

  return (
    <div className="min-h-dvh bg-sand-50">
      <MarketingHeader lang={lang} theme={theme} />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t("الأسعار والباقات", "Pricing and plans")}</h1>
          <p className="mt-3 leading-7 text-slate-600">
            {t("اختر الباقة حسب عدد موظفيك ومستخدمي النظام. تبدأ كلها بتجربة مجانية بكل المزايا.", "Pick a plan by your headcount and system users. All start with a free trial of every feature.")}
          </p>
        </div>
        <div id="pricing" className="mt-10 scroll-mt-20">
          <PricingSection lang={lang} cycle={cycle} basePath="/pricing" plans={info.plans} trialDays={info.trialDays} />
        </div>

        <section className="mt-16">
          <h2 className="text-xl font-bold text-slate-900">{t("مقارنة الباقات", "Compare plans")}</h2>
          <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200/90 bg-surface shadow-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-start font-medium text-slate-500">{t("الميزة", "Feature")}</th>
                  {info.plans.map((plan) => (
                    <th key={plan.id} className="px-4 py-3 text-center font-bold text-slate-900">
                      {name(plan)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 text-slate-700">{t("عدد الموظفين", "Employees")}</td>
                  {info.plans.map((plan) => (
                    <td key={plan.id} className="tabular px-4 py-3 text-center font-semibold">
                      {limitText(plan.maxEmployees, lang)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-700">{t("مستخدمو النظام", "System users")}</td>
                  {info.plans.map((plan) => (
                    <td key={plan.id} className="tabular px-4 py-3 text-center font-semibold">
                      {limitText(plan.maxUsers, lang)}
                    </td>
                  ))}
                </tr>
                {CORE_FEATURES.map((feature) => (
                  <tr key={feature.en}>
                    <td className="px-4 py-3 text-slate-700">{feature[lang]}</td>
                    {info.plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3 text-center">
                        <Check size={16} className="mx-auto text-teal-700" aria-label={t("متاح", "Included")} />
                      </td>
                    ))}
                  </tr>
                ))}
                {FEATURES.map((feature) => (
                  <tr key={feature}>
                    <td className="px-4 py-3 text-slate-700">{FEATURE_LABEL[feature][lang]}</td>
                    {info.plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3 text-center">
                        {readFeatures(plan.features).includes(feature) ? (
                          <Check size={16} className="mx-auto text-teal-700" aria-label={t("متاح", "Included")} />
                        ) : (
                          <Minus size={16} className="mx-auto text-slate-300" aria-label={t("غير متاح", "Not included")} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            {t("تحتاج أكثر من ذلك أو باقة خاصة؟", "Need more, or a custom plan?")}{" "}
            <Link href="/#contact" className="font-semibold text-teal-700 hover:underline">
              {t("تواصل معنا", "Contact us")}
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter locale={lang} />
    </div>
  );
}
