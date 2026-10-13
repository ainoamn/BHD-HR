"use client";

import { BadgeCheck, FileText, LoaderCircle, Mail, MessageCircle, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { pick } from "@/lib/i18n";
import { fillTemplate, LETTER_KIND, LETTER_KINDS, LETTER_TEMPLATES, nextWarningKind, WRITTEN_KINDS, type LetterKind } from "@/lib/letters";
import { cn } from "@/lib/utils";
import { draftLetter } from "@/server/letter-actions";
import { EmployeeMultiSelect } from "./employee-multi-select";
import { useLang } from "./lang-provider";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass, secondaryBtn } from "./ui";

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
}) {
  const { lang, t } = useLang();
  const [selected, setSelected] = useState<string[]>(defaultEmployeeIds);
  const [kind, setKind] = useState<LetterKind>(defaultKind);
  const [reason, setReason] = useState(request?.details || "");
  const [subject, setSubject] = useState(request?.subject || LETTER_TEMPLATES[defaultKind].subject);
  const [subjectEn, setSubjectEn] = useState(LETTER_TEMPLATES[defaultKind].subjectEn);
  const auto = Boolean(LETTER_KIND[kind].auto);
  const autoKinds = LETTER_KINDS.filter((option) => LETTER_KIND[option].auto);
  const [body, setBody] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();

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

  const useTemplate = () => {
    const template = LETTER_TEMPLATES[kind];
    setSubject(template.subject || subject);
    setSubjectEn(template.subjectEn || subjectEn);
    setBody(fillTemplate(template.body, reason));
    setBodyEn(fillTemplate(template.bodyEn, reason));
    setNote({ tone: "ok", text: t("تمت تعبئة النص من القالب. راجعه وعدّله قبل الإصدار.", "Filled from the template. Review and edit before issuing.") });
  };

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
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800">{t("١. الموظف ونوع الخطاب", "1. Employee and letter type")}</h2>
        <div className="min-w-0 space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">{t("إلى الموظف / الموظفين *", "To employee(s) *")}</span>
          <EmployeeMultiSelect name="employeeIds" options={employees} defaultValues={defaultEmployeeIds} onChange={setSelected} />
          <span className="block text-xs leading-5 text-slate-500">{t("عند اختيار أكثر من موظف يُصدر لكل منهم خطاب مستقل برقم خاص.", "With several employees, each one gets a separate letter with its own number.")}</span>
        </div>
        <input type="hidden" name="kind" value={kind} />
        {(
          [
            [t("إنذارات وجزاءات وتحقيق", "Warnings, penalties and hearings"), WRITTEN_KINDS.filter((option) => LETTER_KIND[option].group === "discipline")],
            [t("قرارات وإشعارات الموارد البشرية", "HR decisions and notices"), WRITTEN_KINDS.filter((option) => LETTER_KIND[option].group === "hr")],
            [t("شهادات وخطابات جاهزة (تُكتب تلقائياً من ملف الموظف)", "Ready certificates and letters (written from the employee's file)"), autoKinds],
          ] as const
        ).map(([heading, options]) => (
          <div key={heading} className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">{heading}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((option) => {
                const meta = LETTER_KIND[option];
                const locked = Boolean(meta.salary) && !allowSalary;
                const Icon = meta.warning || option === "NOTICE" ? TriangleAlert : meta.auto ? ScrollText : FileText;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={kind === option}
                    disabled={locked}
                    title={locked ? t("يحتاج صلاحية عرض الرواتب", "Needs the view-salaries permission") : undefined}
                    onClick={() => chooseKind(option)}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50",
                      kind === option ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <Icon size={16} className={cn("shrink-0", kind === option ? "text-white" : meta.warning || option === "NOTICE" ? "text-orange-500" : "text-teal-700")} />
                    {pick(meta.label, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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
            <input className={`${fieldClass} w-full`} type="date" name="issuedAt" defaultValue={today} required />
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
                <input className={`${fieldClass} w-full`} name="addressee" defaultValue={request?.addressee || ""} maxLength={160} />
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
                <input className={`${fieldClass} w-full`} name="purpose" defaultValue={request?.details || ""} maxLength={400} required />
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
                <input className={`${fieldClass} w-full`} type="date" name="endDate" />
              </Field>
            ) : null}
          </div>
        </section>
      ) : (
      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-bold text-slate-800">{t("٢. المحتوى", "2. Content")}</h2>
        <Field
          label={t("السبب أو التفاصيل", "Reason or details")}
          hint={t("اكتب باختصار ما حدث (مثل: تأخر عن الدوام 3 مرات في أكتوبر)، ثم اطلب الصياغة الذكية أو استخدم القالب.", "Briefly describe what happened (e.g. late three times in October), then ask the AI to draft it or use the template.")}
        >
          <textarea className={`${fieldClass} min-h-20 w-full`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1500} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={draft} disabled={drafting} className={secondaryBtn}>
            {drafting ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} className="text-gold-600" />}
            {drafting ? t("جارٍ الصياغة...", "Drafting...") : t("صياغة بالذكاء الاصطناعي", "Draft with AI")}
          </button>
          <button type="button" onClick={useTemplate} className={secondaryBtn}>
            <FileText size={16} />
            {t("استخدام القالب الجاهز", "Use the template")}
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
        <p className="text-xs text-slate-500">{t("الترويسة واسم الموظف والتاريخ والرقم والتوقيع تُطبع تلقائياً، فلا تكتبها في النص.", "The letterhead, employee name, date, number and signature are printed automatically; don't type them in the text.")}</p>
      </section>
      )}

      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-bold text-slate-800">{t("٣. التوقيع والإرسال", "3. Signature and delivery")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("اسم الموقّع", "Signed by")}>
            <input className={`${fieldClass} w-full`} name="signatoryName" defaultValue={signatoryName} maxLength={120} />
          </Field>
          <Field label={t("صفته", "Title")}>
            <input className={`${fieldClass} w-full`} name="signatoryTitle" defaultValue={signatoryTitle} maxLength={120} />
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
              <input type="checkbox" name={`send${channel}`} value="1" defaultChecked className="mt-1 accent-teal-700" />
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

      <div className="border-t border-slate-100 pt-4">
        <SubmitButton pendingLabel={t("جارٍ الإصدار...", "Issuing...")}>
          {request ? t("اعتماد الطلب وإصدار الخطاب", "Approve the request and issue") : t("إصدار الخطاب موقّعاً", "Issue signed letter")}
        </SubmitButton>
      </div>
    </form>
  );
}
