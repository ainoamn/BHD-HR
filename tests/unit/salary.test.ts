import { describe, expect, it } from "vitest";
import { gratuity, servicePeriod, spfContribution } from "@/lib/oman";
import { monthKey, scheduledAmount } from "@/lib/pay-items";
import { buildSalaryAmounts, calculateAbsenceDeduction, packageGross } from "@/lib/salary";
import { round3 } from "@/lib/utils";

const pkg = { basicSalary: 400, housingAllowance: 100, transportAllowance: 50, otherAllowance: 25.5 };

describe("salary amounts", () => {
  it("adds the package", () => {
    expect(packageGross(pkg)).toBe(575.5);
  });

  it("deducts absence from the package only", () => {
    const amounts = buildSalaryAmounts({ ...pkg, absenceDays: 3, otherDeduction: 10, salaryDays: 30, extraEarnings: 50, extraDeductions: 20 });
    expect(amounts.gross).toBe(575.5);
    expect(amounts.absenceDeduction).toBe(round3((575.5 / 30) * 3));
    expect(amounts.netSalary).toBe(round3(575.5 + 50 - amounts.absenceDeduction - 10 - 20));
  });

  it("ignores zero days and empty months", () => {
    expect(calculateAbsenceDeduction(300, 0)).toBe(0);
    expect(calculateAbsenceDeduction(300, 2, 0)).toBe(0);
  });
});

describe("pay items", () => {
  const advance = { kind: "ADVANCE", amount: 100, startYear: 2026, startMonth: 1, months: 3, stoppedAt: null };

  it("splits an advance and the last instalment takes what is left", () => {
    const start = monthKey(2026, 1);
    expect(scheduledAmount(advance, start - 1)).toBe(0);
    expect(scheduledAmount(advance, start)).toBe(33.333);
    expect(scheduledAmount(advance, start + 1, 33.333)).toBe(33.333);
    expect(scheduledAmount(advance, start + 2, 66.666)).toBe(33.334);
    expect(scheduledAmount(advance, start + 5, 100)).toBe(0);
  });

  it("limits fixed-term items and stops stopped ones", () => {
    const bonus = { kind: "BONUS", amount: 20, startYear: 2026, startMonth: 1, months: 2, stoppedAt: null };
    expect(scheduledAmount(bonus, monthKey(2026, 2))).toBe(20);
    expect(scheduledAmount(bonus, monthKey(2026, 3))).toBe(0);
    expect(scheduledAmount({ ...bonus, stoppedAt: new Date() }, monthKey(2026, 1))).toBe(0);
  });
});

describe("social protection", () => {
  const settings = { spfEnabled: true, spfEmployeeRate: 7.5, spfEmployerRate: 10.5, spfExpatEmployerRate: 1, spfWageCap: 3000, spfBase: "GROSS" };

  it("charges both shares for Omanis and caps the wage", () => {
    expect(spfContribution(settings, true, { basic: 4000, gross: 5000 })).toEqual({ insured: 3000, employee: 225, employer: 315 });
  });

  it("charges only the employer for expatriates", () => {
    expect(spfContribution(settings, false, { basic: 300, gross: 500 })).toEqual({ insured: 500, employee: 0, employer: 5 });
  });

  it("is off when disabled", () => {
    expect(spfContribution({ ...settings, spfEnabled: false }, true, { basic: 300, gross: 500 }).employee).toBe(0);
  });
});

describe("end-of-service gratuity", () => {
  it("does not apply to Omanis", () => {
    expect(gratuity({ joiningDate: new Date("2020-01-01"), endDate: new Date("2026-01-01"), basicSalary: 500, nationality: "عماني" })).toEqual({
      eligible: false,
      reason: "OMANI",
    });
  });

  it("pays a full month per year under the new law", () => {
    const result = gratuity({ joiningDate: new Date(Date.UTC(2024, 0, 1)), endDate: new Date(Date.UTC(2025, 11, 30)), basicSalary: 365, nationality: "هندي" });
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.oldYears).toBe(0);
      expect(result.months).toBe(2);
      expect(result.amount).toBe(730);
    }
  });

  it("pays half a month for the first three old-law years", () => {
    const result = gratuity({ joiningDate: new Date(Date.UTC(2018, 0, 1)), endDate: new Date(Date.UTC(2023, 6, 30)), basicSalary: 300, nationality: "Indian" });
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.newYears).toBe(0);
      expect(result.months).toBeCloseTo(1.5 + (result.oldYears - 3), 3);
    }
  });

  it("measures the service period inclusively", () => {
    expect(servicePeriod(new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2022, 11, 31)))).toEqual({ years: 3, months: 0, days: 0 });
  });
});
