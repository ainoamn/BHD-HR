"use client";

import { Archive, BadgeCheck, CalendarClock, Eye, FileText, LoaderCircle, Mail, MessageCircle, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { pick } from "@/lib/i18n";
import { blanksIn } from "@/lib/letter-library";
import { isLetterKind, LETTER_KIND, LETTER_KINDS, LETTER_TEMPLATES, nextWarningKind, WRITTEN_GROUPS, WRITTEN_KINDS, type LetterKind } from "@/lib/letters";
import type { DraftContent } from "@/lib/letter-drafts";
import { formatCauseReason, type WarningCause } from "@/lib/oman-labour";
import { cn } from "@/lib/utils";
import { draftLetter, type SavedLetterTemplate } from "@/server/letter-actions";
import { EmployeeMultiSelect } from "./employee-multi-select";
import { useLang } from "./lang-provider";
import { LetterTemplates } from "./letter-templates";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass, secondaryBtn } from "./ui";
import { WarningCausePicker } from "./warning-cause-picker";

export type LetterEmployee = { value: string; label: string; hint?: string | null; hasEmail: boolean; hasPhone: boolean; warnings: number };

export function LetterForm({
  action,
  employees,
  defaultEmployeeIds,
  defaultKind,
  today,
  signatoryName,
  signatoryTitle,
  channels,
  allowSalary,
  request,
  savedDraft,
  tomorrow,
  companyTemplates,
  warningCauses = [],
  initialClauseCode = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  employees: LetterEmployee[];
  defaultEmployeeIds: string[];
  defaultKind: LetterKind;
  today: string;
  signatoryName: string;
  signatoryTitle: string;
  channels: { EMAIL: boolean; WHATSAPP: boolean };
  allowSalary: boolean;
  /** Writing the letter an employee asked for from the portal; issuing it approves the request. */
  request?: { id: string; subject: string; details: string; addressee: string } | null;
  /** Editing a saved draft: its fields, and the day it is scheduled for ("" = not scheduled). */
  savedDraft?: { id: string; content: DraftContent; scheduleDate: string } | null;
  /** Earliest day a letter can be scheduled for (YYYY-MM-DD). */
  tomorrow: string;
  /** The company's own wordings (LetterTemplate), all kinds. */
  companyTemplates: SavedLetterTemplate[];
  /** Ready disciplinary causes (Oman MD 618/2024 + company). */
  warningCauses?: WarningCause[];
  /** Prefill from /letters/new?clause=OMAN-618-08 */
  initialClauseCode?: string;
}) {
  const { lang, t } = useLang();
  const saved = savedDraft?.content;
  const [selected, setSelected] = useState<string[]>(defaultEmployeeIds);
  const [kind, setKind] = useState<LetterKind>(defaultKind);
  const [reason, setReason] = useState(request?.details || "");
  const [subject, setSubject] = useState(saved ? saved.subject : request?.subject || LETTER_TEMPLATES[defaultKind].subject);
  const [subjectEn, setSubjectEn] = useState(saved ? saved.subjectEn : LETTER_TEMPLATES[defaultKind].subjectEn);
  const auto = Boolean(LETTER_KIND[kind].auto);
  const autoKinds = LETTER_KINDS.filter((option) => LETTER_KIND[option].auto);
  const [body, setBody] = useState(saved?.body || "");
  const [bodyEn, setBodyEn] = useState(saved?.bodyEn || "");
  const [scheduleDate, setScheduleDate] = useState(savedDraft?.scheduleDate || "");
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();
  const [ownTemplates, setOwnTemplates] = useState(companyTemplates);
  const [clauseCode, setClauseCode] = useState(saved?.clauseCode || "");
  const [occurrence, setOccurrence] = useState<1 | 2 | 3 | 4>(1);
  const blanks = auto ? [] : blanksIn(subject, subjectEn, body, bodyEn);
  const showCauses = !auto && (LETTER_KIND[kind].group === "discipline" || LETTER_KIND[kind].warning);

  const chosen = employees.filter((employee) => selected.includes(employee.value));
  const single = chosen.length === 1 ? chosen[0] : null;
  const suggested = single ? nextWarningKind(single.warnings) : null;
  const withEmail = chosen.filter((employee) => employee.hasEmail).length;
  const withPhone = chosen.filter((employee) => employee.hasPhone).length;

  const chooseKind = (next: LetterKind) => {
    const before = LETTER_TEMPLATES[kind];
    setKind(next);
    if (!subject || subject === before.subject) setSubject(LETTER_TEMPLATES[next].subject);
    if (!subjectEn || subjectEn === before.subjectEn) setSubjectEn(LETTER_TEMPLATES[next].subjectEn);
  };

  const applyCause = (cause: WarningCause | null, reasonAr: string) => {
    setClauseCode(cause?.code || "");
    if (!cause) return;
    setReason(reasonAr);
    const nextKind = LETTER_KIND[cause.defaultKind] ? cause.defaultKind : kind;
    const tpl = LETTER_TEMPLATES[nextKind];
    const fill = (text: string) => text.replaceAll("{reason}", reasonAr);
    setKind(nextKind);
    setSubject(fill(tpl.subject));
    setSubjectEn(fill(tpl.subjectEn));
    setBody(fill(tpl.body));
    setBodyEn(fill(tpl.bodyEn));
    setNote({ tone: "ok", text: t("أُدرج المسبب في نص الإنذار. راجعه قبل الإصدار.", "The cause was placed in the warning text. Review it before issuing.") });
  };

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !initialClauseCode || !warningCauses.length) return;
    const cause = warningCauses.find((item) => item.code === initialClauseCode);
    if (!cause) return;
    prefilled.current = true;
    applyCause(cause, formatCauseReason(cause, 1).ar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill from ?clause=
  }, [initialClauseCode, warningCauses]);

  const draft = () =>
    startDraft(async () => {
      setNote(null);
      const result = await draftLetter({ kind, reason, employeeId: single?.value });
      if (result.error) {
        setNote({ tone: "error", text: result.error });
        return;
      }
      if (result.subject) setSubject(result.subject);
      if (result.subjectEn) setSubjectEn(result.subjectEn);
      if (result.body) setBody(result.body);
      if (result.bodyEn) setBodyEn(result.bodyEn);
      setNote({ tone: "ok", text: t("صاغ الذكاء الاصطناعي الخطاب بالعربية والإنجليزية. راجعه قبل الإصدار.", "The AI drafted the letter in Arabic and English. Review it before issuing.") });
    });

  const channelHint = (ready: boolean, count: number, label: string) =>
    chosen.length
      ? `${t(`${count} من ${chosen.length} لديهم ${label}`, `${count} of ${chosen.length} have ${label === "بريد" ? "an email" : "a phone"}`)} · ${
          ready ? t("القناة مفعّلة: تُرسل فوراً", "Channel active: sent now") : t("القناة غير مفعّلة بعد: تُحفظ النسخة وتُرسل عند التفعيل", "Channel not active yet: the copy is queued until it is")
        }`
      : ready
        ? t("القناة مفعّلة", "Channel active")
        : t("القناة غير مفعّلة بعد: تُحفظ النسخ وتُرسل عند التفعيل", "Channel not active yet: copies are queued until it is");

  return (
    <form action={action} className="space-y-6">
      {request ? <input type="hidden" name="requestId" value={request.id} /> : null}
      {savedDraft ? <input type="hidden" name="draftId" value={savedDraft.id} /> : null}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800">{t("١. الموظف ونوع الخطاب", "1. Employee and letter type")}</h2>
        <div className="min-w-0 space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">{t("إلى الموظف / الموظفين *", "To employee(s) *")}</span>
          <EmployeeMultiSelect name="employeeIds" options={employees} defaultValues={defaultEmployeeIds} onChange={setSelected} />
          <span className="block text-xs leading-5 text-slate-500">{t("عند اختيار أكثر من موظف يُصدر لكل منهم خطاب مستقل برقم خاص.", "With several employees, each one gets a separate letter with its own number.")}</span>
        </div>
        <input type="hidden" name="kind" value={kind} />
        <div className="space-y-3 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-inset ring-slate-200">
          <p className="text-xs font-semibold text-slate-500">{t("اختر نوع الخطاب من القسم المناسب", "Choose the letter type from the matching section")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ...WRITTEN_GROUPS.map((group) => ({
                  key: group.key,
                  heading: pick(group.label, lang),
                  options: WRITTEN_KINDS.filter((option) => LETTER_KIND[option].group === group.key),
                  tone: group.key === "discipline" ? "warning" : "default",
                })),
                {
                  key: "ready",
                  heading: t("شهادات وخطابات جاهزة", "Ready certificates and letters"),
                  options: autoKinds,
                  tone: "ready" as const,
                },
              ] as const
            ).map((section) => {
              const active = section.options.includes(kind);
              const Icon = section.tone === "warning" ? TriangleAlert : section.tone === "ready" ? ScrollText : FileText;
              return (
                <label key={section.key} className={cn("block space-y-1.5 rounded-xl bg-white p-3 ring-1 ring-inset transition", active ? "ring-teal-600 shadow-sm" : "ring-slate-200")}>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <Icon size={14} className={section.tone === "warning" ? "text-orange-500" : "text-teal-700"} />
                    {section.heading}
                  </span>
                  <select
                    className={cn(fieldClass, "w-full", active && "font-semibold text-teal-900")}
                    value={active ? kind : ""}
                    aria-label={section.heading}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (isLetterKind(next)) chooseKind(next);
                    }}
                  >
                    <option value="">{active ? t("— غيّر النوع —", "— Change type —") : t("— اختر من هذه القائمة —", "— Choose from this list —")}</option>
                    {section.options.map((option) => {
                      const meta = LETTER_KIND[option];
                      const locked = Boolean(meta.salary) && !allowSalary;
                      return (
                        <option key={option} value={option} disabled={locked}>
                          {pick(meta.label, lang)}
                          {locked ? t(" (يتطلب صلاحية الرواتب)", " (needs pay permission)") : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
              );
            })}
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-500">{t("المختار الآن:", "Selected:")}</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-teal-900">
              {LETTER_KIND[kind].warning || kind === "NOTICE" ? <TriangleAlert size={15} className="text-orange-500" /> : LETTER_KIND[kind].auto ? <ScrollText size={15} className="text-teal-700" /> : <FileText size={15} className="text-teal-700" />}
              {pick(LETTER_KIND[kind].label, lang)}
            </span>
          </p>
        </div>
        {single && (LETTER_KIND[kind].warning || kind === "NOTICE") ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            <span>
              {single.warnings
                ? t(`لدى ${single.label} ${single.warnings} إنذار خلال آخر 12 شهراً. المقترح: «${LETTER_KIND[suggested!].label.ar}».`, `${single.label} has ${single.warnings} warning(s) in the last 12 months. Suggested: “${LETTER_KIND[suggested!].label.en}”.`)
                : t(`لا توجد إنذارات سابقة لـ ${single.label} خلال 12 شهراً.`, `${single.label} has no warnings in the last 12 months.`)}
            </span>
            {suggested && suggested !== kind ? (
              <button type="button" onClick={() => chooseKind(suggested)} className="font-bold text-amber-900 underline underline-offset-4">
                {t("استخدام المقترح", "Use suggestion")}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("تاريخ الخطاب", "Letter date")}>
            <input className={`${fieldClass} w-full`} type="date" name="issuedAt" defaultValue={saved?.issuedAt || today} required />
          </Field>
        </div>
      </section>

      {auto ? (
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h2 className="text-sm font-bold text-slate-800">{t("٢. المحتوى", "2. Content")}</h2>
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm leading-6 text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <BadgeCheck size={17} className="mt-0.5 shrink-0" />
            <span>
              {kind === "RESIGNATION_ACCEPTANCE"
                ? t(
                    "يُكتب الخطاب بالعربية والإنجليزية، وآخر يوم عمل يؤخذ من «تاريخ انتهاء العقد» في ملف الموظف. لقبول استقالة قدّمها الموظف من بوابته استخدم صفحة الاعتمادات.",
                    "The letter is written in Arabic and English, and the last working day comes from the contract end date in the employee's file. To accept a resignation sent from the portal, use the approvals page.",
                  )
                : t(
                    "يُكتب النص بالعربية والإنجليزية من ملف كل موظف (الاسم، الجنسية، رقم الهوية، الوظيفة، تاريخ الالتحاق، والراتب إن لزم)، ويصدر موقّعاً إلكترونياً مع رمز QR للتحقق.",
                    "The text is written in Arabic and English from each employee's file (name, nationality, ID number, job, joining date, and pay where needed), and issued e-signed with a QR code for verification.",
                  )}
            </span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {LETTER_KIND[kind].document ? (
              <Field
                key={kind}
                label={
                  kind === "SALARY_TRANSFER" || kind === "BANK_ACCOUNT"
                    ? t("اسم البنك (إن لم يُحدد في ملف الموظف)", "Bank name (if not in the employee's file)")
                    : kind === "EMBASSY"
                      ? t("السفارة", "Embassy")
                      : t("الجهة المقدَّمة إليها", "Addressed to")
                }
                hint={
                  kind === "BANK_ACCOUNT"
                    ? t("يُطبع في الخطاب عنوان الموظف من ملفه وعنوان المنشأة وسجلها التجاري.", "The employee's address from their file and the company's address and CR number are printed.")
                    : kind === "SALARY_TRANSFER"
                      ? undefined
                      : kind === "EMBASSY"
                        ? t("مثال: سفارة المملكة المتحدة في مسقط", "e.g. British Embassy, Muscat")
                        : t("اتركه فارغاً لـ «إلى من يهمه الأمر».", "Leave empty for “To whom it may concern”.")
                }
              >
                <input className={`${fieldClass} w-full`} name="addressee" defaultValue={saved?.addressee || request?.addressee || ""} maxLength={160} />
              </Field>
            ) : null}
            {kind === "NOC" || kind === "EMBASSY" ? (
              <Field
                key={`${kind}-purpose`}
                label={kind === "EMBASSY" ? t("وجهة السفر وتواريخه والغرض *", "Destination, dates and purpose *") : t("الغرض من عدم الممانعة *", "No objection to *")}
                hint={
                  kind === "EMBASSY"
                    ? t("مثل: سياحة في المملكة المتحدة من 1 إلى 15 ديسمبر 2026.", "e.g. tourism in the UK from 1 to 15 December 2026.")
                    : t("مثل: السفر خارج السلطنة، أو استخراج رخصة قيادة.", "e.g. travelling abroad, or getting a driving licence.")
                }
              >
                <input className={`${fieldClass} w-full`} name="purpose" defaultValue={saved?.purpose || request?.details || ""} maxLength={400} required />
              </Field>
            ) : null}
            {kind === "CLEARANCE" ? (
              <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600 ring-1 ring-inset ring-slate-200 sm:col-span-2">
                {t(
                  "لا تصدر الشهادة إذا بقيت لدى الموظف عهدة مسجّلة في «العُهد والأصول»؛ سجّل استلامها أولاً. لمن انتهت خدمته تُذكر فترة عمله حتى تاريخ انتهاء العقد.",
                  "The certificate won't issue while the employee still holds an asset recorded in “Assets & custody”; record its return first. For former staff, the period of service up to the contract end is stated.",
                )}
              </p>
            ) : null}
            {kind === "EXPERIENCE_CERTIFICATE" ? (
              <Field label={t("تاريخ انتهاء العمل (اختياري)", "End of service (optional)")} hint={t("اتركه فارغاً إن كان الموظف لا يزال على رأس عمله.", "Leave empty if the employee still works here.")}>
                <input className={`${fieldClass} w-full`} type="date" name="endDate" defaultValue={saved?.endDate || ""} />
              </Field>
            ) : null}
          </div>
        </section>
      ) : (
      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-bold text-slate-800">{t("٢. المحتوى", "2. Content")}</h2>
        {showCauses && warningCauses.length ? (
          <WarningCausePicker causes={warningCauses} value={clauseCode} occurrence={occurrence} onSelect={applyCause} onOccurrence={setOccurrence} />
        ) : null}
        <Field
          label={t("السبب أو التفاصيل", "Reason or details")}
          hint={t(
            "اختر مسبباً جاهزاً أعلاه أو اكتب باختصار ما حدث، ثم اختر نموذجاً جاهزاً فيُدرج فيه، أو اطلب الصياغة الذكية، أو اكتب النص بنفسك.",
            "Pick a ready cause above or briefly describe what happened, then pick a ready template, ask the AI to draft it, or write the text yourself.",
          )}
        >
          <textarea className={`${fieldClass} min-h-20 w-full`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1500} />
        </Field>
        <LetterTemplates
          kind={kind}
          reason={reason}
          current={{ subject, subjectEn, body, bodyEn }}
          companyTemplates={ownTemplates}
          onTemplatesChange={setOwnTemplates}
          onApply={(text, message) => {
            setSubject(text.subject);
            setSubjectEn(text.subjectEn);
            setBody(text.body);
            setBodyEn(text.bodyEn);
            setNote({ tone: "ok", text: message });
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={draft} disabled={drafting} className={secondaryBtn}>
            {drafting ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} className="text-gold-600" />}
            {drafting ? t("جارٍ الصياغة...", "Drafting...") : t("صياغة بالذكاء الاصطناعي", "Draft with AI")}
          </button>
        </div>
        {note ? (
          <p className={cn("rounded-xl px-3 py-2 text-sm ring-1 ring-inset", note.tone === "error" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200")} role="status">
            {note.text}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label={t("الموضوع (عربي) *", "Subject (Arabic) *")}>
              <input className={`${fieldClass} w-full`} name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={200} dir="rtl" />
            </Field>
            <Field label={t("نص الخطاب (عربي) *", "Letter text (Arabic) *")}>
              <textarea className={`${fieldClass} min-h-56 w-full leading-7`} name="body" value={body} onChange={(event) => setBody(event.target.value)} required minLength={5} maxLength={8000} dir="rtl" />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label={t("الموضوع (إنجليزي)", "Subject (English)")}>
              <input className={`${fieldClass} w-full`} name="subjectEn" value={subjectEn} onChange={(event) => setSubjectEn(event.target.value)} maxLength={200} dir="ltr" />
            </Field>
            <Field label={t("نص الخطاب (إنجليزي، اختياري)", "Letter text (English, optional)")}>
              <textarea className={`${fieldClass} min-h-56 w-full leading-7`} name="bodyEn" value={bodyEn} onChange={(event) => setBodyEn(event.target.value)} maxLength={8000} dir="ltr" />
            </Field>
          </div>
        </div>
        {blanks.length ? (
          <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200" role="status">
            <p className="font-semibold">
              {t(`بقي ${blanks.length} فراغ معلّم بين [[ ]] — أكمله بالمعلومة الصحيحة أو احذفه، فلا يصدر الخطاب ولا يُجدول قبل ذلك (المعاينة والحفظ في المسودات متاحان):`, `${blanks.length} blank(s) marked [[ ]] left — replace each with the right detail or remove it; the letter can't be issued or scheduled until then (preview and drafts still work):`)}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {blanks.map((blank) => (
                <span key={blank} className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-amber-200">
                  {blank}
                </span>
              ))}
            </p>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">{t("الترويسة واسم الموظف والتاريخ والرقم والتوقيع تُطبع تلقائياً، فلا تكتبها في النص.", "The letterhead, employee name, date, number and signature are printed automatically; don't type them in the text.")}</p>
      </section>
      )}

      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-bold text-slate-800">{t("٣. التوقيع والإرسال", "3. Signature and delivery")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("اسم الموقّع", "Signed by")}>
            <input className={`${fieldClass} w-full`} name="signatoryName" defaultValue={saved?.signatoryName || signatoryName} maxLength={120} />
          </Field>
          <Field label={t("صفته", "Title")}>
            <input className={`${fieldClass} w-full`} name="signatoryTitle" defaultValue={saved?.signatoryTitle || signatoryTitle} maxLength={120} />
          </Field>
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
          <BadgeCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
          {t(
            "يصدر الخطاب موقّعاً إلكترونياً باسمك مع رمز QR وبصمة رقمية؛ من يمسح الرمز يرى أنه أصلي ويحمّل نسخته. صورة التوقيع والختم تُضاف من الإعدادات.",
            "The letter is issued e-signed in your name with a QR code and digital fingerprint; whoever scans it sees it is authentic and can download it. Signature and stamp images are set in Settings.",
          )}
        </p>
        {request ? (
          <Field label={t("ملاحظة للموظف (اختياري)", "Note to the employee (optional)")}>
            <input className={`${fieldClass} w-full`} name="decisionNote" maxLength={500} />
          </Field>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["EMAIL", Mail, t("إرسال نسخة بالبريد الإلكتروني", "Send a copy by email"), channelHint(channels.EMAIL, withEmail, "بريد")],
              ["WHATSAPP", MessageCircle, t("إرسال نسخة عبر واتساب", "Send a copy on WhatsApp"), channelHint(channels.WHATSAPP, withPhone, "هاتف")],
            ] as const
          ).map(([channel, Icon, label, hint]) => (
            <label key={channel} className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 has-[:checked]:bg-teal-50/60 has-[:checked]:ring-teal-300">
              <input type="checkbox" name={`send${channel}`} value="1" defaultChecked={saved ? saved.channels.includes(channel) : true} className="mt-1 accent-teal-700" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Icon size={16} className={channel === "WHATSAPP" ? "text-emerald-600" : "text-navy-500"} />
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {t(
            "تصل النسخة برابط خاص يفتح الخطاب ويتيح للموظف تأكيد الاستلام. يمكنك أيضاً مشاركته يدوياً من صفحة الخطاب بعد الإصدار.",
            "The copy carries a private link that opens the letter and lets the employee confirm receipt. You can also share it manually from the letter page after issuing.",
          )}
        </p>
      </section>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="issue" disabled={blanks.length > 0} pendingLabel={t("جارٍ العمل...", "Working...")}>
            <BadgeCheck size={16} />
            {request ? t("اعتماد الطلب وإصدار الخطاب", "Approve the request and issue") : t("إصدار الخطاب موقّعاً الآن", "Issue signed now")}
          </SubmitButton>
          {request ? null : (
            <>
              <SubmitButton variant="secondary" name="intent" value="preview" formNoValidate pendingLabel={t("جارٍ العمل...", "Working...")}>
                <Eye size={16} />
                {t("معاينة قبل الإصدار", "Preview before issuing")}
              </SubmitButton>
              <SubmitButton variant="secondary" name="intent" value="draft" formNoValidate pendingLabel={t("جارٍ العمل...", "Working...")}>
                <Archive size={16} />
                {t("حفظ في المسودات", "Save to drafts")}
              </SubmitButton>
            </>
          )}
        </div>
        {request ? null : (
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
            <div className="min-w-0 flex-1 basis-56">
              <Field
                label={t("أو جدولة الإصدار في يوم", "Or schedule it for a day")}
                hint={t(
                  "يصدر الخطاب موقّعاً مؤرَّخاً بذلك اليوم صباحاً تلقائياً، ويُرسل للموظف إن اخترت الإرسال. يبقى حتى ذلك في «المسودات والمجدولة» وتستطيع تعديله أو إلغاء جدولته.",
                  "The letter is issued signed and dated that day, automatically in the morning, and sent to the employee if chosen above. Until then it waits in “Drafts & scheduled”, where you can edit or unschedule it.",
                )}
              >
                <input className={`${fieldClass} w-full`} type="date" name="scheduleDate" min={tomorrow} value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
              </Field>
            </div>
            <SubmitButton variant="secondary" name="intent" value="schedule" disabled={!scheduleDate || blanks.length > 0} pendingLabel={t("جارٍ العمل...", "Working...")}>
              <CalendarClock size={16} />
              {t("جدولة الإصدار", "Schedule")}
            </SubmitButton>
          </div>
        )}
      </div>
    </form>
  );
}
