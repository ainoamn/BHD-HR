"use client";

import { Building2, Check, LoaderCircle, PenLine, Save, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { pick } from "@/lib/i18n";
import { fillLibraryText, LETTER_STYLE, LETTER_STYLES, templatesFor, type LetterStyle } from "@/lib/letter-library";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import { cn } from "@/lib/utils";
import { deleteLetterTemplate, saveLetterTemplate, type SavedLetterTemplate } from "@/server/letter-actions";
import { useLang } from "./lang-provider";
import { ToneBadge, fieldClass, secondaryBtn } from "./ui";

export type LetterText = { subject: string; subjectEn: string; body: string; bodyEn: string };

type Option = { id: string; title: string; badge: { label: string; tone: string }; text: LetterText; company?: SavedLetterTemplate };

/**
 * Ready wordings for the chosen kind (the company's own first, then the library), filterable by style,
 * plus “write by hand” and saving the current text as a company template.
 */
export function LetterTemplates({
  kind,
  reason,
  current,
  companyTemplates,
  onTemplatesChange,
  onApply,
}: {
  kind: LetterKind;
  reason: string;
  current: LetterText;
  companyTemplates: SavedLetterTemplate[];
  onTemplatesChange: (next: SavedLetterTemplate[]) => void;
  onApply: (text: LetterText, note: string) => void;
}) {
  const { lang, t } = useLang();
  const [style, setStyle] = useState<LetterStyle | "all" | "company">("all");
  const [applied, setApplied] = useState<{ id: string; body: string } | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [undo, setUndo] = useState<LetterText | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const options = useMemo<Option[]>(() => {
    const own: Option[] = companyTemplates
      .filter((item) => item.kind === kind)
      .map((item) => ({
        id: `company:${item.id}`,
        title: item.title,
        badge: { label: t("نموذج المنشأة", "Company"), tone: "teal" },
        text: { subject: item.subject, subjectEn: item.subjectEn, body: item.body, bodyEn: item.bodyEn },
        company: item,
      }));
    const library = templatesFor(kind).map((item) => ({
      id: item.id,
      title: pick(item.title, lang),
      badge: { label: pick(LETTER_STYLE[item.style].label, lang), tone: LETTER_STYLE[item.style].tone },
      style: item.style,
      text: { subject: item.subject, subjectEn: item.subjectEn, body: item.body, bodyEn: item.bodyEn },
    }));
    if (style === "company") return own;
    return [...own, ...library.filter((item) => style === "all" || item.style === style)];
  }, [companyTemplates, kind, lang, style, t]);

  const styles = LETTER_STYLES.filter((key) => templatesFor(kind).some((item) => item.style === key));
  const ownCount = companyTemplates.filter((item) => item.kind === kind).length;

  const fill = (text: LetterText): LetterText => ({
    subject: fillLibraryText(text.subject, "", "ar") || current.subject,
    subjectEn: fillLibraryText(text.subjectEn, "", "en") || current.subjectEn,
    body: fillLibraryText(text.body, reason, "ar"),
    bodyEn: fillLibraryText(text.bodyEn, reason, "en"),
  });

  /** Keeps text the user wrote themselves so picking a template can be undone. */
  const remember = () => setUndo(current.body.trim() && current.body !== applied?.body ? { ...current } : null);

  const choose = (option: Option) => {
    remember();
    const text = fill(option.text);
    setApplied({ id: option.id, body: text.body });
    setNote(null);
    setConfirmDelete(null);
    onApply(
      text,
      text.body.includes("[[") || text.subject.includes("[[")
        ? t("تمت تعبئة النص من النموذج. أكمل الفراغات المعلّمة بين [[ ]] وراجع النص قبل الإصدار.", "Filled from the template. Fill in the blanks marked [[ ]] and review the text before issuing.")
        : t("تمت تعبئة النص من النموذج. راجعه وعدّله قبل الإصدار.", "Filled from the template. Review and edit before issuing."),
    );
  };

  const manual = () => {
    remember();
    setApplied({ id: "manual", body: "" });
    onApply({ subject: current.subject || LETTER_KIND[kind].label.ar, subjectEn: current.subjectEn, body: "", bodyEn: "" }, t("اكتب نص الخطاب بنفسك في الحقول أدناه.", "Write the letter text yourself in the fields below."));
  };

  const save = () =>
    startBusy(async () => {
      setNote(null);
      const result = await saveLetterTemplate({ kind, title, ...current });
      if (result.error || !result.template) {
        setNote({ tone: "error", text: result.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      onTemplatesChange([result.template, ...companyTemplates]);
      setTitle("");
      setNote({ tone: "ok", text: t(`حُفظ «${result.template.title}» في نماذج المنشأة، ويظهر أول القائمة لهذا النوع.`, `Saved “${result.template.title}” to the company templates; it now leads the list for this type.`) });
    });

  const remove = (item: SavedLetterTemplate) => {
    if (confirmDelete !== item.id) {
      setConfirmDelete(item.id);
      return;
    }
    setConfirmDelete(null);
    startBusy(async () => {
      const result = await deleteLetterTemplate(item.id);
      if (result.error) {
        setNote({ tone: "error", text: result.error });
        return;
      }
      onTemplatesChange(companyTemplates.filter((other) => other.id !== item.id));
    });
  };

  const chip = (key: LetterStyle | "all" | "company", label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={style === key}
      onClick={() => setStyle(key)}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition",
        style === key ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800">
          {t(`نماذج «${LETTER_KIND[kind].label.ar}» الجاهزة`, `Ready “${LETTER_KIND[kind].label.en}” templates`)}
          <span className="ms-1.5 text-xs font-medium text-slate-500">({templatesFor(kind).length + ownCount})</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("الأسلوب", "Style")}>
          {chip("all", t("الكل", "All"))}
          {ownCount ? chip("company", t("نماذج المنشأة", "Company")) : null}
          {styles.length > 1 ? styles.map((key) => chip(key, pick(LETTER_STYLE[key].label, lang))) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <div key={option.id} className="relative min-w-0">
            <button
              type="button"
              onClick={() => choose(option)}
              aria-pressed={applied?.id === option.id}
              className={cn(
                "flex h-full w-full min-w-0 flex-col gap-1 rounded-xl bg-surface p-3 text-start ring-1 ring-inset transition hover:ring-teal-300",
                applied?.id === option.id ? "ring-2 ring-teal-600" : "ring-slate-200",
                option.company ? "pe-10" : "",
              )}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {applied?.id === option.id ? <Check size={14} className="shrink-0 text-teal-700" /> : option.company ? <Building2 size={14} className="shrink-0 text-teal-700" /> : null}
                <span className="min-w-0 break-words text-sm font-bold text-slate-900">{option.title}</span>
                <ToneBadge tone={option.badge.tone}>{option.badge.label}</ToneBadge>
              </span>
              <span className="min-w-0 break-words text-xs font-semibold text-slate-600">{lang === "en" && option.text.subjectEn ? option.text.subjectEn : option.text.subject}</span>
              <span className="line-clamp-2 min-w-0 break-words text-xs leading-5 text-slate-500">
                {(lang === "en" && option.text.bodyEn ? option.text.bodyEn : option.text.body).replace(/\{reason\??\}/g, "…").replace(/\s+/g, " ")}
              </span>
            </button>
            {option.company ? (
              <button
                type="button"
                onClick={() => remove(option.company!)}
                onBlur={() => setConfirmDelete(null)}
                disabled={busy}
                aria-label={
                  confirmDelete === option.company.id
                    ? t(`تأكيد حذف النموذج ${option.title}`, `Confirm deleting template ${option.title}`)
                    : t(`حذف النموذج ${option.title}`, `Delete template ${option.title}`)
                }
                className={cn(
                  "absolute end-2 top-2 inline-flex items-center gap-1 rounded-lg p-1.5 text-xs font-bold transition",
                  confirmDelete === option.company.id ? "bg-red-600 px-2 text-white" : "text-slate-400 hover:bg-red-50 hover:text-red-600",
                )}
              >
                <Trash2 size={15} />
                {confirmDelete === option.company.id ? t("تأكيد الحذف", "Confirm") : null}
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={manual}
          aria-pressed={applied?.id === "manual"}
          className={cn(
            "flex min-h-20 min-w-0 flex-col items-start justify-center gap-1 rounded-xl border border-dashed bg-surface p-3 text-start transition hover:border-teal-400",
            applied?.id === "manual" ? "border-teal-600" : "border-slate-300",
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <PenLine size={14} className="text-teal-700" />
            {t("كتابة يدوية", "Write by hand")}
          </span>
          <span className="text-xs leading-5 text-slate-500">{t("نص فارغ تكتبه بنفسك، أو اطلب صياغته بالذكاء الاصطناعي.", "A blank text you write yourself, or ask the AI to draft.")}</span>
        </button>
      </div>

      {undo ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
          <span>{t("استُبدل النص الذي كتبته.", "The text you wrote was replaced.")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-bold text-teal-800 underline-offset-4 hover:underline"
            onClick={() => {
              onApply(undo, t("أُعيد النص الذي كتبته.", "Your text is back."));
              setApplied(null);
              setUndo(null);
            }}
          >
            <Undo2 size={14} />
            {t("تراجع", "Undo")}
          </button>
        </p>
      ) : null}

      <details className="group rounded-xl bg-surface p-3 ring-1 ring-inset ring-slate-200">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-teal-800">
          <Save size={14} />
          {t("حفظ النص الحالي كنموذج للمنشأة", "Save the current text as a company template")}
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-52 space-y-1 text-xs text-slate-500">
            <span>{t("اسم النموذج", "Template name")}</span>
            <input className={`${fieldClass} w-full`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder={t("مثال: شكر موظف الشهر", "e.g. Employee of the month")} />
          </label>
          <button type="button" onClick={save} disabled={busy || title.trim().length < 2} className={secondaryBtn}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
            {t("حفظ النموذج", "Save template")}
          </button>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          {t(
            "يُحفظ الموضوع والنص بالعربية والإنجليزية لهذا النوع، ويظهر لكل من يصدر الخطابات في منشأتك. يمكنك ترك فراغات بين [[ ]] تُكمَل عند كل استخدام.",
            "The subject and text in both languages are saved for this type and shown to everyone who issues letters in your company. You can leave blanks in [[ ]] to fill in each time.",
          )}
        </p>
      </details>

      {note ? (
        <p className={cn("rounded-xl px-3 py-2 text-sm ring-1 ring-inset", note.tone === "error" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200")} role="status">
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
