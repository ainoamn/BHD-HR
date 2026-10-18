"use server";

import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { BUILTIN_OCCUPATION_META } from "@/lib/data/mol-occupations-meta";
import { refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { skillClassLabel, type OccupationRow } from "@/lib/occupation-guide";
import {
  decodeOccupationRows,
  normalizeOccupationRows,
  occupationKindLabel,
  type OccupationPreview,
} from "@/lib/occupation-preview";
import { prisma } from "@/lib/prisma";

export type OccupationImportResult = { added?: number; updated?: number; total?: number; error?: string; message?: string };

/** Instant preview from lightweight meta — never loads the 4k-row JSON until save. */
export async function previewBuiltInOccupationGuide(): Promise<OccupationPreview> {
  await requireAdmin("/settings/hr?tab=jobs");
  const { lang, t } = await getI18n();
  return {
    kind: "UNIFIED",
    kindLabel: occupationKindLabel("UNIFIED", t),
    total: BUILTIN_OCCUPATION_META.total,
    byClass: { ...BUILTIN_OCCUPATION_META.byClass },
    sample: BUILTIN_OCCUPATION_META.sample.map((row) => ({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      classLabel: skillClassLabel(row.skillClass, lang) || "—",
    })),
    builtin: true,
  };
}

async function loadDraftRows(companyId: string, draftId: string): Promise<OccupationRow[] | null> {
  if (!draftId.startsWith("occ-draft-") || draftId.includes("/") || draftId.includes("\\")) return null;
  const file = await prisma.storedFile.findFirst({
    where: { companyId, name: draftId, mime: "application/json" },
    select: { data: true },
  });
  if (!file) return null;
  try {
    const parsed = JSON.parse(Buffer.from(file.data).toString("utf8"));
    if (!Array.isArray(parsed)) return null;
    return normalizeOccupationRows(parsed);
  } catch {
    return null;
  }
}

async function clearDraft(companyId: string, draftId: string) {
  if (!draftId.startsWith("occ-draft-")) return;
  await prisma.storedFile.deleteMany({ where: { companyId, name: draftId } });
}

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

  if (toCreate.length) {
    // One round-trip for the full create set (Postgres handles ~4k rows fine).
    const result = await prisma.jobTitle.createMany({ data: toCreate, skipDuplicates: true });
    added = result.count;
  }

  const chunk = 40;
  for (let i = 0; i < toUpdate.length; i += chunk) {
    const batch = toUpdate.slice(i, i + chunk);
    await Promise.all(
      batch.flatMap((row) => [
        prisma.jobTitle.update({
          where: { id: row.id },
          data: { nameAr: row.nameAr, nameEn: row.nameEn, code: row.code, skillClass: row.skillClass },
        }),
        prisma.employee.updateMany({
          where: { companyId, jobTitleId: row.id },
          data: { jobTitle: row.nameAr, jobTitleEn: row.nameEn, jobCode: row.code, jobClass: row.skillClass },
        }),
      ]),
    );
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

/** Saves occupations from a PDF draft, legacy payload, or the bundled official guide when `builtin=1`. */
export async function importOccupationGuide(formData: FormData): Promise<OccupationImportResult> {
  const user = await requireAdmin("/settings/hr?tab=jobs");
  const { t } = await getI18n();
  if (String(formData.get("builtin") || "") === "1") {
    const { BUILTIN_OCCUPATIONS } = await import("@/lib/data/mol-occupations");
    return saveOccupationRows(user.companyId, user.id, BUILTIN_OCCUPATIONS, t);
  }

  const draftId = String(formData.get("draftId") || "").trim();
  if (draftId) {
    const rows = await loadDraftRows(user.companyId, draftId);
    if (!rows?.length) return { error: t("انتهت صلاحية معاينة الملف. ارفع الملف مجدداً.", "The file preview expired. Upload the file again.") };
    try {
      return await saveOccupationRows(user.companyId, user.id, rows, t);
    } finally {
      await clearDraft(user.companyId, draftId);
    }
  }

  const rows = decodeOccupationRows(String(formData.get("payload") || ""));
  if (!rows?.length) return { error: t("لا توجد مهن للحفظ. أعد قراءة الملف.", "No occupations to save. Read the file again.") };
  return saveOccupationRows(user.companyId, user.id, rows, t);
}
