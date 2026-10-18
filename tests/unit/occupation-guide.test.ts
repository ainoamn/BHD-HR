import { describe, expect, it } from "vitest";
import {
  detectOccupationFile,
  ensureUniqueOccupationNames,
  finalizeOccupationRow,
  normalizeJobNameKey,
  parseComparisonOccupations,
  parseOccupationFile,
  parseUnifiedOccupations,
  prepareOccupationRows,
  skillClassLabel,
} from "@/lib/occupation-guide";

const UNIFIED_SAMPLE = `
-- 1 of 2 --

التصنيف
Classification
رمز المهنة	الاسم	(	باللغة العربية	)	الاسم	(	باللغة الإنجليزية	)
1120001001	رئيس مجلس إدارة	Board of Directors Chairman
1120002001	رئيس تنفيذي	Chief Executive Officer
الفئة الأولى	/	First Class
60
300

-- 2 of 2 --

رمز المهنة	الاسم	(	باللغة العربية	)	الاسم	(	باللغة الإنجليزية	)
الفئة الثانية	/	Second Class
45
250
1411005001	مدير وحدة الغسيل الجاف	Laundry Unit Manager
2163008001	مصمم ديكور حرفي	Craftsman Decorator Designer
`;

const COMPARISON_SAMPLE = `
المهن بالتصنيف المهني القديم	الرمزالمهني القديم	الرمزالمهني الجديد	المهن المقابلة بالتصنيف المهني الجديد
رئيس مجلس ادارة	0111021	1120001001	رئيس مجلس إدارة
مدير عام	0111031	1120005001	مدير عام
`;

describe("occupation guide", () => {
  it("detects the unified MoL guide and the comparison sheet", () => {
    expect(detectOccupationFile(UNIFIED_SAMPLE)).toBe("UNIFIED");
    expect(detectOccupationFile(COMPARISON_SAMPLE)).toBe("COMPARISON");
    expect(detectOccupationFile("random payroll sheet")).toBe("UNKNOWN");
  });

  it("parses codes, bilingual names and skill classes from the unified guide", () => {
    const rows = parseUnifiedOccupations(UNIFIED_SAMPLE);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      code: "1120001001",
      nameAr: "رئيس مجلس إدارة",
      nameEn: "Board of Directors Chairman",
      skillClass: "1",
    });
    expect(rows.find((row) => row.code === "1411005001")).toMatchObject({ skillClass: "2", nameEn: "Laundry Unit Manager" });
    expect(skillClassLabel("1", "ar")).toContain("الأولى");
  });

  it("parses new codes from a comparison sheet", () => {
    const rows = parseComparisonOccupations(COMPARISON_SAMPLE);
    expect(rows).toEqual([
      { code: "1120001001", nameAr: "رئيس مجلس إدارة", nameEn: "", skillClass: "" },
      { code: "1120005001", nameAr: "مدير عام", nameEn: "", skillClass: "" },
    ]);
  });

  it("routes parseOccupationFile by detected kind", () => {
    expect(parseOccupationFile(UNIFIED_SAMPLE).kind).toBe("UNIFIED");
    expect(parseOccupationFile(COMPARISON_SAMPLE).rows).toHaveLength(2);
  });

  it("moves Arabic specialty out of the English column so names stay unique", () => {
    expect(
      finalizeOccupationRow({
        code: "2113001001",
        nameAr: "كيميائي",
        nameEn: "- عام General Chemist",
        skillClass: "1",
      }),
    ).toMatchObject({ nameAr: "كيميائي عام", nameEn: "General Chemist" });
    expect(
      finalizeOccupationRow({
        code: "1212002001",
        nameAr: "مدير توظيف",
        nameEn: "/ استخدام Employment Manager",
        skillClass: "1",
      }),
    ).toMatchObject({ nameAr: "مدير توظيف استخدام", nameEn: "Employment Manager" });
  });

  it("appends the code when Arabic names still collide after specialty merge", () => {
    const rows = ensureUniqueOccupationNames([
      { code: "1", nameAr: "مفتش", nameEn: "Inspector A", skillClass: "1" },
      { code: "2", nameAr: "مفتش", nameEn: "Inspector B", skillClass: "1" },
    ]);
    expect(rows.map((row) => row.nameAr)).toEqual(["مفتش", "مفتش (2)"]);
  });

  it("prepareOccupationRows yields unique Arabic names for the bundled guide sample", () => {
    const prepared = prepareOccupationRows([
      { code: "2113001001", nameAr: "كيميائي", nameEn: "- عام General Chemist", skillClass: "1" },
      { code: "2113002001", nameAr: "كيميائي", nameEn: "- عضوي Organic Chemist", skillClass: "2" },
    ]);
    expect(new Set(prepared.map((row) => row.nameAr)).size).toBe(2);
    expect(normalizeJobNameKey("  كيميائي  ")).toBe("كيميائي");
    expect(normalizeJobNameKey("الأول")).toBe(normalizeJobNameKey("الاول"));
  });
});
