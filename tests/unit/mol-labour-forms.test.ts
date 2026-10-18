import { describe, expect, it } from "vitest";
import type { LabourWorker } from "@/lib/ai";
import { applyMolLabourWorkerRules, detectMolLabourForm, molLabourFormLabel, summarizeMolWorkers } from "@/lib/mol-labour-forms";

const blank = (): LabourWorker =>
  ({
    fullName: "Test",
    nameEn: "",
    nationality: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    idNumber: "1",
    idExpiry: "2030-01-01",
    passportNumber: "P1",
    passportExpiry: "",
    residenceNumber: "R1",
    residenceExpiry: "2028-01-01",
    visaNumber: "V1",
    visaExpiry: "2027-01-01",
    workPermitNumber: "W1",
    workPermitExpiry: "2027-06-01",
    jobTitle: "",
    jobTitleEn: "",
    arrivalDate: "2025-01-01",
    joiningDate: "2025-02-01",
    contractEnd: "",
    basicSalary: "",
    housingAllowance: "",
    transportAllowance: "",
    address: "",
    employerName: "",
    employerNameEn: "",
    employerIdNumber: "",
    employerKind: "",
  }) as LabourWorker;

describe("mol labour forms", () => {
  it("detects official portal printout kinds from titles", () => {
    expect(detectMolLabourForm("تسجيل بيانات العامل — منشأة")).toBe("REGISTER_WORKER");
    expect(detectMolLabourForm("Registering Worker Details")).toBe("REGISTER_WORKER");
    expect(detectMolLabourForm("تصريح مزاولة العمل التجاري")).toBe("WORK_PERMIT");
    expect(detectMolLabourForm("بطاقة العمل للعامل")).toBe("LABOUR_CARD");
    expect(detectMolLabourForm("قائمة عمال المنشأة")).toBe("WORKER_LIST");
    expect(detectMolLabourForm("عقد عمل محدد المدة")).toBe("CONTRACT");
    expect(detectMolLabourForm("تجديد بيانات القوى العاملة غير العمانية")).toBe("RENEWAL");
  });

  it("labels forms in both languages", () => {
    expect(molLabourFormLabel("WORK_PERMIT", "ar")).toContain("تصريح");
    expect(molLabourFormLabel("REGISTER_WORKER", "en")).toMatch(/Registering/i);
  });

  it("clears expat-only fields for Omanis and keeps civil ID", () => {
    const omani = applyMolLabourWorkerRules({ ...blank(), nationality: "OM" });
    expect(omani).toMatchObject({
      idNumber: "1",
      idExpiry: "2030-01-01",
      residenceNumber: "",
      residenceExpiry: "",
      visaNumber: "",
      workPermitNumber: "",
      arrivalDate: "",
    });
  });

  it("keeps residence number from civil ID for expatriates", () => {
    const expat = applyMolLabourWorkerRules({ ...blank(), nationality: "IN", residenceNumber: "" });
    expect(expat.residenceNumber).toBe("1");
    expect(expat.workPermitNumber).toBe("W1");
  });

  it("summarises Omani vs expatriate counts", () => {
    expect(summarizeMolWorkers([{ nationality: "OM" }, { nationality: "IN" }, { nationality: "" }, { nationality: "PK" }])).toEqual({
      omani: 1,
      expat: 2,
      unknown: 1,
      total: 4,
    });
  });
});
