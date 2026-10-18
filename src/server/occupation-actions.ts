"use server";

import { aiDetectOccupationFile } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import {
  detectOccupationFile,
  occupationStats,
  parseOccupationFile,
  skillClassLabel,
  type OccupationFileKind,
  type OccupationRow,
} from "@/lib/occupation-guide";
import { pdfText } from "@/lib/pdf-text";
import { prisma } from "@/lib/prisma";
import { aiLockedMessage, aiOpen } from "@/lib/subscription";

const MAX_FILE = 4 * 1024 * 1024;

export type OccupationPreview = {
  kind?: OccupationFileKind;
  kindLabel?: string;
  total?: number;
  byClass?: Record<string, number>;
  sample?: { code: string; nameAr: string; nameEn: string; classLabel: string }[];
  /** Base64 of the parsed JSON rows so save does not re-read the PDF. */
  payload?: string;
  /** Use the bundled MoL guide on save (no large payload round-trip). */
  builtin?: boolean;
  error?: string;
};

function kindLabel(kind: OccupationFileKind, t: (ar: string, en: string) => string) {
  if (kind === "UNIFIED") return t("الدليل الموحد لتصنيف المهن (وزارة العمل)", "Ministry of Labour unified occupation classification");
  if (kind === "COMPARISON") return t("مقارنة التصنيف القديم بالجديد", "Old–new occupation classification comparison");
  return t("ملف غير معروف", "Unknown file");
}

function encodeRows(rows: OccupationRow[]) {
  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64url");
}

function decodeRows(payload: string): OccupationRow[] | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((row) => row && typeof row.code === "string" && typeof row.nameAr === "string")
      .map((row) => ({
        code: String(row.code).replace(/\s+/g, "").slice(0, 20),
        nameAr: String(row.nameAr).trim().slice(0, 120),
        nameEn: typeof row.nameEn === "string" ? row.nameEn.trim().slice(0, 120) : "",
        skillClass: ["1", "2", "3", "4", "5"].includes(row.skillClass) ? row.skillClass : "",
      }))
      .filter((row) => row.code && row.nameAr.length >= 2);
  } catch {
    return null;
  }
}

/** Reads a MoL occupation PDF: detects the guide type (heuristics, then AI if needed) and returns a preview. */
export async function previewOccupationGuide(formData: FormData): Promise<OccupationPreview> {
  const user = await requireAdmin("/settings/hr?tab=jobs");
  const { lang, t } = await getI18n();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: t("اختر ملف PDF أولاً", "Choose a PDF file first") };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: t("الملف يجب أن يكون PDF", "The file must be a PDF") };
  }
  if (file.size > MAX_FILE) return { error: t("الملف أكبر من 4 ميغابايت", "The file is larger than 4 MB") };

  let text: string;
  try {
    ({ text } = await pdfText(new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    console.error("occupation PDF read failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    const password = /password|encrypted|نمستخد/i.test(detail);
    return {
      error: password
        ? t("الملف محمي بكلمة مرور. أزل الحماية ثم أعد الرفع، أو استخدم «استيراد الدليل الرسمي» أدناه.", "The file is password-protected. Remove the password and try again, or use “Import the official guide” below.")
        : t(
            "تعذرت قراءة ملف PDF على الخادم. استخدم زر «استيراد الدليل الرسمي» (نفس دليل وزارة العمل)، أو أعد المحاولة بعد لحظات.",
            "Could not read the PDF on the server. Use “Import the official guide” (the same MoL guide), or try again shortly.",
          ),
    };
  }
  if (!text.trim()) return { error: t("الملف بلا نص قابل للقراءة", "The file has no readable text") };

  let kind = detectOccupationFile(text);
  if (kind === "UNKNOWN") {
    if (!(await aiOpen(user.companyId))) return { error: aiLockedMessage(t) };
    try {
      kind = await aiDetectOccupationFile(text);
    } catch (error) {
      console.error("occupation AI detect failed", error);
      return { error: t("تعذر التعرّف على نوع الملف بالذكاء الاصطناعي. جرّب ملف الدليل الموحد أو «استيراد الدليل الرسمي».", "AI could not recognise the file. Try the unified classification PDF or “Import the official guide”.") };
    }
  }

  const { kind: parsedKind, rows } = parseOccupationFile(text, kind);
  return previewFromRows(rows, parsedKind, lang, t);
}

function previewFromRows(
  rows: OccupationRow[],
  kind: OccupationFileKind,
  lang: "ar" | "en",
  t: (ar: string, en: string) => string,
  options?: { builtin?: boolean; withPayload?: boolean },
): OccupationPreview {
  if (!rows.length) {
    return {
      error: t(
        "لم يُعثر على مهن في الملف. ارفع «الدليل الموحد لتصنيف المهن» من وزارة العمل، أو استخدم «استيراد الدليل الرسمي».",
        "No occupations found. Upload the Ministry of Labour unified classification, or use “Import the official guide”.",
      ),
    };
  }
  const stats = occupationStats(rows);
  return {
    kind,
    kindLabel: kindLabel(kind, t),
    total: stats.total,
    byClass: stats.byClass,
    sample: rows.slice(0, 8).map((row) => ({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      classLabel: skillClassLabel(row.skillClass, lang) || "—",
    })),
    builtin: options?.builtin,
    payload: options?.withPayload === false ? undefined : encodeRows(rows),
  };
}

/** Built-in MoL unified guide (March 2026) shipped with the app — no PDF upload needed. */
export async function previewBuiltInOccupationGuide(): Promise<OccupationPreview> {
  await requireAdmin("/settings/hr?tab=jobs");
  const { lang, t } = await getI18n();
  const { BUILTIN_OCCUPATIONS } = await import("@/lib/data/mol-occupations");
  return previewFromRows(BUILTIN_OCCUPATIONS, "UNIFIED", lang, t, { builtin: true, withPayload: false });
}

export type OccupationImportResult = { added?: number; updated?: number; total?: number; error?: string; message?: string };

async function saveOccupationRows(
  companyId: string,
  userId: string,
  rows: OccupationRow[],
  t: (ar: string, en: string) => string,
): Promise<OccupationImportResult> {
  const existing = await prisma.jobTitle.findMany({
    where: { companyId },
    select: { id: true, code: true, nameAr: true, nameEn: true, skillClass: true },
  });
  const byCode = new Map(existing.filter((row) => row.code).map((row) => [row.code!, row]));
  const byName = new Map(existing.map((row) => [row.nameAr, row]));

  const toCreate: { companyId: string; code: string; nameAr: string; nameEn: string | null; skillClass: string | null }[] = [];
  const toUpdate: { id: string; nameAr: string; nameEn: string | null; code: string; skillClass: string | null }[] = [];
  const usedNames = new Set<string>();

  for (const row of rows) {
    const nameAr = row.nameAr.slice(0, 120);
    if (usedNames.has(nameAr) && !byCode.has(row.code)) continue;
    usedNames.add(nameAr);
    const nameEn = row.nameEn ? row.nameEn.slice(0, 120) : null;
    const skillClass = row.skillClass || null;
    const sameCode = byCode.get(row.code);
    if (sameCode) {
      if (sameCode.nameAr !== nameAr || sameCode.nameEn !== nameEn || sameCode.skillClass !== skillClass) {
        toUpdate.push({ id: sameCode.id, nameAr, nameEn, code: row.code, skillClass });
      }
      continue;
    }
    const sameName = byName.get(nameAr);
    if (sameName && !sameName.code) {
      toUpdate.push({ id: sameName.id, nameAr, nameEn: nameEn || sameName.nameEn, code: row.code, skillClass });
      byCode.set(row.code, { ...sameName, code: row.code });
      continue;
    }
    if (sameName?.code && sameName.code !== row.code) continue;
    toCreate.push({ companyId, code: row.code, nameAr, nameEn, skillClass });
  }

  let added = 0;
  let updated = 0;
  const chunk = 200;
  for (let i = 0; i < toCreate.length; i += chunk) {
    const batch = toCreate.slice(i, i + chunk);
    const result = await prisma.jobTitle.createMany({ data: batch, skipDuplicates: true });
    added += result.count;
  }
  for (let i = 0; i < toUpdate.length; i += chunk) {
    const batch = toUpdate.slice(i, i + chunk);
    await prisma.$transaction([
      ...batch.map((row) =>
        prisma.jobTitle.update({
          where: { id: row.id },
          data: { nameAr: row.nameAr, nameEn: row.nameEn, code: row.code, skillClass: row.skillClass },
        }),
      ),
      ...batch.map((row) =>
        prisma.employee.updateMany({
          where: { companyId, jobTitleId: row.id },
          data: { jobTitle: row.nameAr, jobTitleEn: row.nameEn, jobCode: row.code, jobClass: row.skillClass },
        }),
      ),
    ]);
    updated += batch.length;
  }

  await writeAudit({
    userId,
    action: "OCCUPATION_IMPORT",
    message: t(
      `استورد دليل المهن: أُضيف ${added} وحُدّث ${updated} من أصل ${rows.length}`,
      `Imported occupation guide: added ${added}, updated ${updated} of ${rows.length}`,
    ),
  });
  refreshAll();
  return {
    added,
    updated,
    total: rows.length,
    message: t(
      `تم الاستيراد: أُضيف ${added} مسماً وحُدّث ${updated} (من ${rows.length} في الملف).`,
      `Imported: added ${added} and updated ${updated} (of ${rows.length} in the file).`,
    ),
  };
}

/** Saves the occupations from a previous PDF preview into the company's job-title catalog. */
export async function importOccupationGuide(formData: FormData): Promise<OccupationImportResult> {
  const user = await requireAdmin("/settings/hr?tab=jobs");
  const { t } = await getI18n();
  if (String(formData.get("builtin") || "") === "1") {
    const { BUILTIN_OCCUPATIONS } = await import("@/lib/data/mol-occupations");
    return saveOccupationRows(user.companyId, user.id, BUILTIN_OCCUPATIONS, t);
  }
  const rows = decodeRows(String(formData.get("payload") || ""));
  if (!rows?.length) return { error: t("لا توجد مهن للحفظ. أعد قراءة الملف.", "No occupations to save. Read the file again.") };
  return saveOccupationRows(user.companyId, user.id, rows, t);
}
