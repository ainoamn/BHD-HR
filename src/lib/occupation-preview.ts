import {
  occupationStats,
  skillClassLabel,
  type OccupationFileKind,
  type OccupationRow,
} from "@/lib/occupation-guide";

export type OccupationPreview = {
  kind?: OccupationFileKind;
  kindLabel?: string;
  total?: number;
  byClass?: Record<string, number>;
  sample?: { code: string; nameAr: string; nameEn: string; classLabel: string }[];
  /** @deprecated Prefer draftId — kept for older clients briefly. */
  payload?: string;
  /** StoredFile name holding parsed JSON rows (PDF path). */
  draftId?: string;
  /** Use the bundled MoL guide on save (no large payload round-trip). */
  builtin?: boolean;
  error?: string;
};

export function occupationKindLabel(kind: OccupationFileKind, t: (ar: string, en: string) => string) {
  if (kind === "UNIFIED") return t("الدليل الموحد لتصنيف المهن (وزارة العمل)", "Ministry of Labour unified occupation classification");
  if (kind === "COMPARISON") return t("مقارنة التصنيف القديم بالجديد", "Old–new occupation classification comparison");
  return t("ملف غير معروف", "Unknown file");
}

export function encodeOccupationRows(rows: OccupationRow[]) {
  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64url");
}

export function decodeOccupationRows(payload: string): OccupationRow[] | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return null;
    return normalizeOccupationRows(parsed);
  } catch {
    return null;
  }
}

export function normalizeOccupationRows(parsed: unknown[]): OccupationRow[] {
  return parsed
    .filter((row) => row && typeof row === "object" && typeof (row as OccupationRow).code === "string" && typeof (row as OccupationRow).nameAr === "string")
    .map((row) => {
      const item = row as OccupationRow;
      return {
        code: String(item.code).replace(/\s+/g, "").slice(0, 20),
        nameAr: String(item.nameAr).trim().slice(0, 120),
        nameEn: typeof item.nameEn === "string" ? item.nameEn.trim().slice(0, 120) : "",
        skillClass: ["1", "2", "3", "4", "5"].includes(item.skillClass) ? item.skillClass : "",
      };
    })
    .filter((row) => row.code && row.nameAr.length >= 2);
}

export function occupationPreviewFromRows(
  rows: OccupationRow[],
  kind: OccupationFileKind,
  lang: "ar" | "en",
  t: (ar: string, en: string) => string,
  options?: { builtin?: boolean; withPayload?: boolean; draftId?: string },
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
    kindLabel: occupationKindLabel(kind, t),
    total: stats.total,
    byClass: stats.byClass,
    sample: rows.slice(0, 8).map((row) => ({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      classLabel: skillClassLabel(row.skillClass, lang) || "—",
    })),
    builtin: options?.builtin,
    draftId: options?.draftId,
    payload: options?.withPayload === false || options?.draftId ? undefined : encodeOccupationRows(rows),
  };
}
