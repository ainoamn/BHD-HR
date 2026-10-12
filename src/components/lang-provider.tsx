"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";
import { LANG_COOKIE, makeT, type Lang } from "@/lib/i18n";

const LangContext = createContext<Lang>("ar");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: makeT(lang) };
}

export function LangToggle({ className }: { className?: string }) {
  const { lang } = useLang();
  const next = lang === "ar" ? "en" : "ar";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={
        className ||
        "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-surface px-2.5 text-sm font-semibold text-slate-700 shadow-card transition hover:border-slate-300 hover:text-slate-900 sm:px-3"
      }
      lang={next}
      aria-label={next === "en" ? "Switch to English" : "التبديل إلى العربية"}
      disabled={pending}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
    >
      <Languages size={16} className="hidden shrink-0 text-slate-500 sm:block" aria-hidden="true" />
      <span>{next === "en" ? "EN" : "عربي"}</span>
    </button>
  );
}
