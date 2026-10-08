"use client";

import { createContext, useContext } from "react";
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
  return (
    <button
      type="button"
      className={className || "rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      {next === "en" ? "English" : "العربية"}
    </button>
  );
}
