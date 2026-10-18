/** Apply specialty/unique-name fix to bundled MoL JSON + refresh meta. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function clean(value) {
  return String(value || "").replace(/\t/g, " ").replace(/\s+/g, " ").trim();
}
function fixPdfArabic(value) {
  return value.replace(/األ/g, "الأ").replace(/اإل/g, "الإ").replace(/اآ/g, "آ");
}
function splitMolEnglish(nameEn) {
  const cleaned = clean(nameEn);
  const match = cleaned.match(/^[-–—/]\s*(.+?)\s+([A-Za-z((].*)$/);
  if (!match) return { specialtyAr: "", nameEn: cleaned };
  return { specialtyAr: fixPdfArabic(clean(match[1])), nameEn: clean(match[2]) };
}
function finalize(row) {
  const split = splitMolEnglish(row.nameEn);
  const baseAr = fixPdfArabic(clean(row.nameAr));
  const nameAr = split.specialtyAr ? clean(`${baseAr} ${split.specialtyAr}`) : baseAr;
  return { ...row, nameAr, nameEn: split.nameEn || fixPdfArabic(clean(row.nameEn)) };
}
function ensureUnique(rows) {
  const used = new Set();
  return rows.map((row) => {
    let nameAr = row.nameAr;
    if (used.has(nameAr)) nameAr = clean(`${row.nameAr} (${row.code})`);
    used.add(nameAr);
    return { ...row, nameAr };
  });
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/data");
const jsonPath = path.join(dir, "mol-occupations.json");
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const rows = ensureUnique(raw.map(finalize));
const names = new Set(rows.map((r) => r.nameAr));
if (names.size !== rows.length) throw new Error("duplicate names remain");

fs.writeFileSync(jsonPath, JSON.stringify(rows));
const byClass = {};
for (const row of rows) byClass[row.skillClass || "none"] = (byClass[row.skillClass || "none"] || 0) + 1;
const sample = [
  rows.find((r) => r.code === "1120001001"),
  rows.find((r) => r.code === "1120001002"),
  rows.find((r) => r.code === "1120002001"),
  rows.find((r) => r.code === "1120002002"),
  rows.find((r) => r.code === "1120002003"),
  rows.find((r) => r.code === "1411005001"),
  rows.find((r) => r.code === "2113001001"),
  rows.find((r) => r.code === "2163008001"),
].filter(Boolean);

const metaPath = path.join(dir, "mol-occupations-meta.ts");
fs.writeFileSync(
  metaPath,
  `/** Lightweight stats for the built-in MoL guide — keeps the preview instant without loading 4k rows. */
export const BUILTIN_OCCUPATION_META = {
  total: ${rows.length},
  byClass: ${JSON.stringify(byClass)} as Record<string, number>,
  sample: ${JSON.stringify(sample, null, 2)} as const,
} as const;
`,
);

console.log({ total: rows.length, uniqueNames: names.size, byClass, sampleChem: sample.find((r) => r.code === "2113001001") });
