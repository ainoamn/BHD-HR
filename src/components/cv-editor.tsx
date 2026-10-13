"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Award, BriefcaseBusiness, Eye, GraduationCap, Languages, Link2, LoaderCircle, Plus, Sparkles, Trash2, UserRound, Wrench, X } from "lucide-react";
import { CV_LEVELS, CV_LEVEL_LABEL, CV_LIMITS, cvCompleteness, type CvContent, type CvEducation, type CvExperience } from "@/lib/cv";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { polishCv, saveCv } from "@/server/cv-actions";
import { useLang } from "./lang-provider";
import { SubmitButton } from "./submit-button";
import { fieldClass, ghostBtn, primaryBtn, secondaryBtn } from "./ui";

const blankExperience: CvExperience = { title: "", company: "", location: "", from: "", to: "", current: false, description: "" };
const blankEducation: CvEducation = { degree: "", field: "", institution: "", from: "", to: "", grade: "" };
const LANGUAGE_SUGGESTIONS: Record<Lang, string[]> = {
  ar: ["العربية", "الإنجليزية", "الهندية", "الأردية", "البنغالية", "الفلبينية", "الفرنسية", "السواحيلية", "المليالامية"],
  en: ["Arabic", "English", "Hindi", "Urdu", "Bengali", "Filipino", "French", "Swahili", "Malayalam"],
};

type Props = {
  initial: CvContent;
  /** Language of the CV content being edited (not of the interface). */
  cvLang: Lang;
  saved: Record<Lang, boolean>;
  owner: { token?: string; employeeId?: string };
  hasPhoto: boolean;
  /** Pages for the language tabs and the preview, without the lang parameter. */
  editHref: string;
  printHref: string;
  back: string;
};

function move<T>(items: T[], index: number, by: number) {
  const next = [...items];
  const target = index + by;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function CvEditor({ initial, cvLang, saved, owner, hasPhoto, editHref, printHref, back }: Props) {
  const { t } = useLang();
  const [cv, setCv] = useState<CvContent>(initial);
  const [achievements, setAchievements] = useState(initial.achievements.join("\n"));
  const [skill, setSkill] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ error?: string; message?: string } | null>(null);
  const [busy, setBusy] = useState<"polish" | "translate" | null>(null);
  const [, startTransition] = useTransition();
  const dir = cvLang === "ar" ? "rtl" : "ltr";
  const other: Lang = cvLang === "ar" ? "en" : "ar";
  const c = (ar: string, en: string) => (cvLang === "ar" ? ar : en);

  const content = useMemo<CvContent>(() => ({ ...cv, achievements: achievements.split("\n").map((line) => line.trim()).filter(Boolean) }), [cv, achievements]);
  const progress = cvCompleteness(content, hasPhoto);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(patch: Partial<CvContent>) {
    setCv((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  function updateItem<K extends "experience" | "education" | "languages" | "certifications">(key: K, index: number, patch: Partial<CvContent[K][number]>) {
    setCv((current) => ({ ...current, [key]: current[key].map((item, at) => (at === index ? { ...item, ...patch } : item)) }));
    setDirty(true);
  }
  function addSkill(raw: string) {
    const names = raw.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean);
    if (!names.length) return;
    update({ skills: [...new Set([...cv.skills, ...names])].slice(0, CV_LIMITS.skills) });
    setSkill("");
  }

  function runAi(mode: "polish" | "translate") {
    setBusy(mode);
    setNotice(null);
    startTransition(async () => {
      const result = await polishCv({ ...owner, lang: cvLang, mode, content });
      setBusy(null);
      if (result.error || !result.content) {
        setNotice({ error: result.error || t("تعذّرت العملية", "Something went wrong") });
        return;
      }
      setCv(result.content);
      setAchievements(result.content.achievements.join("\n"));
      setDirty(true);
      setNotice({ message: t("جاهزة. راجع النص وعدّل ما تريد ثم اضغط «حفظ السيرة».", "Done. Review and adjust the text, then press “Save CV”.") });
    });
  }

  const label = (text: string) => <span className="text-xs font-semibold text-slate-600">{text}</span>;
  const section = (Icon: typeof Award, title: string, hint: string, children: React.ReactNode, action?: React.ReactNode) => (
    <section className="rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
            <Icon size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
  const rowTools = (key: "experience" | "education", index: number, count: number) => (
    <div className="flex items-center gap-1">
      <button type="button" className={cn(ghostBtn, "size-9 px-0")} disabled={index === 0} onClick={() => update({ [key]: move(cv[key] as unknown[], index, -1) } as Partial<CvContent>)} aria-label={t("تحريك لأعلى", "Move up")}>
        <ArrowUp size={16} />
      </button>
      <button type="button" className={cn(ghostBtn, "size-9 px-0")} disabled={index === count - 1} onClick={() => update({ [key]: move(cv[key] as unknown[], index, 1) } as Partial<CvContent>)} aria-label={t("تحريك لأسفل", "Move down")}>
        <ArrowDown size={16} />
      </button>
      <button
        type="button"
        className={cn(ghostBtn, "size-9 px-0 text-red-700 hover:bg-red-50 hover:text-red-800")}
        onClick={() => update({ [key]: (cv[key] as unknown[]).filter((_, at) => at !== index) } as Partial<CvContent>)}
        aria-label={t("حذف", "Remove")}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label={t("لغة السيرة", "CV language")}>
            {(["ar", "en"] as const).map((lang) => (
              <Link
                key={lang}
                href={`${editHref}${editHref.includes("?") ? "&" : "?"}lang=${lang}`}
                role="tab"
                aria-selected={lang === cvLang}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition",
                  lang === cvLang ? "bg-surface text-teal-800 shadow-card" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {lang === "ar" ? "النسخة العربية" : "English version"}
                <span className={cn("size-2 rounded-full", saved[lang] ? "bg-emerald-500" : "bg-slate-300")} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <Link href={`${printHref}${printHref.includes("?") ? "&" : "?"}lang=${cvLang}`} className={secondaryBtn} target="_blank">
            <Eye size={16} />
            {t("معاينة وطباعة", "Preview & print")}
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-700">{t("اكتمال السيرة", "CV completeness")}</span>
              <span className="tabular font-bold text-teal-800">{progress.score}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-l from-teal-600 to-emerald-500 transition-[width] duration-300" style={{ width: `${progress.score}%` }} />
            </div>
            {progress.missing.length ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {t("لإكمالها أضف: ", "To complete it, add: ")}
                {progress.missing.map((item) => t(item.ar, item.en)).join(t("، ", ", "))}
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-emerald-700">{t("سيرتك مكتملة. ممتاز!", "Your CV is complete. Great!")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={Boolean(busy)} onClick={() => runAi("polish")}>
              {busy === "polish" ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy === "polish" ? t("جارٍ الصياغة...", "Rewriting...") : t("صياغة احترافية بالذكاء الاصطناعي", "Polish with AI")}
            </button>
            {saved[other] ? (
              <button type="button" className={secondaryBtn} disabled={Boolean(busy)} onClick={() => runAi("translate")}>
                {busy === "translate" ? <LoaderCircle size={16} className="animate-spin" /> : <Languages size={16} />}
                {other === "ar" ? t("ترجمة من النسخة العربية", "Translate from the Arabic version") : t("ترجمة من النسخة الإنجليزية", "Translate from the English version")}
              </button>
            ) : null}
          </div>
        </div>
        {notice ? (
          <p
            role="status"
            className={cn(
              "mt-3 rounded-xl px-3 py-2 text-sm leading-6 ring-1 ring-inset",
              notice.error ? "bg-red-50 text-red-800 ring-red-100" : "bg-emerald-50 text-emerald-800 ring-emerald-100",
            )}
          >
            {notice.error || notice.message}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {t(
            "الذكاء الاصطناعي يحسّن الصياغة فقط ولا يضيف خبرات أو شهادات غير موجودة. الاسم والصورة والتواصل والوظيفة الحالية تُؤخذ من ملفك تلقائياً.",
            "AI only improves the wording; it never adds experience or certificates you did not enter. Your name, photo, contact details and current job come from your file automatically.",
          )}
        </p>
      </div>

      <div dir={dir} className="space-y-4">
        {section(
          UserRound,
          c("النبذة المهنية", "Professional summary"),
          c("سطر يعرّف بك وفقرة قصيرة عن خبرتك ونقاط قوتك.", "One line that introduces you and a short paragraph on your experience and strengths."),
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              {label(c("المسمى المهني", "Headline"))}
              <input className={fieldClass} value={cv.headline} maxLength={120} onChange={(event) => update({ headline: event.target.value })} placeholder={c("مثال: محاسب أول بخبرة 8 سنوات في التدقيق", "e.g. Senior Accountant with 8 years in audit")} />
            </label>
            <label className="grid gap-1.5">
              {label(c("نبذة عنك", "About you"))}
              <textarea
                className={cn(fieldClass, "min-h-32 leading-7")}
                value={cv.summary}
                maxLength={CV_LIMITS.summary}
                onChange={(event) => update({ summary: event.target.value })}
                placeholder={c("اكتب بأسلوبك ثم اضغط «صياغة احترافية» لتحسينها.", "Write it your way, then press “Polish with AI” to improve it.")}
              />
              <span className="tabular text-end text-xs text-slate-400">
                {cv.summary.length}/{CV_LIMITS.summary}
              </span>
            </label>
          </div>,
        )}

        {section(
          BriefcaseBusiness,
          c("الخبرات العملية", "Work experience"),
          c("من الأحدث إلى الأقدم. الوظيفة الحالية في الشركة تظهر تلقائياً، أضف خبراتك السابقة.", "Most recent first. Your current job here is shown automatically; add your previous roles."),
          <div className="space-y-3">
            {cv.experience.map((item, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-700">{item.title || item.company || c(`خبرة ${index + 1}`, `Experience ${index + 1}`)}</span>
                  {rowTools("experience", index, cv.experience.length)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    {label(c("المسمى الوظيفي", "Job title"))}
                    <input className={fieldClass} value={item.title} onChange={(event) => updateItem("experience", index, { title: event.target.value })} />
                  </label>
                  <label className="grid gap-1.5">
                    {label(c("جهة العمل", "Company"))}
                    <input className={fieldClass} value={item.company} onChange={(event) => updateItem("experience", index, { company: event.target.value })} />
                  </label>
                  <label className="grid gap-1.5">
                    {label(c("المدينة / الدولة", "City / country"))}
                    <input className={fieldClass} value={item.location} onChange={(event) => updateItem("experience", index, { location: event.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5">
                      {label(c("من", "From"))}
                      <input type="month" dir="ltr" className={fieldClass} value={item.from} onChange={(event) => updateItem("experience", index, { from: event.target.value })} />
                    </label>
                    <label className="grid gap-1.5">
                      {label(c("إلى", "To"))}
                      <input type="month" dir="ltr" className={fieldClass} value={item.current ? "" : item.to} disabled={item.current} onChange={(event) => updateItem("experience", index, { to: event.target.value })} />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                    <input type="checkbox" className="size-4 accent-teal-700" checked={item.current} onChange={(event) => updateItem("experience", index, { current: event.target.checked })} />
                    {c("ما زلت أعمل هنا", "I still work here")}
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    {label(c("المهام والإنجازات", "Duties and achievements"))}
                    <textarea
                      className={cn(fieldClass, "min-h-28 leading-7")}
                      value={item.description}
                      maxLength={CV_LIMITS.description}
                      onChange={(event) => updateItem("experience", index, { description: event.target.value })}
                      placeholder={c("- إعداد التقارير المالية الشهرية\n- خفض المصروفات 12%", "- Prepared monthly financial reports\n- Cut costs by 12%")}
                    />
                  </label>
                </div>
              </div>
            ))}
            {cv.experience.length < CV_LIMITS.experience ? (
              <button type="button" className={secondaryBtn} onClick={() => update({ experience: [...cv.experience, { ...blankExperience }] })}>
                <Plus size={16} />
                {c("إضافة خبرة", "Add experience")}
              </button>
            ) : null}
          </div>,
        )}

        {section(
          GraduationCap,
          c("المؤهلات العلمية", "Education"),
          c("الشهادات الدراسية من الأعلى إلى الأدنى.", "Degrees from highest to lowest."),
          <div className="space-y-3">
            {cv.education.map((item, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-700">{item.degree || item.institution || c(`مؤهل ${index + 1}`, `Degree ${index + 1}`)}</span>
                  {rowTools("education", index, cv.education.length)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    {label(c("المؤهل", "Degree"))}
                    <input className={fieldClass} value={item.degree} onChange={(event) => updateItem("education", index, { degree: event.target.value })} placeholder={c("بكالوريوس", "Bachelor's")} />
                  </label>
                  <label className="grid gap-1.5">
                    {label(c("التخصص", "Field of study"))}
                    <input className={fieldClass} value={item.field} onChange={(event) => updateItem("education", index, { field: event.target.value })} />
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    {label(c("الجامعة / المعهد", "University / institute"))}
                    <input className={fieldClass} value={item.institution} onChange={(event) => updateItem("education", index, { institution: event.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5">
                      {label(c("من", "From"))}
                      <input type="month" dir="ltr" className={fieldClass} value={item.from} onChange={(event) => updateItem("education", index, { from: event.target.value })} />
                    </label>
                    <label className="grid gap-1.5">
                      {label(c("إلى", "To"))}
                      <input type="month" dir="ltr" className={fieldClass} value={item.to} onChange={(event) => updateItem("education", index, { to: event.target.value })} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    {label(c("التقدير / المعدل", "Grade / GPA"))}
                    <input className={fieldClass} value={item.grade} onChange={(event) => updateItem("education", index, { grade: event.target.value })} />
                  </label>
                </div>
              </div>
            ))}
            {cv.education.length < CV_LIMITS.education ? (
              <button type="button" className={secondaryBtn} onClick={() => update({ education: [...cv.education, { ...blankEducation }] })}>
                <Plus size={16} />
                {c("إضافة مؤهل", "Add degree")}
              </button>
            ) : null}
          </div>,
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {section(
            Wrench,
            c("المهارات", "Skills"),
            c("اكتب المهارة ثم Enter أو فاصلة.", "Type a skill, then Enter or a comma."),
            <div>
              <div className="flex flex-wrap gap-1.5">
                {cv.skills.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1 rounded-full bg-teal-50 py-1 pe-1.5 ps-3 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
                    {item}
                    <button type="button" className="rounded-full p-0.5 text-teal-700 transition hover:bg-teal-100" onClick={() => update({ skills: cv.skills.filter((value) => value !== item) })} aria-label={t(`حذف ${item}`, `Remove ${item}`)}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              {cv.skills.length < CV_LIMITS.skills ? (
                <div className="mt-3 flex gap-2">
                  <input
                    className={cn(fieldClass, "flex-1")}
                    value={skill}
                    onChange={(event) => (/[,،]/.test(event.target.value) ? addSkill(event.target.value) : setSkill(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addSkill(skill);
                      }
                    }}
                    placeholder={c("مثال: Excel، خدمة العملاء، القيادة", "e.g. Excel, customer service, leadership")}
                  />
                  <button type="button" className={secondaryBtn} onClick={() => addSkill(skill)} aria-label={t("إضافة", "Add")}>
                    <Plus size={16} />
                  </button>
                </div>
              ) : null}
            </div>,
          )}

          {section(
            Languages,
            c("اللغات", "Languages"),
            c("اللغة ومستوى إجادتها.", "Language and how well you speak it."),
            <div className="space-y-2">
              <datalist id="cv-language-names">
                {LANGUAGE_SUGGESTIONS[cvLang].map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {cv.languages.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input list="cv-language-names" className={cn(fieldClass, "min-w-0 flex-1")} value={item.name} onChange={(event) => updateItem("languages", index, { name: event.target.value })} aria-label={c("اللغة", "Language")} />
                  <select className={cn(fieldClass, "w-32 shrink-0")} value={item.level} onChange={(event) => updateItem("languages", index, { level: event.target.value as (typeof CV_LEVELS)[number] })} aria-label={c("المستوى", "Level")}>
                    {CV_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {c(CV_LEVEL_LABEL[level].ar, CV_LEVEL_LABEL[level].en)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={cn(ghostBtn, "size-10 shrink-0 px-0 text-red-700 hover:bg-red-50")} onClick={() => update({ languages: cv.languages.filter((_, at) => at !== index) })} aria-label={t("حذف", "Remove")}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {cv.languages.length < CV_LIMITS.languages ? (
                <button type="button" className={secondaryBtn} onClick={() => update({ languages: [...cv.languages, { name: "", level: "GOOD" }] })}>
                  <Plus size={16} />
                  {c("إضافة لغة", "Add language")}
                </button>
              ) : null}
            </div>,
          )}
        </div>

        {section(
          Award,
          c("الشهادات والدورات والإنجازات", "Certificates, courses and achievements"),
          c("الشهادات المهنية والدورات التدريبية، وأبرز إنجازاتك.", "Professional certificates, training courses and your key achievements."),
          <div className="space-y-3">
            {cv.certifications.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1.4fr_6rem_auto]">
                <input className={fieldClass} value={item.name} onChange={(event) => updateItem("certifications", index, { name: event.target.value })} placeholder={c("اسم الشهادة أو الدورة", "Certificate or course")} aria-label={c("الشهادة", "Certificate")} />
                <input className={fieldClass} value={item.issuer} onChange={(event) => updateItem("certifications", index, { issuer: event.target.value })} placeholder={c("الجهة المانحة", "Issued by")} aria-label={c("الجهة", "Issuer")} />
                <input className={cn(fieldClass, "tabular")} dir="ltr" inputMode="numeric" maxLength={4} value={item.year} onChange={(event) => updateItem("certifications", index, { year: event.target.value.replace(/\D/g, "") })} placeholder="2024" aria-label={c("السنة", "Year")} />
                <button type="button" className={cn(ghostBtn, "size-10 px-0 text-red-700 hover:bg-red-50")} onClick={() => update({ certifications: cv.certifications.filter((_, at) => at !== index) })} aria-label={t("حذف", "Remove")}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {cv.certifications.length < CV_LIMITS.certifications ? (
              <button type="button" className={secondaryBtn} onClick={() => update({ certifications: [...cv.certifications, { name: "", issuer: "", year: "" }] })}>
                <Plus size={16} />
                {c("إضافة شهادة أو دورة", "Add certificate or course")}
              </button>
            ) : null}
            <label className="grid gap-1.5 border-t border-slate-100 pt-3">
              {label(c("أبرز الإنجازات (سطر لكل إنجاز)", "Key achievements (one per line)"))}
              <textarea
                className={cn(fieldClass, "min-h-24 leading-7")}
                value={achievements}
                onChange={(event) => {
                  setAchievements(event.target.value);
                  setDirty(true);
                }}
                placeholder={c("موظف الشهر — مارس 2025", "Employee of the month — March 2025")}
              />
            </label>
          </div>,
        )}

        {section(
          Link2,
          c("الروابط", "Links"),
          c("اختياري: حسابك في LinkedIn أو موقعك الشخصي.", "Optional: your LinkedIn profile or personal website."),
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              {label("LinkedIn")}
              <input className={fieldClass} dir="ltr" value={cv.linkedin} onChange={(event) => update({ linkedin: event.target.value })} placeholder="linkedin.com/in/…" />
            </label>
            <label className="grid gap-1.5">
              {label(c("الموقع الشخصي", "Website"))}
              <input className={fieldClass} dir="ltr" value={cv.website} onChange={(event) => update({ website: event.target.value })} placeholder="example.com" />
            </label>
          </div>,
        )}
      </div>

      <form
        action={saveCv}
        onSubmit={() => setDirty(false)}
        className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:shadow-raised"
      >
        {owner.token ? <input type="hidden" name="token" value={owner.token} /> : null}
        {owner.employeeId ? <input type="hidden" name="employeeId" value={owner.employeeId} /> : null}
        <input type="hidden" name="lang" value={cvLang} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="cv" value={JSON.stringify(content)} />
        <p className="text-xs text-slate-500">{dirty ? t("لديك تغييرات غير محفوظة", "You have unsaved changes") : t("كل التغييرات محفوظة", "All changes saved")}</p>
        <SubmitButton>{t("حفظ السيرة", "Save CV")}</SubmitButton>
      </form>
    </div>
  );
}
