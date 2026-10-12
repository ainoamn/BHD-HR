import type { Company } from "@prisma/client";
import { findNationality } from "./nationalities";
import { round3 } from "./utils";

export function isOmani(nationality: string | null | undefined) {
  return findNationality(nationality)?.code === "OM";
}

export type SpfSettings = Pick<Company, "spfEnabled" | "spfEmployeeRate" | "spfEmployerRate" | "spfExpatEmployerRate" | "spfWageCap" | "spfBase">;

/**
 * Social Protection Fund contributions for one month. Omanis: employee and employer shares; non-Omanis: employer
 * share only (maternity and sick-leave insurance). Rates come from the company settings, defaults as published by
 * the fund in July 2026. The insured wage is capped (OMR 3,000 by default) and is not reduced for absence.
 */
export function spfContribution(settings: SpfSettings, omani: boolean, wage: { basic: number; gross: number }) {
  if (!settings.spfEnabled) return { insured: 0, employee: 0, employer: 0 };
  const raw = Math.max(0, settings.spfBase === "BASIC" ? wage.basic : wage.gross);
  const insured = round3(settings.spfWageCap > 0 ? Math.min(raw, settings.spfWageCap) : raw);
  return {
    insured,
    employee: omani ? round3((insured * settings.spfEmployeeRate) / 100) : 0,
    employer: round3((insured * (omani ? settings.spfEmployerRate : settings.spfExpatEmployerRate)) / 100),
  };
}

const DAY = 86400000;
/** Royal Decree 53/2023: service from this day earns a full basic wage per year; earlier service keeps the old rule. */
export const NEW_LABOUR_LAW = Date.UTC(2023, 6, 31);

export type Gratuity =
  | { eligible: false; reason: "OMANI" | "NO_DATES" }
  | { eligible: true; years: number; oldYears: number; newYears: number; months: number; amount: number; basic: number };

/**
 * End-of-service gratuity for a non-Omani (Labour Law art. 61): at least one month of the last basic wage per year of
 * service, fractions pro rata. Service before 31 July 2023 follows the previous law: 15 days a year for the first
 * three years, then a month a year. Omanis are covered by the Social Protection Fund instead.
 */
export function gratuity(input: { joiningDate: Date | null; endDate: Date; basicSalary: number; nationality: string | null }): Gratuity {
  if (isOmani(input.nationality)) return { eligible: false, reason: "OMANI" };
  if (!input.joiningDate || input.endDate.getTime() <= input.joiningDate.getTime()) return { eligible: false, reason: "NO_DATES" };
  const start = Math.floor(input.joiningDate.getTime() / DAY) * DAY;
  const end = Math.floor(input.endDate.getTime() / DAY) * DAY + DAY;
  const years = (end - start) / (365 * DAY);
  const oldYears = Math.max(0, (Math.min(end, NEW_LABOUR_LAW) - start) / (365 * DAY));
  const newYears = Math.max(0, years - oldYears);
  const halfRateYears = Math.min(oldYears, 3);
  const months = halfRateYears * 0.5 + (oldYears - halfRateYears) + newYears;
  return {
    eligible: true,
    years: round3(years),
    oldYears: round3(oldYears),
    newYears: round3(newYears),
    months: round3(months),
    amount: round3(months * input.basicSalary),
    basic: input.basicSalary,
  };
}

/** Years, months and days between two dates, for printing the service period. */
export function servicePeriod(from: Date, to: Date) {
  const end = new Date(to.getTime() + DAY);
  let years = end.getUTCFullYear() - from.getUTCFullYear();
  let months = end.getUTCMonth() - from.getUTCMonth();
  let days = end.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

/** Omani share of active staff, overall and per department. */
export function omanization(employees: { nationality: string | null; department: string | null; departmentEn: string | null }[]) {
  const total = employees.length;
  const omani = employees.filter((employee) => isOmani(employee.nationality)).length;
  const groups = new Map<string, { name: string; nameEn: string | null; total: number; omani: number }>();
  for (const employee of employees) {
    const key = employee.department || "";
    const group = groups.get(key) || { name: employee.department || "", nameEn: employee.departmentEn, total: 0, omani: 0 };
    group.total += 1;
    if (isOmani(employee.nationality)) group.omani += 1;
    groups.set(key, group);
  }
  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
  return {
    total,
    omani,
    percent: percent(omani, total),
    departments: [...groups.values()].map((group) => ({ ...group, percent: percent(group.omani, group.total) })).sort((a, b) => b.total - a.total),
  };
}
