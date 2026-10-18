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

export function encodeOccupationRows(rows: OccupationRow[]) {
  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64url");
}

export function decodeOccupationRows(payload: string): OccupationRow[] | null {
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

export function occupationPreviewFromRows(
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
    payload: options?.withPayload === false ? undefined : encodeOccupationRows(rows),
  };
}
