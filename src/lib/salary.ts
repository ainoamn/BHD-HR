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

export function calculateAbsenceDeduction(monthlySalary: number, absenceDays: number, daysInMonth = 30) {
  if (daysInMonth <= 0 || absenceDays <= 0) return 0;
  return round3((monthlySalary / daysInMonth) * absenceDays);
}

export function buildSalaryAmounts(input: Package & { absenceDays: number; otherDeduction: number; salaryDays: number }) {
  const gross = packageGross(input);
  const absenceDeduction = calculateAbsenceDeduction(gross, input.absenceDays, input.salaryDays);
  const netSalary = round3(gross - absenceDeduction - input.otherDeduction);
  return { gross, absenceDeduction, netSalary };
}
