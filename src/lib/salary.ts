import { round3 } from "./utils";

type Package = {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
};

export function packageGross(input: Package) {
  return round3(input.basicSalary + input.housingAllowance + input.transportAllowance + input.otherAllowance);
}

/** Package plus bonuses, extra allowances and entitlements of that month. */
export function totalEarnings(input: Package & { extraEarnings?: number | null }) {
  return round3(packageGross(input) + (input.extraEarnings || 0));
}

/** Absence, manual deductions, advance instalments and pay-item deductions of that month. */
export function totalDeductions(input: { absenceDeduction: number; otherDeduction: number; extraDeductions?: number | null }) {
  return round3(input.absenceDeduction + input.otherDeduction + (input.extraDeductions || 0));
}

export function calculateAbsenceDeduction(monthlySalary: number, absenceDays: number, daysInMonth = 30) {
  if (daysInMonth <= 0 || absenceDays <= 0) return 0;
  return round3((monthlySalary / daysInMonth) * absenceDays);
}

/** The absence deduction is based on the package only; bonuses and other pay items are not prorated. */
export function buildSalaryAmounts(
  input: Package & { absenceDays: number; otherDeduction: number; salaryDays: number; extraEarnings?: number; extraDeductions?: number },
) {
  const gross = packageGross(input);
  const absenceDeduction = calculateAbsenceDeduction(gross, input.absenceDays, input.salaryDays);
  const netSalary = round3(gross + (input.extraEarnings || 0) - absenceDeduction - input.otherDeduction - (input.extraDeductions || 0));
  return { gross, absenceDeduction, netSalary };
}
