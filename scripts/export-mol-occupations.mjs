/** One-off: Occupation_Classification_16032026.pdf → src/lib/data/mol-occupations.json */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { fileURLToPath } from "url";

const CLASS_MAP = [
  [/أول|اول|First/i, "1"],
  [/ثاني|Second/i, "2"],
  [/ثالث|Third/i, "3"],
  [/رابع|Fourth/i, "4"],
  [/خامس|Fifth/i, "5"],
];

function readClass(text) {
  if (!/الفئة|Class/i.test(text)) return null;
  for (const [re, code] of CLASS_MAP) if (re.test(text)) return code;
  return null;
}

const pdfPath = process.argv[2] || "C:/Users/ahami/Downloads/Occupation_Classification_16032026.pdf";
const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
const { text } = await parser.getText();
await parser.destroy();

const pages = text.split(/\n-- \d+ of \d+ --\n/);
let inherit = null;
const rows = [];
const seen = new Set();
for (const page of pages) {
  const pageClass = readClass(page) || inherit;
  if (pageClass) inherit = pageClass;
  for (const line of page.split(/\r?\n/)) {
    const m = line.match(/^(\d{7,12})\t(.+?)\t(.+)$/);
    if (!m || seen.has(m[1])) continue;
    const nameAr = m[2].replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    const nameEn = m[3].replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    if (nameAr.length < 2) continue;
    seen.add(m[1]);
    rows.push({ code: m[1], nameAr, nameEn, skillClass: pageClass || "" });
  }
}

function fixPdfArabic(value) {
  return value.replace(/األ/g, "الأ").replace(/اإل/g, "الإ").replace(/اآ/g, "آ");
}
function splitMolEnglish(nameEn) {
  const cleaned = nameEn.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^[-–—/]\s*(.+?)\s+([A-Za-z((].*)$/);
  if (!match) return { specialtyAr: "", nameEn: cleaned };
  return {
    specialtyAr: fixPdfArabic(match[1].replace(/\s+/g, " ").trim()),
    nameEn: match[2].replace(/\s+/g, " ").trim(),
  };
}
function prepare(rows) {
  const used = new Set();
  return rows.map((row) => {
    const split = splitMolEnglish(row.nameEn);
    const baseAr = fixPdfArabic(row.nameAr);
    let nameAr = split.specialtyAr ? `${baseAr} ${split.specialtyAr}`.replace(/\s+/g, " ").trim() : baseAr;
    if (used.has(nameAr)) nameAr = `${nameAr} (${row.code})`;
    used.add(nameAr);
    return { ...row, nameAr, nameEn: split.nameEn || fixPdfArabic(row.nameEn) };
  });
}

const prepared = prepare(rows);
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/data");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "mol-occupations.json");
fs.writeFileSync(out, JSON.stringify(prepared));
console.log("wrote", prepared.length, "unique names", new Set(prepared.map((r) => r.nameAr)).size, "to", out, "bytes", fs.statSync(out).size);
