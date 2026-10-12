"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";
import type { SelectOption } from "./search-select";

/** Several employees as removable chips with a searchable list; each id is submitted under `name`. Not for use inside <label>. */
export function EmployeeMultiSelect({
  name,
  options,
  defaultValues = [],
  placeholder,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  defaultValues?: string[];
  placeholder?: string;
  onChange?: (values: string[]) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState<string[]>(() => defaultValues.filter((value) => options.some((option) => option.value === value)));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);

  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query);
    return needle ? options.filter((option) => normalizeSearchText(`${option.label} ${option.hint || ""}`).includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const update = (next: string[]) => {
    setValues(next);
    onChange?.(next);
  };
  const toggle = (value: string) => update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div
        className="flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-surface px-2 py-1.5 transition hover:border-slate-300 focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10 sm:min-h-10"
        onClick={() => {
          input.current?.focus();
          setOpen(true);
        }}
      >
        {values.map((value) => (
          <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-teal-50 py-0.5 ps-2 pe-1 text-sm font-medium text-teal-900 ring-1 ring-teal-100">
            <span className="truncate">{byValue.get(value)?.label || value}</span>
            <button
              type="button"
              className="flex size-5 shrink-0 items-center justify-center rounded-md text-teal-700 hover:bg-teal-100"
              aria-label={t("إزالة", "Remove")}
              onClick={(event) => {
                event.stopPropagation();
                toggle(value);
              }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <div className="flex min-w-32 flex-1 items-center gap-1.5 px-1">
          {values.length === 0 ? <Search size={15} className="shrink-0 text-slate-400" /> : null}
          <input
            ref={input}
            value={query}
            role="combobox"
            aria-expanded={open}
            placeholder={values.length ? t("أضف موظفاً…", "Add an employee…") : placeholder || t("ابحث واختر الموظفين…", "Search and pick employees…")}
            className="min-h-8 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-sm"
            onFocus={() => setOpen(true)}
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
                event.preventDefault();
                if (open && filtered[active]) {
                  toggle(filtered[active].value);
                  setQuery("");
                }
              } else if (event.key === "Backspace" && !query && values.length) {
                update(values.slice(0, -1));
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
      </div>
      {open ? (
        <div
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-float"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
            <span>{t(`المختار: ${values.length}`, `Selected: ${values.length}`)}</span>
            {values.length ? (
              <button type="button" className="font-semibold text-teal-800 hover:underline" onClick={() => update([])}>
                {t("مسح الكل", "Clear all")}
              </button>
            ) : null}
          </div>
          <ul ref={list} role="listbox" aria-multiselectable="true" className="thin-scroll max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">{t("لا توجد نتائج", "No results")}</li> : null}
            {filtered.map((option, index) => {
              const selected = values.includes(option.value);
              return (
                <li
                  key={option.value}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={() => {
                    toggle(option.value);
                    setQuery("");
                  }}
                  className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm", index === active && "bg-teal-50")}
                >
                  <span
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                      selected ? "bg-teal-700 text-white ring-teal-700" : "bg-surface ring-slate-300",
                    )}
                  >
                    {selected ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", selected ? "font-semibold text-teal-900" : "text-slate-800")}>{option.label}</span>
                  {option.hint ? <span className="shrink-0 text-xs text-slate-400">{option.hint}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
