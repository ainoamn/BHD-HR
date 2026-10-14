import { describe, expect, it } from "vitest";
import { checkRow, matchHeader, parseCsv, readDate, readTable } from "@/lib/employee-import";

describe("headers", () => {
  it("matches Arabic, English, keys and the template's two-language headers", () => {
    expect(matchHeader("الاسم الكامل")).toBe("fullName");
    expect(matchHeader("Full Name")).toBe("fullName");
    expect(matchHeader("انتهاء الجواز / Passport expiry")).toBe("passportExpiry");
    expect(matchHeader("passportNumber")).toBe("passportNumber");
    expect(matchHeader("ملاحظة")).toBeNull();
  });
});

describe("dates", () => {
  it("reads ISO, day-first and Excel serial dates", () => {
    expect(readDate("2027-03-05")).toBe("2027-03-05");
    expect(readDate("05/03/2027")).toBe("2027-03-05");
    expect(readDate("46000")).toBe("2025-12-09");
    expect(readDate("31/02/2027")).toBeNull();
    expect(readDate("soon")).toBeNull();
  });
});

describe("rows", () => {
  it("cleans values and reports problems in both languages", () => {
    const row = checkRow({ fullName: "تجربة الاستيراد", nationality: "India", gender: "ذكر", basicSalary: "1,250.5", bankBic: "BMUSOMRX", passportExpiry: "2030-01-01" }, 2);
    expect(row.errors).toEqual([]);
    expect(row.values).toMatchObject({ nationality: "IN", gender: "MALE", basicSalary: "1250.5", bankBic: "BMUSOMRX", passportExpiry: "2030-01-01" });
    const bad = checkRow({ fullName: "", nationality: "Atlantis", email: "nope" }, 3);
    expect(bad.errors.length).toBe(3);
  });

  it("skips empty rows and flags the same passport twice", () => {
    const { rows, missingName, ignored } = readTable([
      ["Full name", "Passport number", "Extra"],
      ["One", "P1", "x"],
      ["", "", ""],
      ["Two", "p1", ""],
    ]);
    expect(missingName).toBe(false);
    expect(ignored).toEqual(["Extra"]);
    expect(rows.map((row) => row.line)).toEqual([2, 4]);
    expect(rows[1].errors[0]).toContain("2");
  });

  it("needs a name column", () => {
    expect(readTable([["Phone"], ["123"]]).missingName).toBe(true);
  });
});

describe("csv", () => {
  it("handles quotes, semicolons and a BOM", () => {
    expect(parseCsv('\uFEFFname;note\r\n"Ali; Jr";"said ""hi"""\n')).toEqual([
      ["name", "note"],
      ["Ali; Jr", 'said "hi"'],
    ]);
  });
});
