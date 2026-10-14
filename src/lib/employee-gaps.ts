import type { Bi } from "./i18n";

/** What an employee's file needs for payroll, WPS and expiry alerts; non-Omanis also need a passport, sponsor and work permit. */
export const GAP_LABEL = {
  nationality: { ar: "الجنسية", en: "Nationality" },
  gender: { ar: "الجنس", en: "Gender" },
  dateOfBirth: { ar: "تاريخ الميلاد", en: "Date of birth" },
  phone: { ar: "الهاتف", en: "Phone" },
  idNumber: { ar: "رقم البطاقة", en: "ID number" },
  idExpiry: { ar: "انتهاء البطاقة", en: "ID expiry" },
  passportNumber: { ar: "رقم الجواز", en: "Passport number" },
  passportExpiry: { ar: "انتهاء الجواز", en: "Passport expiry" },
  employer: { ar: "الكفيل", en: "Sponsor" },
  workPermit: { ar: "تصريح العمل", en: "Work permit" },
  jobTitle: { ar: "المسمى الوظيفي", en: "Job title" },
  joiningDate: { ar: "تاريخ الالتحاق", en: "Joining date" },
  basicSalary: { ar: "الراتب الأساسي", en: "Basic salary" },
  bank: { ar: "البنك ورقم الحساب", en: "Bank and account" },
} satisfies Record<string, Bi>;

export type GapKey = keyof typeof GAP_LABEL;

export type GapInput = {
  nationality: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  phone: string | null;
  idNumber: string | null;
  idExpiry: Date | null;
  passportNumber: string | null;
  passportExpiry: Date | null;
  employerId: string | null;
  jobTitle: string | null;
  joiningDate: Date | null;
  basicSalary: number;
  bankBic: string | null;
  bankAccount: string | null;
  /** Unknown (undefined) skips the work permit check. */
  hasWorkPermit?: boolean;
};

const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());

export function profileGaps(employee: GapInput): GapKey[] {
  const gaps: GapKey[] = [];
  for (const key of ["nationality", "gender", "dateOfBirth", "phone", "idNumber", "idExpiry"] as const) {
    if (empty(employee[key])) gaps.push(key);
  }
  const expatriate = !empty(employee.nationality) && employee.nationality !== "OM";
  if (expatriate) {
    if (empty(employee.passportNumber)) gaps.push("passportNumber");
    if (empty(employee.passportExpiry)) gaps.push("passportExpiry");
    if (empty(employee.employerId)) gaps.push("employer");
    if (employee.hasWorkPermit === false) gaps.push("workPermit");
  }
  if (empty(employee.jobTitle)) gaps.push("jobTitle");
  if (empty(employee.joiningDate)) gaps.push("joiningDate");
  if (!(employee.basicSalary > 0)) gaps.push("basicSalary");
  if (empty(employee.bankBic) || empty(employee.bankAccount)) gaps.push("bank");
  return gaps;
}
