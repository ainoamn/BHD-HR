"use client";

import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { pick } from "@/lib/i18n";
import { formatCauseReason, type WarningCause } from "@/lib/oman-labour";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { Field, fieldClass } from "./ui";

const CATEGORY_LABEL = {
  attendance: { ar: "الحضور والانصراف", en: "Attendance" },
  conduct: { ar: "السلوك", en: "Conduct" },
  safety: { ar: "السلامة والصحة", en: "Safety & health" },
  integrity: { ar: "النزاهة والأمانة", en: "Integrity" },
  other: { ar: "أخرى", en: "Other" },
  company: { ar: "نظام المنشأة", en: "Company policy" },
} as const;

export function WarningCausePicker({
  causes,
  value,
  occurrence,
  onSelect,
  onOccurrence,
}: {
  causes: WarningCause[];
  value: string;
  occurrence: 1 | 2 | 3 | 4;
  onSelect: (cause: WarningCause | null, reasonAr: string) => void;
  onOccurrence: (n: 1 | 2 | 3 | 4) => void;
}) {
  const { lang, t } = useLang();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return causes.filter((cause) => {
      const cat = cause.source === "company" ? "company" : cause.category || "other";
      if (category !== "all" && cat !== category) return false;
      if (!q) return true;
      return [cause.code, cause.titleAr, cause.titleEn, cause.detailAr, cause.detailEn].join(" ").toLowerCase().includes(q);
    });
  }, [causes, query, category]);

  const selected = causes.find((c) => c.code === value) || null;

  const apply = (cause: WarningCause | null, nextOccurrence = occurrence) => {
    if (!cause) {
      onSelect(null, "");
      return;
    }
    const { ar } = formatCauseReason(cause, nextOccurrence);
    onSelect(cause, ar);
  };

  return (
    <div className="space-y-3 rounded-2xl bg-orange-50/60 p-4 ring-1 ring-inset ring-orange-200/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-orange-950">{t("مسبب الإنذار (لائحة الجزاءات)", "Warning cause (sanctions schedule)")}</p>
          <p className="mt-0.5 text-xs leading-5 text-orange-900/80">
            {t(
              "اختر بنداً من القرار الوزاري 618/2024 أو من نظام المنشأة؛ يُدرج في نص الإنذار ويمكن تعديله.",
              "Pick a clause from MD 618/2024 or your company policy; it fills the reason and can still be edited.",
            )}
          </p>
        </div>
        <a href="/regulations?tab=penalties" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-900 underline underline-offset-4">
          <BookOpen size={14} />
          {t("اطّلاع على اللوائح", "Browse regulations")}
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${fieldClass} w-full ps-9`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("بحث برقم البند أو نص المخالفة…", "Search by clause number or text…")}
          />
        </label>
        <Field label={t("المرة", "Occurrence")}>
          <select
            className={fieldClass}
            value={occurrence}
            onChange={(e) => {
              const n = Number(e.target.value) as 1 | 2 | 3 | 4;
              onOccurrence(n);
              if (selected) apply(selected, n);
            }}
          >
            <option value={1}>{t("الأولى", "1st")}</option>
            <option value={2}>{t("الثانية", "2nd")}</option>
            <option value={3}>{t("الثالثة", "3rd")}</option>
            <option value={4}>{t("الرابعة", "4th")}</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", category === "all" ? "bg-orange-900 text-white ring-orange-900" : "bg-white text-slate-700 ring-slate-200")}
        >
          {t("الكل", "All")}
        </button>
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", category === key ? "bg-orange-900 text-white ring-orange-900" : "bg-white text-slate-700 ring-slate-200")}
          >
            {pick(CATEGORY_LABEL[key], lang)}
          </button>
        ))}
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-white p-1.5 ring-1 ring-inset ring-slate-200">
        <button
          type="button"
          onClick={() => apply(null)}
          className={cn("w-full rounded-lg px-3 py-2 text-start text-sm", !value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50")}
        >
          {t("بدون بند جاهز — أكتب السبب يدوياً", "No ready clause — type the reason myself")}
        </button>
        {filtered.map((cause) => {
          const active = cause.code === value;
          return (
            <button
              key={cause.code}
              type="button"
              onClick={() => apply(cause)}
              className={cn("w-full rounded-lg px-3 py-2 text-start transition", active ? "bg-teal-700 text-white" : "hover:bg-slate-50")}
            >
              <span className={cn("block text-sm font-semibold", active ? "text-white" : "text-slate-900")}>{pick({ ar: cause.titleAr, en: cause.titleEn }, lang)}</span>
              <span className={cn("mt-0.5 block text-xs leading-5", active ? "text-teal-50" : "text-slate-500")}>
                <span className="tabular font-medium" dir="ltr">
                  {cause.code}
                </span>
                {" · "}
                {pick({ ar: cause.detailAr, en: cause.detailEn }, lang)}
              </span>
            </button>
          );
        })}
        {!filtered.length ? <p className="px-3 py-4 text-center text-sm text-slate-500">{t("لا نتائج لهذا البحث.", "No matches for this search.")}</p> : null}
      </div>

      {selected ? (
        <>
          <input type="hidden" name="clauseCode" value={selected.code} />
          <input type="hidden" name="clauseTitle" value={pick({ ar: selected.titleAr, en: selected.titleEn }, "ar")} />
        </>
      ) : null}
    </div>
  );
}
