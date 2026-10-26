"use client";

import Link from "next/link";
import { Archive, BadgeCheck, CalendarClock, CircleAlert, Eye, FileText, LoaderCircle, Mail, MessageCircle, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { pick } from "@/lib/i18n";
import { blanksIn } from "@/lib/letter-library";
import { isLetterKind, LETTER_GROUP, LETTER_KIND, LETTER_KINDS, LETTER_TEMPLATES, nextWarningKind, WRITTEN_GROUPS, WRITTEN_KINDS, type LetterGroup, type LetterKind } from "@/lib/letters";
import type { DraftContent } from "@/lib/letter-drafts";
import { formatCauseReason, type WarningCause } from "@/lib/oman-labour";
import { cn, parseDateInput } from "@/lib/utils";
import { draftLetter, lookupClauseHistory, previewComposedLetter, type ClauseHistoryItem, type SavedLetterTemplate } from "@/server/letter-actions";
import type { DocHeader } from "./salary-docs";
import { EmployeeMultiSelect } from "./employee-multi-select";
import { useLang } from "./lang-provider";
import { LetterLivePreview } from "./letter-live-preview";
import { LetterTemplates } from "./letter-templates";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass, secondaryBtn } from "./ui";
import { WarningCausePicker } from "./warning-cause-picker";

export type LetterEmployee = {
  value: string;
  label: string;
  hint?: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  warnings: number;
  fullName?: string;
  nameEn?: string | null;
  employeeNumber?: string;
  jobTitle?: string | null;
  jobTitleEn?: string | null;
  idNumber?: string | null;
  gender?: string | null;
};

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
  previewHeader,
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
  /** Company / sponsor letterhead for the live document preview. */
  previewHeader: DocHeader;
}) {
  const { lang, t } = useLang();
  const saved = savedDraft?.content;
  const [selected, setSelected] = useState<string[]>(defaultEmployeeIds);
  const [kind, setKind] = useState<LetterKind>(defaultKind);
  const [category, setCategory] = useState<LetterGroup>(LETTER_KIND[defaultKind].group);
  const [reason, setReason] = useState(request?.details || "");
  const fillTpl = (text: string, detail: string) => text.replaceAll("{reason}", detail.trim() || "…………");
  const initialTpl = LETTER_TEMPLATES[defaultKind];
  const [subject, setSubject] = useState(saved ? saved.subject : request?.subject || fillTpl(initialTpl.subject, request?.details || ""));
  const [subjectEn, setSubjectEn] = useState(saved ? saved.subjectEn : fillTpl(initialTpl.subjectEn, request?.details || ""));
  const auto = Boolean(LETTER_KIND[kind].auto);
  const kindSections = useMemo(() => {
    const ready = LETTER_KINDS.filter((option) => LETTER_KIND[option].auto);
    return [
      ...WRITTEN_GROUPS.map((group) => ({
        key: group.key as LetterGroup,
        heading: `${LETTER_GROUP[group.key].code} — ${pick(group.label, lang)}`,
        hint:
          group.key === "discipline"
            ? t("إنذار، لفت نظر، تحقيق، خصم… الرقم: WRN-السنة-####", "Warning, notice, hearing… number: WRN-year-####")
            : group.key === "recognition"
              ? t("شكر، تهنئة، ترحيب… الرقم: APR-السنة-####", "Thanks, congratulations… number: APR-year-####")
              : group.key === "career"
                ? t("ترقية، راتب، عقد… الرقم: CAR-السنة-####", "Promotion, pay, contract… number: CAR-year-####")
                : t("إجازة، تعميم، تذكير… الرقم: NTC-السنة-####", "Leave, circular, reminder… number: NTC-year-####"),
        options: WRITTEN_KINDS.filter((option) => LETTER_KIND[option].group === group.key),
      })),
      {
        key: "ready" as LetterGroup,
        heading: `${LETTER_GROUP.ready.code} — ${pick(LETTER_GROUP.ready.label, lang)}`,
        hint: t("شهادة راتب، خبرة، عدم ممانعة… الرقم: CRT-السنة-####", "Salary, experience, NOC… number: CRT-year-####"),
        options: ready,
      },
    ];
  }, [lang, t]);
  const categoryOptions = kindSections.find((section) => section.key === category)?.options ?? [];
  const [body, setBody] = useState(saved?.body || (LETTER_KIND[defaultKind].auto ? "" : fillTpl(initialTpl.body, request?.details || "")));
  const [bodyEn, setBodyEn] = useState(saved?.bodyEn || (LETTER_KIND[defaultKind].auto ? "" : fillTpl(initialTpl.bodyEn, request?.details || "")));
  const [scheduleDate, setScheduleDate] = useState(savedDraft?.scheduleDate || "");
  const [issuedAt, setIssuedAt] = useState(saved?.issuedAt || today);
  const [addressee, setAddressee] = useState(saved?.addressee || request?.addressee || "");
  const [purpose, setPurpose] = useState(saved?.purpose || "");
  const [endDate, setEndDate] = useState(saved?.endDate || "");
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [ownTemplates, setOwnTemplates] = useState(companyTemplates);
  const [clauseCode, setClauseCode] = useState(saved?.clauseCode || "");
  const [occurrence, setOccurrence] = useState<1 | 2 | 3 | 4>(1);
  const [clauseHistory, setClauseHistory] = useState<{
    items: ClauseHistoryItem[];
    suggestedOccurrence: 1 | 2 | 3 | 4;
    suggestedKind: LetterKind;
    lookbackDays: number;
  } | null>(null);
  const [autoPreview, setAutoPreview] = useState<{ subject: string; subjectEn: string; body: string; bodyEn: string; addressee: string | null; error: string | null } | null>(null);
  const blanks = auto ? [] : blanksIn(subject, subjectEn, body, bodyEn);
  const showCauses = !auto && (LETTER_KIND[kind].group === "discipline" || LETTER_KIND[kind].warning);
  const kindMismatch = Boolean(clauseHistory?.items.length && clauseHistory.suggestedKind !== kind);

  const chosen = employees.filter((employee) => selected.includes(employee.value));
  const single = chosen.length === 1 ? chosen[0] : null;
  const previewPerson = chosen[0] || null;
  const suggested = single ? nextWarningKind(single.warnings) : null;
  const withEmail = chosen.filter((employee) => employee.hasEmail).length;
  const withPhone = chosen.filter((employee) => employee.hasPhone).length;

  const chooseKind = (next: LetterKind) => {
    setKind(next);
    setCategory(LETTER_KIND[next].group);
    if (LETTER_KIND[next].auto) {
      setSubject("");
      setSubjectEn("");
      setBody("");
      setBodyEn("");
      return;
    }
    const tpl = LETTER_TEMPLATES[next];
    setSubject(fillTpl(tpl.subject, reason));
    setSubjectEn(fillTpl(tpl.subjectEn, reason));
    setBody(fillTpl(tpl.body, reason));
    setBodyEn(fillTpl(tpl.bodyEn, reason));
  };

  const chooseCategory = (next: LetterGroup) => {
    setCategory(next);
    const options = kindSections.find((section) => section.key === next)?.options ?? [];
    const first = options.find((option) => !(LETTER_KIND[option].salary && !allowSalary));
    if (first) chooseKind(first);
  };

  const applyCause = (cause: WarningCause | null, reasonAr: string, opts?: { kind?: LetterKind; occurrence?: 1 | 2 | 3 | 4; silent?: boolean }) => {
    setClauseCode(cause?.code || "");
    if (!cause) {
      setClauseHistory(null);
      return;
    }
    const nextOcc = opts?.occurrence ?? occurrence;
    if (opts?.occurrence) setOccurrence(opts.occurrence);
    const nextKind = opts?.kind && LETTER_KIND[opts.kind] ? opts.kind : LETTER_KIND[cause.defaultKind] ? cause.defaultKind : kind;
    const filled = reasonAr || formatCauseReason(cause, nextOcc).ar;
    const tpl = LETTER_TEMPLATES[nextKind];
    const fill = (text: string) => text.replaceAll("{reason}", filled);
    setReason(filled);
    setKind(nextKind);
    setCategory(LETTER_KIND[nextKind].group);
    setSubject(fill(tpl.subject));
    setSubjectEn(fill(tpl.subjectEn));
    setBody(fill(tpl.body));
    setBodyEn(fill(tpl.bodyEn));
    if (!opts?.silent) {
      setNote({ tone: "ok", text: t("أُدرج المسبب في نص الإنذار. راجعه قبل الإصدار.", "The cause was placed in the warning text. Review it before issuing.") });
    }
  };

  const applySuggestedCorrection = () => {
    if (!clauseHistory || !clauseCode) return;
    const cause = warningCauses.find((item) => item.code === clauseCode);
    if (!cause) return;
    applyCause(cause, formatCauseReason(cause, clauseHistory.suggestedOccurrence).ar, {
      kind: clauseHistory.suggestedKind,
      occurrence: clauseHistory.suggestedOccurrence,
    });
    setNote({
      tone: "ok",
      text: t(
        `صُحّح إلى «${LETTER_KIND[clauseHistory.suggestedKind].label.ar}» والمرة ${clauseHistory.suggestedOccurrence} وفق السجل.`,
        `Corrected to “${LETTER_KIND[clauseHistory.suggestedKind].label.en}”, occurrence ${clauseHistory.suggestedOccurrence}, from history.`,
      ),
    });
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

  useEffect(() => {
    if (!clauseCode || !single || !showCauses) {
      setClauseHistory(null);
      return;
    }
    const cause = warningCauses.find((item) => item.code === clauseCode);
    let cancelled = false;
    const timer = setTimeout(() => {
      void lookupClauseHistory({ employeeId: single.value, clauseCode, defaultKind: cause?.defaultKind }).then((result) => {
        if (cancelled || result.error) return;
        setClauseHistory({
          items: result.items,
          suggestedOccurrence: result.suggestedOccurrence,
          suggestedKind: result.suggestedKind,
          lookbackDays: result.lookbackDays,
        });
        if (!result.items.length || !cause) return;
        applyCause(cause, formatCauseReason(cause, result.suggestedOccurrence).ar, {
          kind: result.suggestedKind,
          occurrence: result.suggestedOccurrence,
          silent: true,
        });
        setNote({
          tone: "ok",
          text: t(
            `تنبيه: وُجد إنذار سابق بنفس المخالفة — عُدّل تلقائياً إلى المرة ${result.suggestedOccurrence} و«${LETTER_KIND[result.suggestedKind].label.ar}».`,
            `Note: a prior letter for the same clause was found — auto-set to occurrence ${result.suggestedOccurrence} and “${LETTER_KIND[result.suggestedKind].label.en}”.`,
          ),
        });
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when employee/clause change; applyCause uses latest templates
  }, [clauseCode, single?.value, showCauses]);

  useEffect(() => {
    if (!auto || !previewPerson) {
      setAutoPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      startPreview(async () => {
        const result = await previewComposedLetter({
          kind,
          employeeId: previewPerson.value,
          addressee,
          purpose,
          endDate,
          issuedAt,
        });
        if (cancelled) return;
        if (result.error) {
          setAutoPreview({ subject: "", subjectEn: "", body: "", bodyEn: "", addressee: null, error: result.error });
          return;
        }
        setAutoPreview({
          subject: result.subject || "",
          subjectEn: result.subjectEn || "",
          body: result.body || "",
          bodyEn: result.bodyEn || "",
          addressee: result.addressee || null,
          error: null,
        });
      });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto, kind, previewPerson?.value, addressee, purpose, endDate, issuedAt]);

  const previewLetter = useMemo(() => {
    const person = previewPerson;
    const placeholder = t("اسم الموظف", "Employee name");
    const subjectAr = auto ? autoPreview?.subject || pick(LETTER_KIND[kind].label, "ar") : subject || pick(LETTER_KIND[kind].label, "ar");
    const subjectEnVal = auto ? autoPreview?.subjectEn || pick(LETTER_KIND[kind].label, "en") : subjectEn || pick(LETTER_KIND[kind].label, "en");
    const bodyAr = auto ? autoPreview?.body || (previewing ? t("جارٍ تجهيز المعاينة…", "Preparing preview…") : t("اختر موظفاً لعرض نص الشهادة من ملفه.", "Choose an employee to preview the certificate from their file.")) : body || fillTpl(LETTER_TEMPLATES[kind].body, reason);
    const bodyEnVal = auto ? autoPreview?.bodyEn || "" : bodyEn || fillTpl(LETTER_TEMPLATES[kind].bodyEn, reason);
    return {
      kind,
      refNo: `${LETTER_GROUP[LETTER_KIND[kind].group].code}-····-····`,
      issuedAt: parseDateInput(issuedAt) || new Date(),
      subject: subjectAr,
      subjectEn: subjectEnVal,
      body: bodyAr,
      bodyEn: bodyEnVal || null,
      addressee: auto ? autoPreview?.addressee || addressee || null : null,
      addresseeEn: null,
      signatoryName: signatoryName || null,
      signatoryTitle: signatoryTitle || null,
      acknowledgedAt: null,
      cancelledAt: null,
      employee: {
        fullName: person?.fullName || person?.label || placeholder,
        nameEn: person?.nameEn || null,
        employeeNumber: person?.employeeNumber || person?.hint || "—",
        jobTitle: person?.jobTitle || null,
        jobTitleEn: person?.jobTitleEn || null,
        idNumber: person?.idNumber || null,
        gender: person?.gender || null,
      },
    };
  }, [auto, autoPreview, body, bodyEn, issuedAt, kind, previewPerson, previewing, reason, signatoryName, signatoryTitle, subject, subjectEn, t, addressee, lang]);

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
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(17rem,24rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800">{t("١. الموظف ونوع الخطاب", "1. Employee and letter type")}</h2>
        <div className="min-w-0 space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">{t("إلى الموظف / الموظفين *", "To employee(s) *")}</span>
          <EmployeeMultiSelect name="employeeIds" options={employees} defaultValues={defaultEmployeeIds} onChange={setSelected} />
          <span className="block text-xs leading-5 text-slate-500">{t("عند اختيار أكثر من موظف يُصدر لكل منهم خطاب مستقل برقم خاص.", "With several employees, each one gets a separate letter with its own number.")}</span>
        </div>
        <input type="hidden" name="kind" value={kind} />
        <div className="space-y-3 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-inset ring-slate-200">
          <p className="text-xs font-semibold text-slate-500">{t("اختر نوع المستند ثم النوع الفرعي", "Choose the document type, then the subtype")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("١. نوع المستند *", "1. Document type *")}
              hint={kindSections.find((section) => section.key === category)?.hint}
            >
              <select
                className={fieldClass}
                value={category}
                aria-label={t("نوع المستند", "Document type")}
                onChange={(event) => chooseCategory(event.target.value as LetterGroup)}
              >
                {kindSections.map((section) => (
                  <option key={section.key} value={section.key}>
                    {section.heading}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("٢. النوع الفرعي *", "2. Subtype *")}>
              <select
                className={cn(fieldClass, "font-semibold text-teal-900")}
                value={categoryOptions.includes(kind) ? kind : ""}
                aria-label={t("النوع الفرعي", "Subtype")}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isLetterKind(next)) chooseKind(next);
                }}
              >
                {!categoryOptions.includes(kind) ? <option value="">{t("— اختر النوع الفرعي —", "— Choose subtype —")}</option> : null}
                {categoryOptions.map((option) => {
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
            </Field>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-500">{t("المختار الآن:", "Selected:")}</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-teal-900">
              {LETTER_KIND[kind].warning || kind === "NOTICE" ? <TriangleAlert size={15} className="text-orange-500" /> : LETTER_KIND[kind].auto ? <ScrollText size={15} className="text-teal-700" /> : <FileText size={15} className="text-teal-700" />}
              {kindSections.find((section) => section.key === category)?.heading}
              <span className="font-normal text-slate-400">/</span>
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
            <input className={`${fieldClass} w-full`} type="date" name="issuedAt" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} required />
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
                <input className={`${fieldClass} w-full`} name="addressee" value={addressee} onChange={(event) => setAddressee(event.target.value)} maxLength={160} />
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
                <input className={`${fieldClass} w-full`} name="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={400} required />
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
                <input className={`${fieldClass} w-full`} type="date" name="endDate" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
            ) : null}
          </div>
        </section>
      ) : (
      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-bold text-slate-800">{t("٢. المحتوى", "2. Content")}</h2>
        {showCauses && warningCauses.length ? (
          <WarningCausePicker
            causes={warningCauses}
            value={clauseCode}
            occurrence={occurrence}
            onSelect={(cause, reasonAr) => applyCause(cause, reasonAr, cause ? { occurrence: 1 } : undefined)}
            onOccurrence={(n) => {
              setOccurrence(n);
              const cause = warningCauses.find((item) => item.code === clauseCode);
              if (cause) applyCause(cause, formatCauseReason(cause, n).ar, { occurrence: n, kind, silent: true });
            }}
          />
        ) : null}
        {clauseHistory?.items.length ? (
          <div className="space-y-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-300" role="status">
            <p className="flex items-start gap-2 font-bold">
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
              <span>
                {t(
                  `تنبيه: مُنح هذا الموظف إنذاراً / جزاءً مشابهاً سابقاً (${clauseHistory.items.length}) خلال آخر ${clauseHistory.lookbackDays} يوماً لنفس بند اللائحة.`,
                  `Alert: this employee already received a similar sanction (${clauseHistory.items.length}) in the last ${clauseHistory.lookbackDays} days for the same clause.`,
                )}
              </span>
            </p>
            <ul className="ms-7 space-y-1.5">
              {clauseHistory.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <Link href={`/letters/${item.id}`} className="tabular font-bold text-teal-900 underline underline-offset-4" dir="ltr">
                    {item.refNo}
                  </Link>
                  <span className="text-amber-900/80">· {item.issuedAtLabel}</span>
                  <span className="font-semibold">· {pick({ ar: item.kindLabelAr, en: item.kindLabelEn }, lang)}</span>
                </li>
              ))}
            </ul>
            <p className="ms-7 text-xs leading-5 text-amber-900/90">
              {t(
                `المقترح الآن: المرة ${clauseHistory.suggestedOccurrence} — «${LETTER_KIND[clauseHistory.suggestedKind].label.ar}» (وفق القرار 618/2024: تُعد مخالفة أولى بعد مضي 6 أشهر).`,
                `Suggested now: occurrence ${clauseHistory.suggestedOccurrence} — “${LETTER_KIND[clauseHistory.suggestedKind].label.en}” (under MD 618/2024 a repeat after 6 months counts as first).`,
              )}
            </p>
            {kindMismatch ? (
              <div className="ms-7 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-red-800">
                  {t(
                    `النوع الحالي «${LETTER_KIND[kind].label.ar}» لا يطابق السجل.`,
                    `Current type “${LETTER_KIND[kind].label.en}” does not match the record.`,
                  )}
                </span>
                <button type="button" onClick={applySuggestedCorrection} className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white">
                  {t("تصحيح تلقائي", "Auto-correct")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <Field
          label={t("السبب أو التفاصيل", "Reason or details")}
          hint={t(
            "اختر مسبباً جاهزاً أعلاه أو اكتب باختصار ما حدث، ثم اختر نموذجاً جاهزاً فيُدرج فيه، أو اطلب الصياغة الذكية، أو اكتب النص بنفسك.",
            "Pick a ready cause above or briefly describe what happened, then pick a ready template, ask the AI to draft it, or write the text yourself.",
          )}
        >
          <textarea
            className={`${fieldClass} min-h-20 w-full`}
            value={reason}
            onChange={(event) => {
              const next = event.target.value;
              setReason(next);
              if (!auto && (body.includes("…………") || !body.trim() || body === fillTpl(LETTER_TEMPLATES[kind].body, reason))) {
                const tpl = LETTER_TEMPLATES[kind];
                setSubject(fillTpl(tpl.subject, next));
                setSubjectEn(fillTpl(tpl.subjectEn, next));
                setBody(fillTpl(tpl.body, next));
                setBodyEn(fillTpl(tpl.bodyEn, next));
              }
            }}
            maxLength={1500}
          />
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
                {t("معاينة كاملة في المسودات", "Full preview in drafts")}
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
      </div>

      <aside className="min-w-0 lg:sticky lg:top-3 lg:self-start">
        <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <LetterLivePreview
            letter={previewLetter}
            header={previewHeader}
            note={
              auto && autoPreview?.error
                ? autoPreview.error
                : chosen.length > 1
                  ? t("المعاينة لأول موظف مختار؛ يصدر لكل منهم خطاب مستقل.", "Preview shows the first selected employee; each gets their own letter.")
                  : !previewPerson
                    ? t("اختر موظفاً لترى اسمه على المستند.", "Choose an employee to see their name on the document.")
                    : null
            }
          />
        </div>
      </aside>
      </div>
    </form>
  );
}
