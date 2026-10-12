import { RefreshCw, Sparkles } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { getDailyBrief } from "@/lib/brief";
import type { Lang } from "@/lib/i18n";
import { refreshDailyBrief } from "@/server/brief-actions";
import { SubmitButton } from "./submit-button";

function BriefFrame({ lang, children, footer }: { lang: Lang; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <section id="brief" className="scroll-mt-24 rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50/80 via-surface to-surface p-5 shadow-card sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <span className="flex size-8 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Sparkles size={16} />
          </span>
          {t("ملخص اليوم", "Today's brief")}
        </h2>
        {footer}
      </div>
      {children}
    </section>
  );
}

export function DailyBriefSkeleton({ lang }: { lang: Lang }) {
  return (
    <BriefFrame lang={lang}>
      <div className="space-y-2.5" aria-busy="true">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none" />
      </div>
    </BriefFrame>
  );
}

/** Streams in after the dashboard; the first visit of the day asks the AI, later visits read the cached text. */
export async function DailyBriefCard({ user, lang }: { user: SessionUser; lang: Lang }) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const brief = await getDailyBrief(user.company, user.permissions, lang);
  const lines = brief.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const intro = lines.filter((line) => !line.startsWith("- "));
  const points = lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2));
  return (
    <BriefFrame
      lang={lang}
      footer={
        <form action={refreshDailyBrief} className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {brief.ai ? t("بالذكاء الاصطناعي من تنبيهاتك", "AI summary of your alerts") : t("ملخص التنبيهات", "Alerts summary")}
          </span>
          <SubmitButton variant="secondary" pendingLabel={t("جارٍ التحديث...", "Refreshing...")}>
            <RefreshCw size={15} />
            {t("تحديث", "Refresh")}
          </SubmitButton>
        </form>
      }
    >
      {intro.map((line, index) => (
        <p key={index} className="text-sm leading-7 text-slate-800">
          {line}
        </p>
      ))}
      {points.length ? (
        <ul className="mt-2 space-y-1.5">
          {points.map((point, index) => (
            <li key={index} className="flex gap-2.5 text-sm leading-6 text-slate-700">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </BriefFrame>
  );
}
