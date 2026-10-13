import type { Bi, Lang } from "./i18n";

export type CvExperience = { title: string; company: string; location: string; from: string; to: string; current: boolean; description: string };
export type CvEducation = { degree: string; field: string; institution: string; from: string; to: string; grade: string };
export type CvLanguage = { name: string; level: CvLevel };
export type CvCertification = { name: string; issuer: string; year: string };
export type CvContent = {
  headline: string;
  summary: string;
  experience: CvExperience[];
  education: CvEducation[];
  skills: string[];
  languages: CvLanguage[];
  certifications: CvCertification[];
  achievements: string[];
  linkedin: string;
  website: string;
};
export type Cv = Partial<Record<Lang, CvContent>>;

export const CV_LEVELS = ["NATIVE", "FLUENT", "GOOD", "BASIC"] as const;
export type CvLevel = (typeof CV_LEVELS)[number];

export const CV_LEVEL_LABEL: Record<CvLevel, Bi> = {
  NATIVE: { ar: "اللغة الأم", en: "Native" },
  FLUENT: { ar: "بطلاقة", en: "Fluent" },
  GOOD: { ar: "جيد", en: "Good" },
  BASIC: { ar: "مبتدئ", en: "Basic" },
};

/** Dots shown next to a language on the printed CV. */
export const CV_LEVEL_DOTS: Record<CvLevel, number> = { NATIVE: 5, FLUENT: 4, GOOD: 3, BASIC: 2 };

export const CV_LIMITS = { experience: 12, education: 8, skills: 30, languages: 10, certifications: 15, achievements: 10, summary: 1500, description: 1500 };

export function emptyCv(): CvContent {
  return { headline: "", summary: "", experience: [], education: [], skills: [], languages: [], certifications: [], achievements: [], linkedin: "", website: "" };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const line = (value: unknown, max: number) => text(value, max).replace(/\s+/g, " ");
const list = (value: unknown) => (Array.isArray(value) ? (value as unknown[]) : []);
const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
/** Month inputs give YYYY-MM; a bare year is kept as typed. */
const period = (value: unknown) => {
  const raw = line(value, 7);
  return /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(raw) ? raw : "";
};
const url = (value: unknown) => {
  const raw = line(value, 200);
  if (!raw) return "";
  const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(full);
    return parsed.hostname.includes(".") ? parsed.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
};

/** Cleans CV content from a form or the AI: known fields only, trimmed, capped, empty rows dropped. */
export function sanitizeCv(input: unknown): CvContent {
  const data = record(input);
  return {
    headline: line(data.headline, 120),
    summary: text(data.summary, CV_LIMITS.summary),
    experience: list(data.experience)
      .map(record)
      .map((item) => ({
        title: line(item.title, 120),
        company: line(item.company, 120),
        location: line(item.location, 80),
        from: period(item.from),
        to: item.current ? "" : period(item.to),
        current: Boolean(item.current),
        description: text(item.description, CV_LIMITS.description),
      }))
      .filter((item) => item.title || item.company)
      .slice(0, CV_LIMITS.experience),
    education: list(data.education)
      .map(record)
      .map((item) => ({
        degree: line(item.degree, 120),
        field: line(item.field, 120),
        institution: line(item.institution, 160),
        from: period(item.from),
        to: period(item.to),
        grade: line(item.grade, 60),
      }))
      .filter((item) => item.degree || item.institution)
      .slice(0, CV_LIMITS.education),
    skills: [...new Set(list(data.skills).map((item) => line(item, 60)).filter(Boolean))].slice(0, CV_LIMITS.skills),
    languages: list(data.languages)
      .map(record)
      .map((item) => ({ name: line(item.name, 40), level: (CV_LEVELS as readonly string[]).includes(String(item.level)) ? (item.level as CvLevel) : "GOOD" }))
      .filter((item) => item.name)
      .slice(0, CV_LIMITS.languages),
    certifications: list(data.certifications)
      .map(record)
      .map((item) => ({ name: line(item.name, 160), issuer: line(item.issuer, 120), year: line(item.year, 4).replace(/\D/g, "") }))
      .filter((item) => item.name)
      .slice(0, CV_LIMITS.certifications),
    achievements: list(data.achievements).map((item) => line(item, 240)).filter(Boolean).slice(0, CV_LIMITS.achievements),
    linkedin: url(data.linkedin),
    website: url(data.website),
  };
}

export function readCv(value: unknown): Cv {
  const data = record(value);
  const cv: Cv = {};
  for (const lang of ["ar", "en"] as const) if (data[lang]) cv[lang] = sanitizeCv(data[lang]);
  return cv;
}

export function hasCvContent(content: CvContent | undefined) {
  return Boolean(content && (content.summary || content.experience.length || content.education.length || content.skills.length || content.headline));
}

/** The version to print: the asked language, else whichever exists. */
export function cvFor(cv: Cv, lang: Lang): { lang: Lang; content: CvContent } {
  if (hasCvContent(cv[lang])) return { lang, content: cv[lang]! };
  const other: Lang = lang === "ar" ? "en" : "ar";
  if (hasCvContent(cv[other])) return { lang: other, content: cv[other]! };
  return { lang, content: cv[lang] || emptyCv() };
}

/** 0–100 with the next missing piece, so the editor can nudge towards a complete CV. */
export function cvCompleteness(content: CvContent, hasPhoto: boolean): { score: number; missing: Bi[] } {
  const checks: [boolean, number, Bi][] = [
    [hasPhoto, 10, { ar: "صورة شخصية (تضيفها الموارد البشرية)", en: "A profile photo (added by HR)" }],
    [Boolean(content.headline), 10, { ar: "المسمى المهني", en: "A professional headline" }],
    [content.summary.length >= 120, 20, { ar: "نبذة مهنية من سطرين على الأقل", en: "A summary of at least two lines" }],
    [content.experience.length > 0, 20, { ar: "خبرة عملية واحدة على الأقل", en: "At least one work experience" }],
    [content.education.length > 0, 15, { ar: "المؤهل العلمي", en: "Your education" }],
    [content.skills.length >= 4, 15, { ar: "أربع مهارات على الأقل", en: "At least four skills" }],
    [content.languages.length > 0, 10, { ar: "اللغات", en: "Languages" }],
  ];
  return {
    score: checks.reduce((sum, [done, weight]) => sum + (done ? weight : 0), 0),
    missing: checks.filter(([done]) => !done).map(([, , label]) => label),
  };
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function cvPeriod(value: string, lang: Lang) {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (!month) return year;
  return `${(lang === "ar" ? MONTHS_AR : MONTHS_EN)[Number(month) - 1]} ${year}`;
}

export function cvRange(from: string, to: string, current: boolean, lang: Lang) {
  const end = current ? (lang === "ar" ? "حتى الآن" : "Present") : cvPeriod(to, lang);
  const start = cvPeriod(from, lang);
  return start && end ? `${start} – ${end}` : start || end;
}
