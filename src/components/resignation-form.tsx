"use client";

import { DoorOpen, PenLine, Undo2 } from "lucide-react";
import { useState } from "react";
import { pick } from "@/lib/i18n";
import { RESIGNATION_STYLE, RESIGNATION_STYLES, RESIGNATION_TEXT_MAX, RESIGNATION_TEXT_MIN, resignationText, type ResignationContext, type ResignationStyle } from "@/lib/resignation";
import { cn, formatDate, parseDateInput } from "@/lib/utils";
import { submitEmployeeRequest } from "@/server/employee-request-actions";
import { SignaturePad } from "./signature-pad";
import { SubmitButton } from "./submit-button";
import { fieldClass } from "./ui";

/**
 * Portal: write and e-sign a resignation. The employee picks a ready wording (or writes their own), sets the last day,
 * types their full name and draws their signature; the server files it numbered and fingerprinted (src/lib/resignation-seal.ts).
 */
export function ResignationForm({
  token,
  lang,
  context,
  defaultLastDay,
  minDay,
  noticeDays,
}: {
  token: string;
  lang: "ar" | "en";
  context: Omit<ResignationContext, "lastDay">;
  defaultLastDay: string;
  minDay: string;
  noticeDays: number;
}) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const dayText = (value: string) => {
    const day = parseDateInput(value);
    return day ? formatDate(day) : "[[آخر يوم عمل]]";
  };
  const [lastDay, setLastDay] = useState(defaultLastDay);
  const [style, setStyle] = useState<ResignationStyle>("formal");
  const [text, setText] = useState(() => resignationText("formal", { ...context, lastDay: dayText(defaultLastDay) }));
  const [edited, setEdited] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [undo, setUndo] = useState<{ style: ResignationStyle; text: string } | null>(null);

  const chooseStyle = (next: ResignationStyle) => {
    setUndo(edited ? { style, text: text.ar } : null);
    setStyle(next);
    setText(resignationText(next, { ...context, lastDay: dayText(lastDay) }));
    setEdited(false);
  };

  const changeDay = (value: string) => {
    setLastDay(value);
    if (!edited) setText(resignationText(style, { ...context, lastDay: dayText(value) }));
  };

  const textEn = edited ? "" : text.en;
  const ready = text.ar.trim().length >= RESIGNATION_TEXT_MIN && signedName.trim().length >= 3 && Boolean(signature) && confirmed && Boolean(parseDateInput(lastDay));

  return (
    <form action={submitEmployeeRequest} className="mt-3 grid gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value="RESIGNATION" />
      <input type="hidden" name="signedTextEn" value={textEn} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t("آخر يوم عمل مقترح", "Proposed last working day")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="lastDay" required min={minDay} value={lastDay} onChange={(event) => changeDay(event.target.value)} />
        </label>
        <p className="self-end text-xs leading-5 text-slate-500">
          {t(`فترة الإشعار المعتادة ${noticeDays} يوماً وفق قانون العمل، وتحدد الإدارة آخر يوم عند القبول.`, `The usual notice is ${noticeDays} days under the Labour Law; management sets the last day when accepting.`)}
        </p>
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">{t("صيغة الاستقالة", "Wording")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {RESIGNATION_STYLES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={style === key}
              onClick={() => chooseStyle(key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
                style === key ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {key === "custom" ? <PenLine size={13} /> : null}
              {pick(RESIGNATION_STYLE[key], lang)}
            </button>
          ))}
        </div>
        {undo ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("استُبدل النص الذي عدّلته.", "The text you edited was replaced.")}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-bold text-teal-800 underline-offset-4 hover:underline"
              onClick={() => {
                setStyle(undo.style);
                setText({ ar: undo.text, en: "" });
                setEdited(true);
                setUndo(null);
              }}
            >
              <Undo2 size={13} />
              {t("تراجع", "Undo")}
            </button>
          </p>
        ) : null}
      </fieldset>

      <label className="block min-w-0 space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{t("نص الاستقالة (يمكنك تعديله)", "Resignation text (you can edit it)")}</span>
        <textarea
          className={`${fieldClass} min-h-56 w-full leading-7`}
          name="signedText"
          dir="rtl"
          required
          minLength={RESIGNATION_TEXT_MIN}
          maxLength={RESIGNATION_TEXT_MAX}
          value={text.ar}
          onChange={(event) => {
            setText({ ar: event.target.value, en: text.en });
            setEdited(true);
          }}
        />
        <span className="block text-xs leading-5 text-slate-500">
          {edited
            ? t("عدّلت النص، فتُرفع الاستقالة بالعربية فقط بنصك كما كتبته.", "You edited the text, so the resignation is filed in Arabic only, exactly as you wrote it.")
            : text.en
              ? t("تُرفق ترجمتها الإنجليزية تلقائياً ما دمت لم تعدّل النص.", "Its English version is attached automatically as long as you don't edit the text.")
              : t("أكمل النص بأسبابك بأسلوبك.", "Complete the text with your reasons in your own words.")}
          {" "}
          {t("الترويسة وتاريخ التقديم والتحية والختام تُطبع تلقائياً.", "The letterhead, date, greeting and closing are printed automatically.")}
        </span>
      </label>

      <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:p-4">
        <p className="text-sm font-bold text-slate-800">{t("التوقيع الإلكتروني", "Electronic signature")}</p>
        <label className="block min-w-0 space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t("اكتب اسمك الكامل", "Type your full name")}</span>
          <input className={`${fieldClass} w-full`} name="signedName" required maxLength={120} autoComplete="name" placeholder={context.name} value={signedName} onChange={(event) => setSignedName(event.target.value)} />
        </label>
        <SignaturePad
          name="signature"
          onChange={setSignature}
          label={t("وقّع هنا بإصبعك أو بالفأرة", "Sign here with your finger or mouse")}
          clearLabel={t("مسح التوقيع", "Clear")}
          placeholder={t("ارسم توقيعك داخل المربع", "Draw your signature in the box")}
        />
        <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <input type="checkbox" name="confirm" value="1" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-amber-700" />
          <span>
            {t(
              "أقدّم استقالتي برغبتي، وأقرّ بأن اسمي وتوقيعي أعلاه توقيع إلكتروني مني على هذا النص. أعلم أنها تُرفع إلى الإدارة للاعتماد، وأستطيع سحبها ما دامت بانتظار القرار.",
              "I am resigning of my own will and confirm that my name and signature above are my electronic signature on this text. I understand it goes to management for approval and that I can withdraw it while it awaits a decision.",
            )}
          </span>
        </label>
        <p className="text-xs leading-5 text-slate-500">
          {t(
            "يُحفظ مع الاستقالة اسمك وتوقيعك ووقت التوقيع وبصمة رقمية للنص، فيظهر أي تعديل لاحق عليها. تصلك نسخة موقّعة تفتحها وتطبعها من «طلباتي».",
            "Your name, signature, the time of signing and a digital fingerprint of the text are kept with the resignation, so any later change shows. You get a signed copy to open and print under “My requests”.",
          )}
        </p>
      </div>

      <div>
        <SubmitButton
          variant="danger"
          className="w-full sm:w-auto"
          disabled={!ready}
          confirm={t("توقيع الاستقالة وإرسالها إلى الإدارة؟", "Sign and send your resignation to management?")}
          pendingLabel={t("جارٍ الإرسال...", "Sending...")}
        >
          <DoorOpen size={16} />
          {t("توقيع الاستقالة وإرسالها", "Sign and send resignation")}
        </SubmitButton>
        {!ready ? (
          <p className="mt-1.5 text-xs text-slate-500">{t("يتفعّل الزر بعد كتابة اسمك والتوقيع في المربع والإقرار.", "The button turns on once you type your name, sign in the box and tick the declaration.")}</p>
        ) : null}
      </div>
    </form>
  );
}
