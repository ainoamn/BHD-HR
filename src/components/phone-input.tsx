"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { dialCode, joinPhone, phoneCountries, splitPhone } from "@/lib/phone";
import { normalizeSearchText } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { fieldClass } from "./ui";

/** Labelled phone field. Not wrapped in <label>: the country button inside would steal the label's clicks. */
export function PhoneField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string | null }) {
  const id = useId();
  return (
    <div className="block min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <PhoneInput id={id} name={name} defaultValue={defaultValue} />
    </div>
  );
}

/** Country dialing code (all countries, Oman by default) + local number; submits "+968 91234567" under `name`. */
export function PhoneInput({ id, name, defaultValue, ariaLabel }: { id?: string; name: string; defaultValue?: string | null; ariaLabel?: string }) {
  const { lang, t } = useLang();
  const initial = splitPhone(defaultValue);
  const [country, setCountry] = useState(initial.country);
  const [number, setNumber] = useState(initial.number);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const numberInput = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => (open ? phoneCountries(lang) : []), [open, lang]);
  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query.replace(/^\+|^00/, ""));
    if (!needle) return countries;
    return countries.filter(
      (item) =>
        item.dial.startsWith(needle) ||
        item.iso.toLowerCase() === needle ||
        normalizeSearchText(item.name).includes(needle) ||
        normalizeSearchText(item.other).includes(needle),
    );
  }, [countries, query]);

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

  const choose = (iso: string) => {
    setCountry(iso);
    setOpen(false);
    setQuery("");
    numberInput.current?.focus();
  };

  return (
    <div
      ref={box}
      className="relative flex gap-2"
      dir="ltr"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input type="hidden" name={name} value={joinPhone(country, number) ?? ""} />
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setActive(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t(`رمز الدولة +${dialCode(country)}`, `Country code +${dialCode(country)}`)}
        className={cn(fieldClass, "flex w-[6.5rem] shrink-0 cursor-pointer items-center gap-1.5")}
      >
        <span className="text-[0.7rem] font-semibold text-slate-400">{country}</span>
        <span className="tabular flex-1 text-start font-semibold">+{dialCode(country)}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      <input
        ref={numberInput}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={ariaLabel}
        className={cn(fieldClass, "tabular w-0 flex-1")}
        value={number}
        placeholder={country === "OM" ? "9123 4567" : ""}
        onChange={(event) => {
          const typed = event.target.value;
          if (/^\s*(\+|00)/.test(typed)) {
            const parsed = splitPhone(typed);
            setCountry(parsed.country);
            setNumber(parsed.number);
          } else {
            setNumber(typed.replace(/[^\d\s-]/g, ""));
          }
        }}
      />
      {open ? (
        <div
          className="absolute start-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-float"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget.querySelector("input")) event.preventDefault();
          }}
        >
          <div className="relative border-b border-slate-100 p-2">
            <Search size={15} className="pointer-events-none absolute start-4.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              dir="auto"
              value={query}
              placeholder={t("ابحث بالدولة أو الرمز", "Search country or code")}
              className="h-10 w-full rounded-lg bg-slate-50 ps-8 pe-3 text-base outline-none sm:text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-teal-600/30"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, filtered.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (filtered[active]) choose(filtered[active].iso);
                } else if (event.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
              }}
            />
          </div>
          <ul ref={list} role="listbox" className="thin-scroll max-h-64 overflow-y-auto py-1" dir={lang === "en" ? "ltr" : "rtl"}>
            {filtered.length === 0 ? <li className="px-3 py-2 text-sm text-slate-500">{t("لا توجد نتائج", "No results")}</li> : null}
            {filtered.map((item, index) => (
              <li
                key={item.iso}
                data-index={index}
                role="option"
                aria-selected={item.iso === country}
                onMouseEnter={() => setActive(index)}
                onMouseDown={() => choose(item.iso)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                  index === active && "bg-teal-50",
                  item.iso === country ? "font-bold text-teal-900" : "text-slate-800",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="tabular shrink-0 text-xs text-slate-500" dir="ltr">
                  +{item.dial}
                </span>
                {item.iso === country ? <Check size={14} className="shrink-0 text-teal-700" /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
