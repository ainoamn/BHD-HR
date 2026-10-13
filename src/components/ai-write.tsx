"use client";

import { Languages, Lightbulb, Loader2, Sparkles, Undo2, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { writeHelp } from "@/server/ai-write-actions";
import { useLang } from "./lang-provider";

type Field = HTMLTextAreaElement | HTMLInputElement;
type Mode = "translate" | "improve" | "suggest";
type Place = { container: HTMLElement; top: number; side: "left" | "right"; offset: number };

/** Single-line inputs that hold free text; textareas always qualify. `data-ai="on"` opts any other input in. */
const TEXT_NAMES = /^(title|text|note|notes|reason|subject|body|description|message|comment|details|remarks|purpose)$/i;

function eligible(node: EventTarget | null): node is Field {
  if (!(node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)) return false;
  if (node.readOnly || node.disabled || node.closest('[data-ai="off"]')) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return node.type === "text" && (node.dataset.ai === "on" || TEXT_NAMES.test(node.name));
}

const isArabic = (text: string) => (text.match(/[\u0600-\u06FF]/g) || []).length >= (text.match(/[A-Za-z]/g) || []).length;

function labelOf(field: Field) {
  const label = field.closest("label");
  const own = label
    ? [...label.childNodes]
        .filter((node) => !(node instanceof Element && (node === field || node.contains(field))))
        .map((node) => node.textContent || "")
        .join(" ")
    : "";
  return [own, field.getAttribute("aria-label"), field.placeholder].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function contextOf(field: Field) {
  const parts = [
    field.closest("[data-ai-context]")?.getAttribute("data-ai-context"),
    field.closest("dialog")?.querySelector("h2")?.textContent,
    document.querySelector("main h1, h1")?.textContent,
  ];
  return parts.filter(Boolean).join(" · ").replace(/\s+/g, " ").trim().slice(0, 1500);
}

/** Sets the value the way typing does, so React-controlled and plain fields both pick it up. */
function setValue(field: Field, value: string) {
  const next = field.maxLength > 0 ? value.slice(0, field.maxLength) : value;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
}

function placeOf(field: Field): Place | null {
  if (!field.isConnected || !field.getClientRects().length) return null;
  const rect = field.getBoundingClientRect();
  const rtl = document.documentElement.dir === "rtl";
  const dialog = field.closest("dialog");
  if (dialog) {
    const box = dialog.getBoundingClientRect();
    return {
      container: dialog,
      top: rect.bottom - box.top - dialog.clientTop + dialog.scrollTop,
      side: rtl ? "left" : "right",
      offset: rtl ? rect.left - box.left - dialog.clientLeft : box.right - rect.right - dialog.clientLeft,
    };
  }
  return {
    container: document.body,
    top: rect.bottom + window.scrollY,
    side: rtl ? "left" : "right",
    offset: rtl ? rect.left + window.scrollX : document.documentElement.clientWidth - rect.right,
  };
}

/**
 * AI help while writing, in every free-text field of the pages it is mounted on: focus a field and the ✨ chip
 * at its corner offers translation (Arabic ⇄ English), better wording, and suggestions from the field and page
 * context. Results replace the text, with undo; nothing is saved until the form is submitted.
 */
export function AiWriteAssist() {
  const { t } = useLang();
  const [field, setField] = useState<Field | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = useRef<Field | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const close = () => {
      current.current = null;
      request.current++;
      setField(null);
      setOpen(false);
      setBusy(null);
      setSuggestions([]);
      setError("");
      setUndo(null);
    };
    const onFocus = (event: FocusEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      if (eligible(event.target)) {
        if (event.target === current.current) return;
        close();
        current.current = event.target;
        setField(event.target);
        setText(event.target.value);
      } else close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || target === current.current) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && current.current) setOpen(false);
    };
    const onInput = (event: Event) => {
      if (event.target === current.current) setText((event.target as Field).value);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("input", onInput);
    };
  }, []);

  useEffect(() => {
    if (!field) return;
    let frame = 0;
    let last = "";
    const follow = () => {
      const next = placeOf(field);
      const key = next ? `${next.top}|${next.offset}|${next.side}` : "";
      if (key !== last) {
        last = key;
        setPlace(next);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [field]);

  if (!field || !place) return null;

  const run = async (mode: Mode) => {
    const source = field.value.trim();
    if (mode !== "suggest" && !source) return;
    const id = ++request.current;
    setBusy(mode);
    setError("");
    setSuggestions([]);
    const result = await writeHelp(
      { mode, text: source, label: labelOf(field), context: contextOf(field), multiline: field instanceof HTMLTextAreaElement, maxLength: field.maxLength > 0 ? field.maxLength : 3000 },
      window.location.pathname,
    ).catch(() => ({ error: t("تعذّر الوصول إلى الذكاء الاصطناعي الآن.", "The AI is unavailable right now."), text: undefined, suggestions: undefined }));
    if (id !== request.current) return;
    setBusy(null);
    if (result.error) return setError(result.error);
    if (result.suggestions) return setSuggestions(result.suggestions);
    if (result.text) {
      setUndo(field.value);
      setValue(field, result.text);
    }
  };

  const apply = (value: string) => {
    setUndo(field.value);
    setValue(field, value);
    setSuggestions([]);
  };

  const hasText = Boolean(text.trim());
  const toEnglish = hasText ? isArabic(text) : document.documentElement.lang !== "en";
  const action = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-45";
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return createPortal(
    <div
      ref={box}
      data-ai="off"
      onMouseDown={keepFocus}
      className="no-print absolute z-[70] flex flex-col items-end"
      style={place.side === "right" ? { top: place.top, right: place.offset } : { top: place.top, left: place.offset }}
    >
      <div className="-mt-3.5 me-2 ms-2 flex items-center gap-1">
        {undo !== null ? (
          <button
            type="button"
            onClick={() => {
              setValue(field, undo);
              setUndo(null);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-semibold text-slate-600 shadow-card ring-1 ring-slate-200 transition hover:text-slate-900"
          >
            <Undo2 size={13} />
            {t("تراجع", "Undo")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={t("مساعدة الكتابة بالذكاء الاصطناعي", "AI writing help")}
          title={t("ترجمة وتحسين واقتراحات بالذكاء الاصطناعي", "AI translation, wording and suggestions")}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold shadow-card ring-1 transition duration-150",
            open ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-teal-700 ring-teal-200 hover:bg-teal-50",
          )}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {t("ذكاء", "AI")}
        </button>
      </div>
      {open ? (
        <div className="mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] animate-fade-up rounded-2xl border border-slate-200 bg-surface p-1.5 text-slate-900 shadow-float">
          <button type="button" className={action} disabled={!hasText || busy !== null} onClick={() => run("translate")}>
            {busy === "translate" ? <Loader2 size={16} className="animate-spin text-teal-700" /> : <Languages size={16} className="text-teal-700" />}
            {toEnglish ? t("ترجم إلى الإنجليزية", "Translate to English") : t("ترجم إلى العربية", "Translate to Arabic")}
          </button>
          <button type="button" className={action} disabled={!hasText || busy !== null} onClick={() => run("improve")}>
            {busy === "improve" ? <Loader2 size={16} className="animate-spin text-teal-700" /> : <WandSparkles size={16} className="text-teal-700" />}
            {t("حسّن الصياغة والإملاء", "Improve wording & spelling")}
          </button>
          <button type="button" className={action} disabled={busy !== null} onClick={() => run("suggest")}>
            {busy === "suggest" ? <Loader2 size={16} className="animate-spin text-gold-600" /> : <Lightbulb size={16} className="text-gold-600" />}
            {hasText ? t("اقترح صيغاً أفضل", "Suggest better versions") : t("اقترح ما أكتب هنا", "Suggest what to write")}
          </button>
          {suggestions.length ? (
            <div className="mt-1 space-y-1 border-t border-slate-100 px-1 pt-2">
              <p className="px-1 text-xs font-semibold text-slate-500">{t("اختر اقتراحاً:", "Pick a suggestion:")}</p>
              {suggestions.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => apply(item)}
                  dir="auto"
                  className="block w-full whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-start text-sm leading-6 text-slate-800 ring-1 ring-inset ring-slate-100 transition hover:bg-teal-50 hover:ring-teal-200"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="px-3 py-2 text-xs leading-5 text-red-700">{error}</p> : null}
          <p className="px-3 pb-1 pt-1.5 text-[11px] leading-4 text-slate-400">{t("يستبدل النص في الحقل، ولا يُحفظ شيء حتى ترسل النموذج.", "Replaces the field's text; nothing is saved until you submit.")}</p>
        </div>
      ) : null}
    </div>,
    place.container,
  );
}
