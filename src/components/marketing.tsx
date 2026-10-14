import Link from "next/link";
import { LogIn } from "lucide-react";
import { LangToggle } from "@/components/lang-provider";
import { CycleSwitch, FreePlanStrip, PlanGrid } from "@/components/plan-cards";
import { ThemeToggle } from "@/components/theme-toggle";
import { primaryBtn, secondaryBtn } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import type { Cycle } from "@/lib/plans";
import type { PublicPlan } from "@/lib/public-site";
import { cn, type ThemeChoice } from "@/lib/utils";

export function MarketingHeader({ lang, theme }: { lang: Lang; theme: ThemeChoice }) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const links = [
    { href: "/#features", label: t("المزايا", "Features") },
    { href: "/#audience", label: t("لمن؟", "Who it's for") },
    { href: "/pricing", label: t("الأسعار", "Pricing") },
    { href: "/#faq", label: t("الأسئلة", "FAQ") },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="official-logo official-logo-mark official-logo-ink w-10 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm font-bold text-slate-900">{t("الموظفون والرواتب", "HR & Payroll")}</span>
        </Link>
        <nav className="ms-4 hidden flex-1 items-center gap-1 md:flex" aria-label={t("أقسام الصفحة", "Page sections")}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          <span className="hidden sm:contents">
            <ThemeToggle initial={theme} />
          </span>
          <LangToggle />
          <span className="hidden sm:contents">
            <Link href="/login" className={secondaryBtn}>
              <LogIn size={16} />
              {t("دخول", "Sign in")}
            </Link>
          </span>
          <Link href="/login" className={primaryBtn}>
            {t("ابدأ مجاناً", "Start free")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PricingSection({ lang, cycle, basePath, plans, trialDays }: { lang: Lang; cycle: Cycle; basePath: string; plans: PublicPlan[]; trialDays: number }) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <CycleSwitch cycle={cycle} lang={lang} hrefFor={(value) => `${basePath}?cycle=${value}#pricing`} />
      </div>
      <PlanGrid
        plans={plans}
        cycle={cycle}
        lang={lang}
        action={(plan) =>
          plan.contactOnly ? (
            <Link href="/#contact" className={cn(secondaryBtn, "w-full")}>
              {t("تواصل معنا", "Contact us")}
            </Link>
          ) : (
            <Link href="/login" className={cn(plan.highlight ? primaryBtn : secondaryBtn, "w-full")}>
              {t(`جرّب ${trialDays} يوماً مجاناً`, `Try ${trialDays} days free`)}
            </Link>
          )
        }
      />
      <FreePlanStrip
        plans={plans}
        lang={lang}
        action={
          <Link href="/login" className={cn(secondaryBtn, "w-full")}>
            {t("ابدأ مجاناً", "Start free")}
          </Link>
        }
      />
      <p className="text-center text-sm leading-6 text-slate-500">
        {t(
          `كل باقة تبدأ بتجربة مجانية ${trialDays} يوماً بكل المزايا، بدون بطاقة، ثم تختار باقة أو تنتقل إلى المجانية. الأسعار بالريال العُماني، ويمكنك الترقية أو التغيير في أي وقت، والأيام المدفوعة المتبقية تُحتسب لك.`,
          `Every plan starts with a ${trialDays}-day free trial with every feature, no card needed; then pick a plan or move to the free one. Prices in Omani rials; upgrade or switch any time and unused paid days carry over.`,
        )}
      </p>
    </div>
  );
}
