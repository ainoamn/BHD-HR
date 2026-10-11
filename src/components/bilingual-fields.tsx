"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { translateField } from "@/server/ai-actions";
import { useLang } from "./lang-provider";
import { fieldClass } from "./ui";

/**
 * Arabic and English inputs with AI translation: leaving one filled while the other is empty fills it
 * automatically, and the ✨ button re-translates on demand.
 */
export function BilingualFields({
  arName,
  enName,
  arLabel,
  enLabel,
  arDefault = "",
  enDefault = "",
  kind = "term",
  required = false,
  compact = false,
}: {
  arName: string;
  enName: string;
  arLabel: string;
  enLabel: string;
  arDefault?: string | null;
  enDefault?: string | null;
  kind?: "name" | "term";
  required?: boolean;
  compact?: boolean;
}) {
  const { t } = useLang();
  const [ar, setAr] = useState(arDefault || "");
  const [en, setEn] = useState(enDefault || "");
  const [busy, setBusy] = useState<"ar" | "en" | null>(null);
  const [error, setError] = useState("");

  const translate = async (to: "ar" | "en") => {
    const source = (to === "en" ? ar : en).trim();
    if (!source || busy) return;
    setBusy(to);
    setError("");
    const result = await translateField(source, to, kind);
    setBusy(null);
    if (result.text) (to === "en" ? setEn : setAr)(result.text);
    else setError(result.error || "");
  };

  const button = (to: "ar" | "en") => {
    const source = to === "en" ? ar : en;
    return (
      <button
        type="button"
        onClick={() => translate(to)}
        disabled={!source.trim() || busy !== null}
        title={to === "en" ? t("ترجمة من العربية بالذكاء الاصطناعي", "Translate from Arabic with AI") : t("ترجمة من الإنجليزية بالذكاء الاصطناعي", "Translate from English with AI")}
        className="absolute inset-y-0 end-0 flex items-center gap-1 rounded-e-lg px-2.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:text-slate-300 disabled:hover:bg-transparent"
      >
        {busy === to ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {compact ? null : <span className="hidden sm:inline">{t("ترجمة", "Translate")}</span>}
      </button>
    );
  };

  const label = (text: string) => <span className={compact ? "text-xs text-slate-600" : "text-sm font-medium text-slate-700"}>{text}</span>;

  return (
    <>
      <label className="block space-y-1.5">
        {label(arLabel)}
        <div className="relative" dir="rtl">
          <input
            className={`${fieldClass} w-full ${compact ? "pe-10" : "pe-10 sm:pe-20"}`}
            name={arName}
            dir="rtl"
            value={ar}
            required={required}
            onChange={(event) => setAr(event.target.value)}
            onBlur={() => {
              if (ar.trim() && !en.trim()) translate("en");
            }}
          />
          {button("ar")}
        </div>
      </label>
      <label className="block space-y-1.5">
        {label(enLabel)}
        <div className="relative" dir="ltr">
          <input
            className={`${fieldClass} w-full ${compact ? "pe-10" : "pe-10 sm:pe-20"}`}
            name={enName}
            dir="ltr"
            value={en}
            onChange={(event) => setEn(event.target.value)}
            onBlur={() => {
              if (en.trim() && !ar.trim()) translate("ar");
            }}
          />
          {button("en")}
        </div>
        {busy ? <span className="block text-xs text-teal-700">{t("جارٍ الترجمة بالذكاء الاصطناعي…", "Translating with AI…")}</span> : null}
        {error ? <span className="block text-xs text-red-700">{error}</span> : null}
      </label>
    </>
  );
}
