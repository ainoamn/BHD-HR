import Link from "next/link";
import type { Plan } from "@prisma/client";
import { Check, Sparkles } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { CYCLE_LABEL, FEATURES, FEATURE_LABEL, formatRial, limitText, priceFor, readFeatures, yearlySavingMonths, type Cycle } from "@/lib/plans";
import { cn } from "@/lib/utils";

type PlanView = Pick<Plan, "id" | "code" | "name" | "nameEn" | "tagline" | "taglineEn" | "priceMonthly" | "priceYearly" | "maxEmployees" | "maxUsers" | "features" | "contactOnly" | "highlight">;

/** Monthly / yearly switch as plain links, so it works without JavaScript and keeps the page shareable. */
export function CycleSwitch({ cycle, hrefFor, lang }: { cycle: Cycle; hrefFor: (cycle: Cycle) => string; lang: Lang }) {
  return (
    <div className="inline-flex rounded-2xl border border-slate-200 bg-surface p-1 shadow-card" role="group" aria-label={lang === "en" ? "Billing period" : "مدة الاشتراك"}>
      {(["MONTHLY", "YEARLY"] as const).map((value) => (
        <Link
          key={value}
          href={hrefFor(value)}
          scroll={false}
          aria-current={cycle === value ? "true" : undefined}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-semibold transition",
            cycle === value ? "bg-teal-700 text-white shadow-card" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {CYCLE_LABEL[value][lang]}
          {value === "YEARLY" ? <span className={cn("ms-1.5 text-xs", cycle === value ? "text-gold-200" : "text-teal-700")}>{lang === "en" ? "save more" : "وفّر أكثر"}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function PlanGrid({
  plans,
  cycle,
  lang,
  currentPlanId,
  action,
}: {
  plans: PlanView[];
  cycle: Cycle;
  lang: Lang;
  currentPlanId?: string | null;
  action: (plan: PlanView) => React.ReactNode;
}) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const price = priceFor(plan, cycle);
        const features = readFeatures(plan.features);
        const saving = cycle === "YEARLY" ? yearlySavingMonths(plan) : 0;
        const current = currentPlanId === plan.id;
        return (
          <div
            key={plan.id}
            className={cn(
              "relative flex min-w-0 flex-col rounded-3xl border bg-surface p-5 shadow-card sm:p-6",
              plan.highlight ? "border-teal-600 shadow-raised ring-2 ring-teal-600/15" : "border-slate-200/90",
            )}
          >
            {plan.highlight ? (
              <span className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-teal-700 px-3 py-1 text-xs font-bold text-white shadow-card">
                <Sparkles size={12} />
                {t("الأكثر طلباً", "Most popular")}
              </span>
            ) : null}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{lang === "en" && plan.nameEn ? plan.nameEn : plan.name}</h3>
              {current ? <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200/70">{t("باقتك", "Your plan")}</span> : null}
            </div>
            <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{(lang === "en" ? plan.taglineEn : plan.tagline) || plan.tagline || ""}</p>
            <div className="mt-4 min-h-16">
              {plan.contactOnly ? (
                <p className="text-2xl font-bold text-slate-900">{t("حسب الطلب", "Custom pricing")}</p>
              ) : (
                <>
                  <p className="tabular text-3xl font-bold tracking-tight text-slate-900">
                    {formatRial(price, lang)}
                    <span className="ms-1 text-sm font-medium text-slate-500">/ {cycle === "YEARLY" ? t("سنة", "year") : t("شهر", "month")}</span>
                  </p>
                  {saving > 0 ? <p className="mt-1 text-xs font-semibold text-teal-700">{t(`توفير ما يعادل ${saving} شهر`, `Save about ${saving} month(s)`)}</p> : null}
                </>
              )}
            </div>
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-teal-700" />
                <span>
                  {plan.maxEmployees === null ? t("موظفون بلا حد", "Unlimited employees") : t(`حتى ${plan.maxEmployees} موظف`, `Up to ${plan.maxEmployees} employees`)}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-teal-700" />
                <span>{plan.maxUsers === null ? t("مستخدمون بلا حد", "Unlimited users") : t(`${limitText(plan.maxUsers, lang)} مستخدم للنظام`, `${plan.maxUsers} system users`)}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-teal-700" />
                <span>{t("كل الأساسيات: الرواتب، الحضور، المستندات، البوابة", "All essentials: payroll, attendance, documents, portal")}</span>
              </li>
              {FEATURES.filter((feature) => features.includes(feature)).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-teal-700" />
                  <span>{FEATURE_LABEL[feature][lang]}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-5">{action(plan)}</div>
          </div>
        );
      })}
    </div>
  );
}
