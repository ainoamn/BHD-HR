import { describe, expect, it } from "vitest";
import { dayFigures, hourlyRate, monthAmounts, nightMinutes, readWorkDays, scheduledMinutes, sumDays } from "@/lib/work-time";

const schedule = { startTime: "07:30", endTime: "16:30", breakMinutes: 60, graceMinutes: 10, workDays: [0, 1, 2, 3, 4] };
/** Muscat wall-clock time on a day as a UTC Date. */
const at = (day: string, time: string, nextDay = false) => new Date(Date.parse(`${day}T${time}:00Z`) - 4 * 3600000 + (nextDay ? 86400000 : 0));
const SUNDAY = "2026-10-11";
const FRIDAY = "2026-10-16";

describe("work schedule", () => {
  it("counts scheduled minutes without the break", () => {
    expect(scheduledMinutes(schedule)).toBe(480);
    expect(scheduledMinutes({ ...schedule, startTime: "22:00", endTime: "06:00", breakMinutes: 0 })).toBe(480);
  });

  it("falls back to Sunday–Thursday", () => {
    expect(readWorkDays(null)).toEqual([0, 1, 2, 3, 4]);
    expect(readWorkDays([5, 6, 9])).toEqual([5, 6]);
  });

  it("measures night minutes across midnight", () => {
    expect(nightMinutes(20 * 60, 22 * 60)).toBe(60);
    expect(nightMinutes(23 * 60, 26 * 60)).toBe(180);
  });
});

describe("one day", () => {
  it("is on time within the grace period", () => {
    const day = dayFigures(SUNDAY, at(SUNDAY, "07:38"), at(SUNDAY, "16:30"), schedule);
    expect(day).toMatchObject({ workday: true, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeDay: 0, overtimeNight: 0 });
  });

  it("counts the whole lateness once past the grace period, and early leave", () => {
    const day = dayFigures(SUNDAY, at(SUNDAY, "07:45"), at(SUNDAY, "16:00"), schedule);
    expect(day.lateMinutes).toBe(15);
    expect(day.earlyLeaveMinutes).toBe(30);
  });

  it("splits overtime after the shift into day and night", () => {
    const day = dayFigures(SUNDAY, at(SUNDAY, "07:30"), at(SUNDAY, "22:30"), schedule);
    expect(day.overtimeDay).toBe(270);
    expect(day.overtimeNight).toBe(90);
  });

  it("counts everything on a rest day as rest-day overtime", () => {
    const day = dayFigures(FRIDAY, at(FRIDAY, "09:00"), at(FRIDAY, "13:00"), schedule);
    expect(day).toMatchObject({ workday: false, overtimeRest: 240, lateMinutes: 0 });
  });

  it("has no overtime before the clock-out", () => {
    const day = dayFigures(SUNDAY, at(SUNDAY, "08:00"), null, schedule);
    expect(day).toMatchObject({ lateMinutes: 30, overtimeDay: 0, earlyLeaveMinutes: 0 });
  });

  it("handles a night shift that ends the next morning", () => {
    const night = { ...schedule, startTime: "22:00", endTime: "06:00", breakMinutes: 0 };
    const day = dayFigures(SUNDAY, at(SUNDAY, "22:00"), at(SUNDAY, "07:00", true), night);
    expect(day.earlyLeaveMinutes).toBe(0);
    expect(day.overtimeDay + day.overtimeNight).toBe(60);
    expect(day.overtimeNight).toBe(0);
  });
});

describe("month amounts", () => {
  const rules = { overtimeDayRate: 1.25, overtimeNightRate: 1.5, overtimeRestRate: 2, latenessDeduct: true };

  it("pays overtime on the hourly basic wage", () => {
    const hourly = hourlyRate(240, 30, schedule);
    expect(hourly).toBe(1);
    const figures = sumDays([
      { workday: true, workedMinutes: 600, lateMinutes: 30, earlyLeaveMinutes: 0, overtimeDay: 120, overtimeNight: 60, overtimeRest: 0 },
      { workday: false, workedMinutes: 240, lateMinutes: 0, earlyLeaveMinutes: 30, overtimeDay: 0, overtimeNight: 0, overtimeRest: 240 },
    ]);
    expect(figures.days).toBe(2);
    expect(monthAmounts(figures, hourly, rules)).toEqual({ overtime: 2.5 + 1.5 + 8, lateness: 1 });
  });

  it("does not deduct lateness unless the company chose to", () => {
    const figures = sumDays([{ workday: true, workedMinutes: 480, lateMinutes: 60, earlyLeaveMinutes: 0, overtimeDay: 0, overtimeNight: 0, overtimeRest: 0 }]);
    expect(monthAmounts(figures, 2, { ...rules, latenessDeduct: false }).lateness).toBe(0);
  });
});
