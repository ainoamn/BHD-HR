"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeSearchText as normalizeSearch } from "@/lib/search";
import { useLang } from "./lang-provider";
import { fieldClass } from "./ui";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string | null;
  /** Extra text matched by search (e.g. occupation code) but not shown as the main label. */
  keywords?: string | null;
};

/** Dispatch on the hidden input (`detail` = option value) to change the selection from outside, e.g. after reading a scan. */
export const SEARCH_SELECT_SET = "searchselect:set";

/** A select with a search box that matches both languages; submits the chosen value under `name`. */
export function SearchSelect({
  name,
  options,
  defaultValue = "",
  emptyLabel,
  placeholder,
  ariaLabel,
  onChange,
}: {
  name: string;
  /** For when the visible label is not a wrapping <label>. */
  ariaLabel?: string;
  options: SelectOption[];
  defaultValue?: string;
  /** Adds a first option that clears the value. */
  emptyLabel?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  const { t } = useLang();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const input = hidden.current;
    if (!input) return;
    const set = (event: Event) => {
      const next = String((event as CustomEvent<string>).detail ?? "");
      if (next && !options.some((option) => option.value === next)) return;
      setValue(next);
      onChange?.(next);
    };
    input.addEventListener(SEARCH_SELECT_SET, set);
    return () => input.removeEventListener(SEARCH_SELECT_SET, set);
  }, [options, onChange]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    const digits = query.replace(/\s+/g, "");
    const matches = needle
      ? options.filter((option) => {
          if (normalizeSearch(option.label).includes(needle)) return true;
          if (option.hint && normalizeSearch(option.hint).includes(needle)) return true;
          if (option.keywords && normalizeSearch(option.keywords).includes(needle)) return true;
          // Occupation codes: typing the first digits finds the job (e.g. 1120 → 1120001001).
          if (/^\d+$/.test(digits) && option.keywords) {
            const code = option.keywords.replace(/\s+/g, "");
            if (code.startsWith(digits) || code.includes(digits)) return true;
          }
          return false;
        })
      : options;
    return emptyLabel && !needle ? [{ value: "", label: emptyLabel, hint: null, keywords: null }, ...matches] : matches;
  }, [options, query, emptyLabel]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (next: string) => {
    setValue(next);
    setOpen(false);
    setQuery("");
    onChange?.(next);
  };

  return (
    <div ref={box} className="relative">
      <input ref={hidden} type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          className={`${fieldClass} w-full pe-9`}
          value={open ? query : selected?.label || ""}
          placeholder={open ? t("ابحث…", "Search…") : placeholder || emptyLabel || t("اختر", "Choose")}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              if (open && filtered[active]) {
                event.preventDefault();
                choose(filtered[active].value);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          autoComplete="off"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
        />
        {value && emptyLabel ? (
          <button type="button" className="absolute inset-y-0 end-7 flex items-center px-1 text-slate-400 hover:text-slate-700" onClick={() => choose("")} aria-label={t("مسح", "Clear")}>
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {open ? (
        <ul ref={list} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-surface py-1 shadow-lg" role="listbox">
          {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">{t("لا توجد نتائج", "No results")}</li> : null}
          {filtered.map((option, index) => (
            <li
              key={option.value || "__empty"}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${index === active ? "bg-teal-50" : ""} ${option.value === value ? "font-bold text-teal-900" : "text-slate-800"}`}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option.value);
              }}
            >
              <span>{option.label}</span>
              {option.hint ? <span className="shrink-0 text-xs text-slate-400">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
