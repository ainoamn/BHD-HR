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

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/data");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "mol-occupations.json");
fs.writeFileSync(out, JSON.stringify(rows));
console.log("wrote", rows.length, "to", out, "bytes", fs.statSync(out).size);
