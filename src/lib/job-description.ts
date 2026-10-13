import type { Bi } from "./i18n";

export const JD_LISTS = ["responsibilities", "qualifications", "skills", "kpis"] as const;
export type JdList = (typeof JD_LISTS)[number];

export type JobDescription = {
  purposeAr: string;
  purposeEn: string;
} & Record<`${JdList}Ar` | `${JdList}En`, string[]>;

export const JD_LABEL: Record<"purpose" | JdList, Bi> = {
  purpose: { ar: "الغرض من الوظيفة", en: "Job purpose" },
  responsibilities: { ar: "المهام والمسؤوليات الرئيسية", en: "Key duties and responsibilities" },
  qualifications: { ar: "المؤهلات والخبرة المطلوبة", en: "Qualifications and experience" },
  skills: { ar: "المهارات والكفاءات", en: "Skills and competencies" },
  kpis: { ar: "مؤشرات قياس الأداء", en: "Key performance indicators" },
};

const LIMIT: Record<JdList, number> = { responsibilities: 14, qualifications: 8, skills: 10, kpis: 8 };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const items = (value: unknown, limit: number) =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [])
    .map((item) => text(item, 300).replace(/^[-*•\d.)\s]+/, ""))
    .filter(Boolean)
    .slice(0, limit);

/** Known fields only, trimmed and capped; lists accept arrays or one item per line (the edit form). */
export function sanitizeJobDescription(input: unknown): JobDescription {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const result = { purposeAr: text(data.purposeAr, 800), purposeEn: text(data.purposeEn, 800) } as JobDescription;
  for (const key of JD_LISTS) {
    result[`${key}Ar`] = items(data[`${key}Ar`], LIMIT[key]);
    result[`${key}En`] = items(data[`${key}En`], LIMIT[key]);
  }
  return result;
}

export function readJobDescription(value: unknown): JobDescription | null {
  if (!value || typeof value !== "object") return null;
  const description = sanitizeJobDescription(value);
  return description.purposeAr || description.responsibilitiesAr.length || description.purposeEn ? description : null;
}
