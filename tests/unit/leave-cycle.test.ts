import { describe, expect, it } from "vitest";
import { computeLeaveBalances, cycleFigures } from "@/lib/leave";

const today = new Date("2026-10-14T08:00:00Z");
const used = (entries: [number, number][]) => new Map(entries);

describe("yearly leave", () => {
  it("gives the full days each year and carries what is left up to the cap", () => {
    const figures = cycleFigures({ days: 30, cycle: "YEARLY", carryCap: 10, joiningDate: new Date("2024-01-05"), usedByYear: used([[2024, 20], [2025, 5]]), today });
    expect(figures.carried).toBe(10);
    expect(figures.forfeited).toBe(25);
    expect(figures.earned).toBe(30);
  });

  it("pro-rates the joining year", () => {
    const figures = cycleFigures({ days: 30, cycle: "YEARLY", carryCap: null, joiningDate: new Date("2025-07-01"), usedByYear: used([]), today });
    expect(figures.carried).toBe(15);
    expect(figures.earned).toBe(30);
  });

  it("carries a negative balance in full", () => {
    const figures = cycleFigures({ days: 30, cycle: "YEARLY", carryCap: 5, joiningDate: new Date("2025-01-01"), usedByYear: used([[2025, 33]]), today });
    expect(figures.carried).toBe(-3);
    expect(figures.forfeited).toBe(0);
  });
});

describe("monthly accrual", () => {
  it("earns days ÷ 12 per month up to the current month", () => {
    const figures = cycleFigures({ days: 30, cycle: "MONTHLY", carryCap: null, joiningDate: new Date("2026-03-10"), usedByYear: used([[2026, 4]]), today });
    expect(figures.earned).toBe(20);
    expect(figures.used).toBe(4);
    expect(figures.carried).toBe(0);
  });

  it("counts leave booked for next year now", () => {
    const figures = cycleFigures({ days: 24, cycle: "MONTHLY", carryCap: null, joiningDate: new Date("2026-01-01"), usedByYear: used([[2027, 3]]), today });
    expect(figures.used).toBe(3);
  });
});

describe("balances with cycles", () => {
  const types = [
    { key: "annual", nameAr: "سنوية", nameEn: "Annual", days: 30, allJobs: true, jobTitleIds: [], cycle: "YEARLY", carryCap: 15 },
    { key: "sick", nameAr: "مرضية", nameEn: "Sick", days: 10, allJobs: true, jobTitleIds: [] },
  ];

  it("keeps fixed types lifetime and gives yearly types their year", () => {
    const employee = { jobTitleId: null, leaveDays: null, joiningDate: new Date("2025-01-01") };
    const attendance = [
      { type: "LEAVE", balanceKey: "annual", date: new Date("2025-06-01T12:00:00Z") },
      { type: "LEAVE", balanceKey: "annual", date: new Date("2026-02-01T12:00:00Z") },
      { type: "SICK", balanceKey: "sick", date: new Date("2025-03-01T12:00:00Z") },
    ];
    const [annual, sick] = computeLeaveBalances(employee, attendance, [{ balanceKey: "annual", days: 2 }], types, today);
    expect(annual).toMatchObject({ cycle: "YEARLY", carried: 15, earned: 30, entitlement: 45, used: 1, added: 2, remaining: 46, forfeited: 14 });
    expect(sick).toMatchObject({ cycle: "ONCE", entitlement: 10, used: 1, remaining: 9 });
  });
});
