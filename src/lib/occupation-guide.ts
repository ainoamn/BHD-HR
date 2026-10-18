/**
 * Omani Ministry of Labour unified occupation classification (الدليل الموحد لتصنيف المهن):
 * parse PDF text into bilingual titles with occupation codes and skill classes.
 */

export const SKILL_CLASS = {
  "1": { ar: "الفئة الأولى", en: "First Class" },
  "2": { ar: "الفئة الثانية", en: "Second Class" },
  "3": { ar: "الفئة الثالثة", en: "Third Class" },
  "4": { ar: "الفئة الرابعة", en: "Fourth Class" },
  "5": { ar: "الفئة الخامسة", en: "Fifth Class" },
} as const;

export type SkillClassCode = keyof typeof SKILL_CLASS;

export type OccupationRow = {
  code: string;
  nameAr: string;
  nameEn: string;
  skillClass: SkillClassCode | "";
};

export type OccupationFileKind = "UNIFIED" | "COMPARISON" | "UNKNOWN";

const CLASS_RULES: { re: RegExp; code: SkillClassCode }[] = [
  { re: /أول|اول|First/i, code: "1" },
  { re: /ثاني|Second/i, code: "2" },
  { re: /ثالث|Third/i, code: "3" },
  { re: /رابع|Fourth/i, code: "4" },
  { re: /خامس|Fifth/i, code: "5" },
];

function clean(value: string) {
  return value.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
}

function readClass(text: string): SkillClassCode | null {
  if (!/الفئة|Class/i.test(text)) return null;
  for (const rule of CLASS_RULES) if (rule.re.test(text)) return rule.code;
  return null;
}

/** Which MoL occupation PDF this text looks like, from headers alone. */
export function detectOccupationFile(text: string): OccupationFileKind {
  const sample = text.slice(0, 8000);
  if (/رمز\s*المهنة/i.test(sample) && (/باللغة\s*العربية/i.test(sample) || /Classification/i.test(sample))) return "UNIFIED";
  if (/الرمز\s*المهني\s*الجديد/i.test(sample) || (/الرمزالمهنيالجديد/i.test(sample.replace(/\s+/g, "")) && /القديم/i.test(sample))) return "COMPARISON";
  if (/\d{10}\t.+\t[A-Za-z]/.test(sample) && /الفئة|First Class/i.test(sample)) return "UNIFIED";
  return "UNKNOWN";
}

/** Unified guide: code, Arabic name, English name, and the page's skill class. */
export function parseUnifiedOccupations(text: string): OccupationRow[] {
  const pages = text.split(/\n-- \d+ of \d+ --\n/);
  let inherit: SkillClassCode | null = null;
  const rows: OccupationRow[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const pageClass: SkillClassCode | null = readClass(page) ?? inherit;
    if (pageClass) inherit = pageClass;
    for (const line of page.split(/\r?\n/)) {
      const match = line.match(/^(\d{7,12})\t(.+?)\t(.+)$/);
      if (!match) continue;
      const code = match[1];
      if (seen.has(code)) continue;
      const nameAr = clean(match[2]);
      const nameEn = clean(match[3]);
      if (nameAr.length < 2) continue;
      seen.add(code);
      rows.push({ code, nameAr, nameEn, skillClass: pageClass || "" });
    }
  }
  return rows;
}

/**
 * Old→new comparison sheet: keeps the new code and the new Arabic title.
 * English is empty (filled later by AI translate or left blank).
 */
export function parseComparisonOccupations(text: string): OccupationRow[] {
  const rows: OccupationRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^.+?\t\d{5,12}\t(\d{7,12})\t(.+)$/);
    if (!match) continue;
    const code = match[1];
    if (seen.has(code)) continue;
    const nameAr = clean(match[2]);
    if (nameAr.length < 2) continue;
    seen.add(code);
    rows.push({ code, nameAr, nameEn: "", skillClass: "" });
  }
  return rows;
}

export function parseOccupationFile(text: string, kind?: OccupationFileKind): { kind: OccupationFileKind; rows: OccupationRow[] } {
  const detected = kind && kind !== "UNKNOWN" ? kind : detectOccupationFile(text);
  if (detected === "UNIFIED") return { kind: detected, rows: parseUnifiedOccupations(text) };
  if (detected === "COMPARISON") return { kind: detected, rows: parseComparisonOccupations(text) };
  const unified = parseUnifiedOccupations(text);
  if (unified.length) return { kind: "UNIFIED", rows: unified };
  const comparison = parseComparisonOccupations(text);
  if (comparison.length) return { kind: "COMPARISON", rows: comparison };
  return { kind: "UNKNOWN", rows: [] };
}

export function skillClassLabel(code: string | null | undefined, lang: "ar" | "en") {
  if (!code || !(code in SKILL_CLASS)) return "";
  return SKILL_CLASS[code as SkillClassCode][lang];
}

/** Counts per skill class for the import preview. */
export function occupationStats(rows: OccupationRow[]) {
  const byClass: Record<string, number> = {};
  for (const row of rows) {
    const key = row.skillClass || "none";
    byClass[key] = (byClass[key] || 0) + 1;
  }
  return { total: rows.length, byClass };
}
