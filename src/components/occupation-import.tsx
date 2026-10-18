"use client";

import { useState } from "react";
import { BookOpenCheck, CircleAlert, CircleCheck, FileText, Loader2, Sparkles } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { primaryBtn, secondaryBtn } from "@/components/ui";
import { SKILL_CLASS } from "@/lib/occupation-guide";
import type { OccupationPreview } from "@/lib/occupation-preview";
import { importOccupationGuide, previewBuiltInOccupationGuide } from "@/server/occupation-actions";
import { previewOccupationGuide } from "@/server/occupation-pdf-actions";

/**
 * Import the Ministry of Labour unified occupation guide into the job-title catalog:
 * one-click official list, or upload a newer PDF.
 */
export function OccupationImport() {
  const { lang, t } = useLang();
  const [busy, setBusy] = useState<"read" | "builtin" | "save" | null>(null);
  const [preview, setPreview] = useState<OccupationPreview | null>(null);
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);

  async function read(file: File | null) {
    if (!file) return;
    setBusy("read");
    setResult(null);
    setPreview(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const next = await previewOccupationGuide(form);
      setPreview(next);
    } catch {
      setPreview({ error: t("انقطع الاتصال. أعد المحاولة.", "Connection lost. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  async function loadBuiltIn() {
    setBusy("builtin");
    setResult(null);
    setPreview(null);
    try {
      const next = await previewBuiltInOccupationGuide();
      setPreview(next);
    } catch {
      setPreview({ error: t("انقطع الاتصال. أعد المحاولة.", "Connection lost. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!preview?.builtin && !preview?.payload) return;
    setBusy("save");
    setResult(null);
    const form = new FormData();
    if (preview.builtin) form.append("builtin", "1");
    else form.append("payload", preview.payload!);
    try {
      const next = await importOccupationGuide(form);
      setResult(next);
      if (!next.error) setPreview(null);
    } catch {
      setResult({ error: t("انقطع الاتصال. أعد المحاولة.", "Connection lost. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  const classEntries = preview?.byClass ? Object.entries(preview.byClass).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
          <BookOpenCheck size={20} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-bold text-slate-900">{t("الدليل الموحد لتصنيف المهن", "Unified occupation classification")}</h3>
          <p className="text-sm text-slate-600">
            {t(
              "استورد دليل وزارة العمل الرسمي بنقرة (رمز المهنة، الاسمين، والفئة)، أو ارفع PDF أحدث إن صدر تحديث.",
              "Import the official Ministry of Labour guide in one click (code, both names, and class), or upload a newer PDF if one is released.",
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => void loadBuiltIn()}>
          {busy === "builtin" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy === "builtin"
            ? t("جارٍ تحميل الدليل…", "Loading the guide…")
            : t("استيراد الدليل الرسمي (وزارة العمل)", "Import the official guide (MoL)")}
        </button>
      </div>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-surface px-4 py-6 text-center transition hover:border-teal-500">
        {busy === "read" ? <Loader2 size={24} className="animate-spin text-teal-700" /> : <FileText size={24} className="text-teal-700" />}
        <span className="text-sm font-semibold text-slate-800">
          {busy === "read" ? t("جارٍ قراءة الملف…", "Reading the file…") : t("أو ارفع ملف PDF محدّث", "Or upload an updated PDF")}
        </span>
        <span className="text-xs text-slate-500">{t("حتى 4 ميغابايت", "Up to 4 MB")}</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={busy !== null}
          onChange={(event) => {
            void read(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </label>

      {preview?.error ? (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{preview.error}</span>
        </p>
      ) : null}

      {preview && !preview.error && preview.total ? (
        <div className="space-y-3 rounded-xl bg-surface p-3 ring-1 ring-inset ring-teal-200">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-teal-900">
            <Sparkles size={16} />
            {t("تم التعرّف على الملف:", "File recognised:")} {preview.kindLabel}
          </p>
          <p className="text-sm text-slate-700">
            {t(`${preview.total} مهنة`, `${preview.total} occupations`)}
            {classEntries.length
              ? " — " +
                classEntries
                  .map(([code, count]) => {
                    const label =
                      code === "none"
                        ? t("بلا فئة", "No class")
                        : lang === "en"
                          ? SKILL_CLASS[code as keyof typeof SKILL_CLASS]?.en || code
                          : SKILL_CLASS[code as keyof typeof SKILL_CLASS]?.ar || code;
                    return `${label}: ${count}`;
                  })
                  .join(" · ")
              : ""}
          </p>
          {preview.sample?.length ? (
            <ul className="divide-y divide-slate-100 text-xs">
              {preview.sample.map((row) => (
                <li key={row.code} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">{row.nameAr}</span>
                    {row.nameEn ? (
                      <span className="ms-2 text-slate-500" dir="ltr">
                        {row.nameEn}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-slate-500" dir="ltr">
                    {row.code} · {row.classLabel}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => void save()}>
              {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <CircleCheck size={16} />}
              {busy === "save" ? t("جارٍ الحفظ…", "Saving…") : t(`إضافة / تحديث ${preview.total} مهنة`, `Add / update ${preview.total} occupations`)}
            </button>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setPreview(null)}>
              {t("إلغاء", "Cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {result?.error ? (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </p>
      ) : null}
      {result?.message ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          <CircleCheck size={16} className="mt-0.5 shrink-0" />
          <span>{result.message}</span>
        </p>
      ) : null}
    </div>
  );
}
