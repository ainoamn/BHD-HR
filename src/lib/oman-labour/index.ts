export {
  REGULATION_CATEGORY_LABEL,
  SYSTEM_REGULATIONS,
  systemRegulationById,
  type RegulationCategory,
  type SystemRegulation,
} from "./regulations";
export { OMAN_PENALTY_CLAUSES, omanPenaltyByCode, type OmanPenaltyClause } from "./penalties";

import { OMAN_PENALTY_CLAUSES, type OmanPenaltyClause } from "./penalties";
import type { LetterKind } from "@/lib/letters";

export type WarningCause = {
  code: string;
  titleAr: string;
  titleEn: string;
  /** Shown under the title when picking a cause. */
  detailAr: string;
  detailEn: string;
  defaultKind: LetterKind;
  source: "oman" | "company";
  category?: OmanPenaltyClause["category"];
};

/** Ready causes for the letter form: Oman MD 618/2024 clauses + optional company extras. */
export function warningCauses(company: { code: string; titleAr: string; titleEn: string | null; detailAr: string | null; detailEn: string | null; defaultKind: string | null; active: boolean }[] = []): WarningCause[] {
  const oman: WarningCause[] = OMAN_PENALTY_CLAUSES.map((clause) => ({
    code: clause.code,
    titleAr: `${clause.number}. ${clause.titleAr}`,
    titleEn: `${clause.number}. ${clause.titleEn}`,
    detailAr: `الجزاءات التصاعدية: ${clause.sanctions.join(" ← ")}`,
    detailEn: `Graduated sanctions: ${clause.sanctions.join(" → ")}`,
    defaultKind: clause.defaultKind,
    source: "oman",
    category: clause.category,
  }));
  const custom: WarningCause[] = company
    .filter((item) => item.active)
    .map((item) => ({
      code: item.code.startsWith("CO-") ? item.code : `CO-${item.code}`,
      titleAr: item.titleAr,
      titleEn: item.titleEn || item.titleAr,
      detailAr: item.detailAr || "مسبب من النظام الداخلي للمنشأة",
      detailEn: item.detailEn || "Cause from the company's internal policy",
      defaultKind: (item.defaultKind as LetterKind) || "WARNING_1",
      source: "company" as const,
    }));
  return [...oman, ...custom];
}

export function formatCauseReason(cause: WarningCause, occurrence: 1 | 2 | 3 | 4 = 1) {
  const clause = cause.source === "oman" ? OMAN_PENALTY_CLAUSES.find((c) => c.code === cause.code) : null;
  const sanction = clause ? clause.sanctions[occurrence - 1] : null;
  const ar = [
    `المخالفة وفق لائحة الجزاءات (${cause.code}): ${cause.titleAr.replace(/^\d+\.\s*/, "")}`,
    sanction ? `الجزاء المقترح للمرة ${occurrence}: ${sanction}` : null,
    "مرجع: القرار الوزاري 618/2024 وقانون العمل 53/2023.",
  ]
    .filter(Boolean)
    .join("\n");
  const en = [
    `Violation under the sanctions schedule (${cause.code}): ${cause.titleEn.replace(/^\d+\.\s*/, "")}`,
    sanction ? `Suggested sanction for occurrence ${occurrence}: ${sanction}` : null,
    "Reference: Ministerial Decision 618/2024 and Labour Law RD 53/2023.",
  ]
    .filter(Boolean)
    .join("\n");
  return { ar, en };
}
