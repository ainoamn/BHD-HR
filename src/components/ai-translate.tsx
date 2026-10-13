"use client";

import { Languages, Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { translateTexts } from "@/server/ai-write-actions";
import { toast } from "./action-form";
import { useLang } from "./lang-provider";

const STORAGE_KEY = "hr_translate";
const BATCH_TEXTS = 40;
const BATCH_CHARS = 12000;

type Entry = string | null | undefined;
type Translate = {
  on: boolean;
  setOn: (on: boolean) => void;
  get: (text: string) => Entry;
  want: (text: string) => void;
  loading: boolean;
};

const TranslateContext = createContext<Translate | null>(null);

/**
 * Instant AI translation of what people wrote (steps, comments, history, notes). When switched on, every <Tr>
 * on screen shows its translation underneath (Arabic ⇄ English). Texts are batched into few requests and
 * cached for the session, so switching pages or back on again is instant.
 */
export function TranslateProvider({ children }: { children: React.ReactNode }) {
  const [on, setOnState] = useState(false);
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, string | null>());
  const queue = useRef(new Set<string>());
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const failed = useRef(false);

  useEffect(() => {
    setOnState(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || !queue.current.size) return;
    busy.current = true;
    setLoading(true);
    while (queue.current.size) {
      const batch: string[] = [];
      let chars = 0;
      for (const text of queue.current) {
        if (batch.length >= BATCH_TEXTS || (batch.length && chars + text.length > BATCH_CHARS)) break;
        batch.push(text);
        chars += text.length;
      }
      batch.forEach((text) => queue.current.delete(text));
      const result = await translateTexts(batch, window.location.pathname).catch(() => ({ error: "", texts: undefined }));
      if (result.texts) {
        batch.forEach((text, index) => cache.current.set(text, result.texts?.[index] ?? null));
      } else {
        batch.forEach((text) => cache.current.set(text, null));
        if (!failed.current && result.error) toast({ error: result.error });
        failed.current = true;
      }
      setVersion((value) => value + 1);
    }
    busy.current = false;
    setLoading(false);
  }, []);

  const want = useCallback(
    (text: string) => {
      if (cache.current.has(text) || queue.current.has(text)) return;
      queue.current.add(text);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 40);
    },
    [flush],
  );

  const setOn = useCallback((value: boolean) => {
    failed.current = false;
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    setOnState(value);
  }, []);

  const get = (text: string) => cache.current.get(text);

  return <TranslateContext.Provider value={{ on, setOn, get, want, loading }}>{children}</TranslateContext.Provider>;
}

function useTranslate() {
  return useContext(TranslateContext);
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/** User-written text that gets its AI translation underneath while instant translation is on. `children` replaces how the original shows (e.g. with @mentions marked). */
export function Tr({ text, size = "text-[0.92em]", tone = "light", children }: { text: string | null | undefined; size?: string; tone?: "light" | "dark"; children?: React.ReactNode }) {
  const live = useTranslate();
  const value = (text || "").trim();
  const wanted = Boolean(live?.on && value && /[\p{L}]/u.test(value));
  const want = live?.want;
  useEffect(() => {
    if (wanted) want?.(value);
  }, [wanted, value, want]);
  if (!text) return null;
  const translation = wanted ? live?.get(value) : undefined;
  return (
    <>
      {children ?? text}
      {wanted && translation === undefined ? <span className={cn("mt-1 block h-3 w-2/3 max-w-60 animate-pulse rounded-full", tone === "dark" ? "bg-white/20" : "bg-teal-100/80")} aria-hidden="true" /> : null}
      {wanted && translation && !same(translation, value) ? (
        <span
          dir="auto"
          className={cn("mt-1 block whitespace-pre-line border-s-2 ps-2 font-normal leading-6 tracking-normal", tone === "dark" ? "border-white/40 text-white/85" : "border-teal-300 text-teal-800", size)}
        >
          {translation}
        </span>
      ) : null}
    </>
  );
}

/** Switches instant translation on or off for every page (remembered on this device). */
export function TranslateToggle({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const live = useTranslate();
  const { t } = useLang();
  if (!live) return null;
  const label = live.on ? t("إيقاف الترجمة الفورية", "Turn off instant translation") : t("ترجمة فورية بالذكاء الاصطناعي", "Instant AI translation");
  const look =
    tone === "dark"
      ? live.on
        ? "bg-white text-teal-800 ring-white"
        : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
      : live.on
        ? "bg-teal-700 text-white ring-teal-700"
        : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={() => live.setOn(!live.on)}
      aria-pressed={live.on}
      title={label}
      aria-label={label}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold ring-1 ring-inset transition duration-200 sm:h-10 sm:px-3", look)}
    >
      {live.on && live.loading ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
      <span className={compact ? "hidden sm:inline" : ""}>{live.on ? t("الترجمة تعمل", "Translating") : t("ترجمة فورية", "Translate")}</span>
    </button>
  );
}
