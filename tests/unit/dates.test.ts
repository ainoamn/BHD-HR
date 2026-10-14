import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { distanceMeters, lateMinutes, muscatDay, parseWorkStart, validCoords, workedLabel } from "@/lib/clock";
import { describeExpiry, worstExpiry } from "@/lib/expiry";
import { countInclusiveDays, computeLeaveBalances, leaveWarnings } from "@/lib/leave";
import { daysPhrase, parseDateInput, safeReturn, toDateInput } from "@/lib/utils";

const limits = { urgent: 30, warning: 60, early: 90 };

describe("expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10, 9));
  });
  afterEach(() => vi.useRealTimers());

  it("grades the remaining days", () => {
    expect(describeExpiry(null, limits).key).toBe("none");
    expect(describeExpiry(new Date(Date.UTC(2026, 0, 9)), limits).key).toBe("expired");
    expect(describeExpiry(new Date(Date.UTC(2026, 0, 10)), limits).key).toBe("today");
    expect(describeExpiry(new Date(Date.UTC(2026, 0, 20)), limits).key).toBe("urgent");
    expect(describeExpiry(new Date(Date.UTC(2026, 2, 1)), limits).key).toBe("warning");
    expect(describeExpiry(new Date(Date.UTC(2026, 3, 1)), limits).key).toBe("early");
    expect(describeExpiry(new Date(Date.UTC(2027, 0, 1)), limits, "en")).toMatchObject({ key: "ok", label: "Valid" });
  });

  it("picks the closest expiry", () => {
    expect(worstExpiry([null, new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(2026, 0, 20))], limits).key).toBe("urgent");
  });
});

describe("clock", () => {
  it("uses Muscat time", () => {
    expect(muscatDay(new Date("2026-01-10T21:00:00Z"))).toBe("2026-01-11");
  });

  it("measures lateness from the start time", () => {
    expect(parseWorkStart("7:30")).toBe(450);
    expect(parseWorkStart("25:00")).toBeNull();
    expect(lateMinutes(new Date("2026-01-10T03:45:00Z"), "07:30")).toBe(15);
    expect(lateMinutes(new Date("2026-01-10T03:00:00Z"), "07:30")).toBe(0);
    expect(lateMinutes(new Date("2026-01-10T05:00:00Z"), null)).toBe(0);
  });

  it("validates coordinates and distances", () => {
    expect(validCoords("23.58", "58.4")).toEqual([23.58, 58.4]);
    expect(validCoords("", "58")).toBeNull();
    expect(validCoords(95, 10)).toBeNull();
    expect(Math.round(distanceMeters(23.58, 58.4, 23.59, 58.4))).toBe(1112);
    expect(workedLabel("2026-01-10T04:00:00Z", "2026-01-10T12:05:00Z")).toBe("8:05");
  });
});

describe("leave", () => {
  const types = [
    { key: "annual", nameAr: "سنوية", nameEn: "Annual", days: 30, allJobs: true, jobTitleIds: [] },
    { key: "drivers", nameAr: "سائقين", nameEn: null, days: 5, allJobs: false, jobTitleIds: ["driver"] },
  ];

  it("counts days inclusively", () => {
    expect(countInclusiveDays("2026-01-01", "2026-01-10")).toBe(10);
    expect(countInclusiveDays("2026-01-10", "2026-01-01")).toBe(0);
  });

  it("applies overrides, credits and half days", () => {
    const balances = computeLeaveBalances(
      { jobTitleId: null, leaveDays: { annual: 21 } },
      [{ type: "LEAVE", balanceKey: "annual" }, { type: "HALF_DAY", balanceKey: "annual" }],
      [{ balanceKey: "annual", days: 2 }],
      types,
    );
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ key: "annual", entitlement: 21, added: 2, used: 1.5, remaining: 21.5 });
  });

  it("warns when a balance runs out", () => {
    const balances = computeLeaveBalances({ jobTitleId: "driver", leaveDays: null }, Array(6).fill({ type: "CUSTOM_LEAVE", balanceKey: "drivers" }), [], types);
    expect(leaveWarnings(balances, 3).map((item) => item.level)).toEqual(["exceeded"]);
  });
});

describe("utilities", () => {
  it("parses date inputs at noon UTC", () => {
    expect(parseDateInput("2026-02-03")?.toISOString()).toBe("2026-02-03T12:00:00.000Z");
    expect(parseDateInput("2026-13-03")).toBeNull();
    expect(toDateInput(new Date("2026-02-03T12:00:00Z"))).toBe("2026-02-03");
  });

  it("phrases Arabic day counts", () => {
    expect(daysPhrase(1)).toBe("يوم واحد");
    expect(daysPhrase(2)).toBe("يومين");
    expect(daysPhrase(5)).toBe("5 أيام");
    expect(daysPhrase(-11)).toBe("11 يوماً");
  });

  it("only returns to local paths", () => {
    expect(safeReturn("/employees", "/")).toBe("/employees");
    expect(safeReturn("//evil.com", "/")).toBe("/");
    expect(safeReturn("https://evil.com", "/")).toBe("/");
  });
});
