import { ALLOWANCE_BASE, ALLOWANCE_FREQUENCY, FREQUENCY_MONTHS, monthName } from "./constants";
import { pick, type Lang } from "./i18n";
import { money, round3 } from "./utils";

export type AllowanceRule = {
  calc: string;
  base: string;
  value: number;
  frequency: string;
  payMonth: number;
  startYear: number;
  startMonth: number;
  active: boolean;
};

type Pay = { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number };

export const ALLOWANCE_CALCS = ["FIXED", "PERCENT"] as const;
export const ALLOWANCE_BASES = ["BASIC", "PACKAGE"] as const;
export const ALLOWANCE_FREQUENCIES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as const;

/** Monthly allowances fall due every month from the start; the others in payMonth and every 3, 6 or 12 months after it. */
export function allowanceDue(rule: AllowanceRule, year: number, month: number) {
  if (!rule.active) return false;
  if (year * 12 + month < rule.startYear * 12 + rule.startMonth) return false;
  const interval = FREQUENCY_MONTHS[rule.frequency] || 1;
  if (interval === 1) return true;
  return (((month - rule.payMonth) % interval) + interval) % interval === 0;
}

export function allowanceAmount(rule: Pick<AllowanceRule, "calc" | "base" | "value">, pay: Pay) {
  if (rule.calc !== "PERCENT") return round3(Math.max(0, rule.value));
  const base = rule.base === "PACKAGE" ? pay.basicSalary + pay.housingAllowance + pay.transportAllowance + pay.otherAllowance : pay.basicSalary;
  return round3(Math.max(0, (base * rule.value) / 100));
}

/** The months (1–12) a non-monthly allowance is paid in, starting from payMonth. */
export function payMonths(frequency: string, payMonth: number) {
  const interval = FREQUENCY_MONTHS[frequency] || 1;
  if (interval === 1) return [];
  return Array.from({ length: 12 / interval }, (_, index) => ((payMonth - 1 + index * interval) % 12) + 1).sort((a, b) => a - b);
}

export function describeAllowance(rule: Pick<AllowanceRule, "calc" | "base" | "value" | "frequency" | "payMonth">, lang: Lang, currency: string) {
  const amount = rule.calc === "PERCENT" ? `${rule.value}% ${pick(ALLOWANCE_BASE[rule.base], lang)}` : money(rule.value, currency);
  const months = payMonths(rule.frequency, rule.payMonth);
  const when = months.length ? ` (${months.map((month) => monthName(month, lang)).join(lang === "en" ? ", " : "، ")})` : "";
  return `${amount} — ${pick(ALLOWANCE_FREQUENCY[rule.frequency], lang, rule.frequency)}${when}`;
}
