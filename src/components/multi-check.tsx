"use client";

import { useMemo, useState } from "react";
import { normalizeSearchText as normalizeSearch } from "@/lib/search";
import { useLang } from "./lang-provider";
import type { SelectOption } from "./search-select";
import { fieldClass } from "./ui";

/** Searchable checkbox list; each ticked value is submitted under `name`. */
export function MultiCheck({ name, options, defaultValues = [] }: { name: string; options: SelectOption[]; defaultValues?: string[] }) {
  const { t } = useLang();
  const [checked, setChecked] = useState(() => new Set(defaultValues));
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = normalizeSearch(query);
    return needle ? options.filter((option) => normalizeSearch(option.label).includes(needle) || (option.hint && normalizeSearch(option.hint).includes(needle))) : options;
  }, [options, query]);
  const toggle = (value: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });

  return (
    <div className="space-y-2">
      {[...checked].map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${fieldClass} min-w-40 flex-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ابحث في المسميات…", "Search titles…")} />
        <span className="text-xs font-semibold text-teal-800">{t(`المختار: ${checked.size}`, `Selected: ${checked.size}`)}</span>
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-surface p-1">
        {shown.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" className="accent-teal-700" checked={checked.has(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} />
            <span>{option.label}</span>
            {option.hint ? <span className="text-xs text-slate-400">{option.hint}</span> : null}
          </label>
        ))}
        {shown.length === 0 ? <p className="px-2 py-1.5 text-sm text-slate-500">{t("لا توجد نتائج", "No results")}</p> : null}
      </div>
    </div>
  );
}
