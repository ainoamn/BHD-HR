import type { AllowanceRowValue } from "@/components/allowances-editor";
import { ALLOWANCE_BASES, ALLOWANCE_CALCS, ALLOWANCE_FREQUENCIES } from "./allowances";
import { cleanAccount, cleanBic } from "./banks";
import { STATUS_LABEL } from "./constants";
import { findNationality } from "./nationalities";
import { normalizePhone } from "./phone";
import { clip, num, parseDateInput, req, str } from "./utils";

export function readEmployeeInput(formData: FormData) {
  const status = req(formData, "status");
  const gender = str(formData, "gender");
  const nationality = str(formData, "nationality");
  return {
    fullName: clip(req(formData, "fullName"), 150) || "",
    nameEn: clip(str(formData, "nameEn"), 150),
    nationality: nationality ? findNationality(nationality)?.code || clip(nationality, 80) : null,
    gender: gender === "MALE" || gender === "FEMALE" ? gender : null,
    dateOfBirth: parseDateInput(str(formData, "dateOfBirth")),
    phone: clip(normalizePhone(str(formData, "phone")), 30),
    email: clip(str(formData, "email"), 120),
    address: clip(str(formData, "address"), 300),
    idNumber: clip(str(formData, "idNumber"), 40),
    idExpiry: parseDateInput(str(formData, "idExpiry")),
    passportNumber: clip(str(formData, "passportNumber"), 40),
    passportExpiry: parseDateInput(str(formData, "passportExpiry")),
    residenceNumber: clip(str(formData, "residenceNumber"), 40),
    residenceExpiry: parseDateInput(str(formData, "residenceExpiry")),
    joiningDate: parseDateInput(str(formData, "joiningDate")),
    contractEnd: parseDateInput(str(formData, "contractEnd")),
    status: STATUS_LABEL[status] ? status : "ACTIVE",
    basicSalary: Math.max(0, num(formData, "basicSalary")),
    housingAllowance: Math.max(0, num(formData, "housingAllowance")),
    transportAllowance: Math.max(0, num(formData, "transportAllowance")),
    otherAllowance: Math.max(0, num(formData, "otherAllowance")),
    bankBic: cleanBic(str(formData, "bankBic")),
    bankAccount: cleanAccount(str(formData, "bankAccount")),
    notes: clip(str(formData, "notes"), 1000),
  };
}

/** Days typed for each leave type; an empty box or the type's own default is not stored. */
export function readLeaveDays(formData: FormData, types: { key: string; days: number }[]) {
  const result: Record<string, number> = {};
  for (const type of types) {
    const raw = req(formData, `leave_${type.key}`);
    if (raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0 && value <= 366 && value !== type.days) result[type.key] = Math.round(value * 2) / 2;
  }
  return result;
}

/** Rows from the allowances editor, keeping only well-formed ones whose type is in `typeIds`. */
export function readAllowanceRows(formData: FormData, typeIds: Set<string>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(req(formData, "allowances") || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 50).flatMap((item: Partial<AllowanceRowValue>) => {
    if (!item || typeof item.allowanceTypeId !== "string" || !typeIds.has(item.allowanceTypeId)) return [];
    const match = /^(\d{4})-(\d{2})$/.exec(String(item.start || ""));
    const now = new Date();
    const startYear = match ? Number(match[1]) : now.getFullYear();
    const startMonth = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.getMonth() + 1;
    const calc = (ALLOWANCE_CALCS as readonly string[]).includes(String(item.calc)) ? String(item.calc) : "FIXED";
    const value = Math.max(0, Number(item.value) || 0);
    return [
      {
        id: typeof item.id === "string" ? item.id : undefined,
        allowanceTypeId: item.allowanceTypeId,
        calc,
        base: (ALLOWANCE_BASES as readonly string[]).includes(String(item.base)) ? String(item.base) : "BASIC",
        value: calc === "PERCENT" ? Math.min(value, 1000) : value,
        frequency: (ALLOWANCE_FREQUENCIES as readonly string[]).includes(String(item.frequency)) ? String(item.frequency) : "MONTHLY",
        payMonth: Math.min(12, Math.max(1, Math.round(Number(item.payMonth) || 1))),
        startYear,
        startMonth,
        active: item.active !== false,
      },
    ];
  });
}
