"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, SendHorizontal, Sparkles } from "lucide-react";
import type { HelpAudience } from "@/lib/help";
import { cn } from "@/lib/utils";
import { askHelp, type HelpAnswer } from "@/server/help-actions";
import { useLang } from "../lang-provider";
import { fieldClass, primaryBtn } from "../ui";

export function HelpAsk({ audience, token, basePath, suggestions }: { audience: HelpAudience; token?: string; basePath: string; suggestions: string[] }) {
  const { t, lang } = useLang();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<HelpAnswer | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  const ask = (text: string) => {
    const value = text.trim();
    if (!value || pending) return;
    setQuestion(value);
    setAsked(value);
    setResult(null);
    startTransition(async () => {
      const reply = await askHelp({ question: value, audience, token }).catch(() => ({ error: t("تعذّر الاتصال. حاول مجدداً.", "Connection failed. Try again.") }));
      setResult(reply);
    });
  };

  return (
    <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-surface p-4 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
          <Sparkles size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">{t("اسأل عن طريقة الاستخدام", "Ask how to do something")}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            {t("اكتب سؤالك بلغتك، فيجيبك الذكاء الاصطناعي بالخطوات من هذا الدليل ويدلّك على الشرح المناسب.", "Ask in your own words; AI answers with the steps from this guide and points you to the right topic.")}
          </p>
        </div>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          ref={input}
          className={cn(fieldClass, "flex-1")}
          value={question}
          maxLength={500}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("مثال: كيف أصرف رواتب هذا الشهر؟", "e.g. How do I pay this month's salaries?")}
          aria-label={t("سؤالك", "Your question")}
        />
        <button type="submit" className={cn(primaryBtn, "shrink-0 px-3.5")} disabled={pending || question.trim().length < 3} aria-label={t("اسأل", "Ask")}>
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : <SendHorizontal size={17} className="rtl:-scale-x-100" />}
          <span className="hidden sm:inline">{t("اسأل", "Ask")}</span>
        </button>
      </form>
      {!result && !pending ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => ask(item)}
              className="rounded-full bg-surface px-3 py-1.5 text-start text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-50"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {pending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status">
          <LoaderCircle size={16} className="animate-spin text-teal-700" />
          {t("أبحث في الدليل...", "Looking through the guide...")}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-xl bg-surface p-4 ring-1 ring-slate-200" role="status" aria-live="polite">
          <p className="text-xs font-semibold text-slate-500">{asked}</p>
          {"error" in result ? (
            <p className="mt-2 text-sm leading-7 text-red-700">{result.error}</p>
          ) : (
            <>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-800">{result.answer}</p>
              {result.topics.length ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {result.topics.map((topic) => (
                    <Link key={topic.slug} href={`${basePath}/${topic.slug}`} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100">
                      {topic.title}
                      <Arrow size={14} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setQuestion("");
              input.current?.focus();
            }}
            className="mt-3 text-xs font-semibold text-teal-700 hover:underline"
          >
            {t("سؤال آخر", "Ask another question")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
