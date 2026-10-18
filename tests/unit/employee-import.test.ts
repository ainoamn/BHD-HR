import { describe, expect, it } from "vitest";
import { normalizeLabourWorker } from "@/lib/ai";
import { profileGaps } from "@/lib/employee-gaps";
import { checkRow, findHeaderRow, headerKeys, matchHeader, parseCsv, readDate, readEmployerKind, readTable } from "@/lib/employee-import";

describe("headers", () => {
  it("matches Arabic, English, keys and the template's two-language headers", () => {
    expect(matchHeader("الاسم الكامل")).toBe("fullName");
    expect(matchHeader("Full Name")).toBe("fullName");
    expect(matchHeader("انتهاء الجواز / Passport expiry")).toBe("passportExpiry");
    expect(matchHeader("passportNumber")).toBe("passportNumber");
    expect(matchHeader("رقم التأشيرة")).toBe("visaNumber");
    expect(matchHeader("رقم بطاقة الاقامة")).toBe("residenceNumber");
    expect(matchHeader("عنوان العامل")).toBe("address");
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

describe("ministry of labour sheets", () => {
  it("finds the header below title rows and reads the ministry's column names", () => {
    const { rows, missingName } = readTable([
      ["وزارة العمل — قائمة العمال"],
      ["اسم المنشأة: شركة تجربة", ""],
      ["م", "اسم العامل", "الرقم المدني", "الجنسية", "المهنة", "رقم ترخيص العمل", "تاريخ انتهاء الترخيص", "اسم صاحب العمل", "السجل التجاري"],
      ["1", "عامل تجريبي", "12345678", "Pakistani", "عامل بناء", "WP-77", "31/12/2027", "شركة تجربة", "1234567"],
      ["م", "اسم العامل", "الرقم المدني", "", "", "", "", "", ""],
      ["2", "", "", "", "", "", "", "", ""],
    ]);
    expect(missingName).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(4);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values).toMatchObject({
      fullName: "عامل تجريبي",
      idNumber: "12345678",
      nationality: "PK",
      jobTitle: "عامل بناء",
      workPermitNumber: "WP-77",
      workPermitExpiry: "2027-12-31",
      employerName: "شركة تجربة",
      employerIdNumber: "1234567",
    });
  });

  it("uses each field once and accepts an English name alone", () => {
    expect(headerKeys(["Name", "Worker name", "Phone"])).toEqual(["fullName", null, "phone"]);
    const { rows } = readTable([["Name English", "Civil No"], ["Test Worker", "99"]]);
    expect(rows[0].values).toMatchObject({ fullName: "Test Worker", nameEn: "Test Worker", idNumber: "99" });
    expect(findHeaderRow([["x"], ["y"], ["الاسم الكامل", "الجنسية"]])).toBe(2);
  });

  it("reads the sponsor type", () => {
    expect(readEmployerKind("شركة")).toBe("COMPANY");
    expect(readEmployerKind("Individual")).toBe("PERSON");
    expect(readEmployerKind("فرد")).toBe("PERSON");
    expect(readEmployerKind("?")).toBe("");
  });
});

describe("missing details", () => {
  const base = {
    nationality: "OM",
    gender: "MALE",
    dateOfBirth: new Date("1990-01-01"),
    phone: "96890000000",
    idNumber: "1",
    idExpiry: new Date("2030-01-01"),
    passportNumber: null,
    passportExpiry: null,
    employerId: null,
    jobTitle: "Clerk",
    joiningDate: new Date("2024-01-01"),
    basicSalary: 500,
    bankBic: "BMUSOMRX",
    bankAccount: "1",
  };

  it("asks Omanis only for the common details", () => {
    expect(profileGaps(base)).toEqual([]);
    expect(profileGaps({ ...base, phone: " ", basicSalary: 0, bankAccount: null })).toEqual(["phone", "basicSalary", "bank"]);
  });

  it("asks expatriates for passport, sponsor and work permit", () => {
    expect(profileGaps({ ...base, nationality: "IN", hasWorkPermit: false })).toEqual(["passportNumber", "passportExpiry", "employer", "workPermit"]);
    expect(profileGaps({ ...base, nationality: "IN", passportNumber: "P", passportExpiry: new Date(), employerId: "e" })).toEqual([]);
  });
});

describe("labour file values", () => {
  it("keeps clean values and drops malformed ones", () => {
    const worker = normalizeLabourWorker({
      fullName: "  عامل   تجريبي ",
      nationality: "in",
      gender: "male",
      dateOfBirth: "1990-13-01",
      idExpiry: "2028-02-29",
      basicSalary: "OMR 325.500",
      housingAllowance: "OMR 50",
      transportAllowance: "bad",
      idNumber: "12 34 56",
      visaNumber: "V 99 1",
      visaExpiry: "2029-06-15",
      address: "  مسقط  ",
      employerKind: "company",
      jobTitle: 7,
    });
    expect(worker).toMatchObject({
      fullName: "عامل تجريبي",
      nationality: "IN",
      gender: "MALE",
      dateOfBirth: "",
      idExpiry: "2028-02-29",
      basicSalary: "325.5",
      housingAllowance: "50",
      transportAllowance: "",
      idNumber: "123456",
      residenceNumber: "123456",
      residenceExpiry: "",
      visaNumber: "V991",
      visaExpiry: "2029-06-15",
      address: "مسقط",
      employerKind: "COMPANY",
      jobTitle: "7",
    });
    expect(worker.passportNumber).toBe("");
  });

  it("does not copy the civil number onto residence for Omanis", () => {
    const worker = normalizeLabourWorker({ fullName: "مواطن", nationality: "OM", idNumber: "111", idExpiry: "2030-01-01" });
    expect(worker).toMatchObject({ residenceNumber: "", residenceExpiry: "", idNumber: "111" });
  });

  it("keeps an explicit residence number over the civil number", () => {
    const worker = normalizeLabourWorker({
      fullName: "Worker",
      nationality: "PK",
      idNumber: "111",
      idExpiry: "2030-01-01",
      residenceNumber: "R-222",
      residenceExpiry: "2027-05-01",
    });
    expect(worker).toMatchObject({ residenceNumber: "R-222", residenceExpiry: "2027-05-01" });
  });

  it("does not copy civil ID expiry onto residence, and strips visa/permit dates misfiled as ID expiry", () => {
    const worker = normalizeLabourWorker({
      fullName: "Worker",
      nationality: "IN",
      idNumber: "128210261",
      idExpiry: "2024-10-22",
      visaExpiry: "2024-10-22",
      workPermitExpiry: "2027-01-18",
      arrivalDate: "2025-01-19",
      joiningDate: "2025-01-19",
    });
    expect(worker).toMatchObject({
      residenceNumber: "128210261",
      residenceExpiry: "",
      idExpiry: "",
      visaExpiry: "2024-10-22",
      workPermitExpiry: "2027-01-18",
      arrivalDate: "2025-01-19",
      joiningDate: "",
    });
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
