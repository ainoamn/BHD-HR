import { STATUS_LABEL } from "./constants";
import { clip, num, parseDateInput, req, str } from "./utils";

export function readEmployeeInput(formData: FormData) {
  const status = req(formData, "status");
  const gender = str(formData, "gender");
  return {
    fullName: clip(req(formData, "fullName"), 150) || "",
    nameEn: clip(str(formData, "nameEn"), 150),
    nationality: clip(str(formData, "nationality"), 80),
    gender: gender === "MALE" || gender === "FEMALE" ? gender : null,
    dateOfBirth: parseDateInput(str(formData, "dateOfBirth")),
    phone: clip(str(formData, "phone"), 30),
    email: clip(str(formData, "email"), 120),
    address: clip(str(formData, "address"), 300),
    idNumber: clip(str(formData, "idNumber"), 40),
    idExpiry: parseDateInput(str(formData, "idExpiry")),
    passportNumber: clip(str(formData, "passportNumber"), 40),
    passportExpiry: parseDateInput(str(formData, "passportExpiry")),
    residenceNumber: clip(str(formData, "residenceNumber"), 40),
    residenceExpiry: parseDateInput(str(formData, "residenceExpiry")),
    jobTitle: clip(str(formData, "jobTitle"), 80),
    department: clip(str(formData, "department"), 80),
    joiningDate: parseDateInput(str(formData, "joiningDate")),
    contractEnd: parseDateInput(str(formData, "contractEnd")),
    status: STATUS_LABEL[status] ? status : "ACTIVE",
    annualLeaveDays: Math.max(0, num(formData, "annualLeaveDays")),
    sickLeaveDays: Math.max(0, num(formData, "sickLeaveDays")),
    otherLeaveDays: Math.max(0, num(formData, "otherLeaveDays")),
    basicSalary: Math.max(0, num(formData, "basicSalary")),
    housingAllowance: Math.max(0, num(formData, "housingAllowance")),
    transportAllowance: Math.max(0, num(formData, "transportAllowance")),
    otherAllowance: Math.max(0, num(formData, "otherAllowance")),
    notes: clip(str(formData, "notes"), 1000),
  };
}
