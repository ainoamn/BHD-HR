"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { secondaryBtn } from "@/components/ui";
import { ownerInsights } from "@/server/analytics-actions";

export function OwnerInsights() {
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text?: string; error?: string } | null>(null);
  const lines = (result?.text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <div>
      <button type="button" className={secondaryBtn} disabled={pending} onClick={() => start(async () => setResult(await ownerInsights()))}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-gold-600" />}
        {pending ? t("جارٍ التحليل...", "Analysing...") : result?.text ? t("تحليل جديد", "Analyse again") : t("حلّل الأرقام بالذكاء الاصطناعي", "Analyse the figures with AI")}
      </button>
      <div aria-live="polite">
        {result?.error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-100">{result.error}</p> : null}
        {lines.length ? (
          <ul className="mt-4 space-y-2">
            {lines.map((line, index) => (
              <li key={index} className="animate-fade-up rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-7 text-slate-800 ring-1 ring-inset ring-slate-100">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {lines.length ? <p className="mt-2 text-xs text-slate-400">{t("تحليل آلي من أرقام هذه الصفحة — راجعه قبل اتخاذ القرار.", "Automatic analysis of the figures on this page — check it before deciding.")}</p> : null}
      </div>
    </div>
  );
}
