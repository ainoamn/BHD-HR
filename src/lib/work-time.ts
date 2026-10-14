import type { Bi } from "./i18n";
import { round3 } from "./utils";

/**
 * Work schedules, overtime and lateness from portal clock-ins (Muscat time, UTC+4, no daylight saving).
 * Overtime counts only after the scheduled end; night overtime is the part between 21:00 and 06:00; every minute
 * worked on a rest day is rest-day overtime. Defaults follow the Omani labour law's minimums: +25% by day, +50% at
 * night, and double pay on rest days. Overtime is paid on the basic wage: basic ÷ salary days ÷ scheduled hours.
 */
const MUSCAT_OFFSET_MS = 4 * 3600000;
export const NIGHT_FROM = 21 * 60;
export const NIGHT_TO = 6 * 60;

/** Sunday = 0 … Saturday = 6; Oman's weekend is Friday and Saturday. */
export const WEEKDAYS: Bi[] = [
  { ar: "الأحد", en: "Sun" },
  { ar: "الاثنين", en: "Mon" },
  { ar: "الثلاثاء", en: "Tue" },
  { ar: "الأربعاء", en: "Wed" },
  { ar: "الخميس", en: "Thu" },
  { ar: "الجمعة", en: "Fri" },
  { ar: "السبت", en: "Sat" },
];
export const DEFAULT_WORKDAYS = [0, 1, 2, 3, 4];

export type Schedule = { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; workDays: number[] };
export type OvertimeRules = { overtimeDayRate: number; overtimeNightRate: number; overtimeRestRate: number; latenessDeduct: boolean };

export function parseTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() || "");
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

export function readWorkDays(value: unknown): number[] {
  if (!Array.isArray(value)) return DEFAULT_WORKDAYS;
  const days = [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  return days.length ? days : DEFAULT_WORKDAYS;
}

/** Scheduled working minutes of one day, breaks excluded; a schedule ending past midnight runs into the next day. */
export function scheduledMinutes(schedule: Schedule) {
  const start = parseTime(schedule.startTime);
  const end = parseTime(schedule.endTime);
  if (start === null || end === null) return 0;
  const span = end > start ? end - start : end + 1440 - start;
  return Math.max(0, span - Math.max(0, schedule.breakMinutes));
}

/** Minutes since Muscat midnight of `day` (YYYY-MM-DD) for a moment; can exceed 1440 for the next morning. */
function minuteOf(day: string, at: Date) {
  const midnight = Date.parse(`${day}T00:00:00Z`) - MUSCAT_OFFSET_MS;
  return Math.round((at.getTime() - midnight) / 60000);
}

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/** Night minutes (21:00–06:00) inside [from, to), both counted from the day's midnight. */
export function nightMinutes(from: number, to: number) {
  let total = 0;
  for (let base = -1440; base <= 2880; base += 1440) {
    total += overlap(from, to, base + NIGHT_FROM, base + 1440 + NIGHT_TO);
  }
  return total;
}

export type DayFigures = {
  workday: boolean;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeDay: number;
  overtimeNight: number;
  overtimeRest: number;
};

/** One clock-in day measured against the schedule; a day without a clock-out has no overtime or early leave yet. */
export function dayFigures(day: string, inAt: Date, outAt: Date | null, schedule: Schedule): DayFigures {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const workday = readWorkDays(schedule.workDays).includes(weekday);
  const start = parseTime(schedule.startTime);
  const endRaw = parseTime(schedule.endTime);
  const arrive = minuteOf(day, inAt);
  const leave = outAt ? minuteOf(day, outAt) : null;
  const empty = { workday, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeDay: 0, overtimeNight: 0, overtimeRest: 0 };
  if (start === null || endRaw === null) return empty;
  const end = endRaw > start ? endRaw : endRaw + 1440;
  const span = leave === null ? 0 : Math.max(0, leave - arrive);
  if (!workday) {
    const worked = Math.max(0, span - (span > 360 ? Math.max(0, schedule.breakMinutes) : 0));
    return { ...empty, workedMinutes: worked, overtimeRest: worked };
  }
  const late = arrive - start > Math.max(0, schedule.graceMinutes) ? arrive - start : 0;
  const worked = Math.max(0, span - (span > 360 ? Math.max(0, schedule.breakMinutes) : 0));
  if (leave === null) return { ...empty, lateMinutes: late };
  const early = Math.max(0, end - leave);
  const extraFrom = Math.max(end, arrive);
  const extra = Math.max(0, leave - extraFrom);
  const night = Math.min(extra, nightMinutes(extraFrom, leave));
  return { workday, workedMinutes: worked, lateMinutes: late, earlyLeaveMinutes: early, overtimeDay: extra - night, overtimeNight: night, overtimeRest: 0 };
}

export type MonthFigures = Omit<DayFigures, "workday"> & { days: number };

export function sumDays(days: DayFigures[]): MonthFigures {
  return days.reduce(
    (sum, day) => ({
      days: sum.days + 1,
      workedMinutes: sum.workedMinutes + day.workedMinutes,
      lateMinutes: sum.lateMinutes + day.lateMinutes,
      earlyLeaveMinutes: sum.earlyLeaveMinutes + day.earlyLeaveMinutes,
      overtimeDay: sum.overtimeDay + day.overtimeDay,
      overtimeNight: sum.overtimeNight + day.overtimeNight,
      overtimeRest: sum.overtimeRest + day.overtimeRest,
    }),
    { days: 0, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeDay: 0, overtimeNight: 0, overtimeRest: 0 },
  );
}

/** Hourly basic wage: basic ÷ salary days ÷ scheduled hours a day. */
export function hourlyRate(basicSalary: number, salaryDays: number, schedule: Schedule) {
  const hours = scheduledMinutes(schedule) / 60;
  if (salaryDays <= 0 || hours <= 0) return 0;
  return basicSalary / salaryDays / hours;
}

/** Money for a month: overtime earned and, when the company deducts it, lateness plus early leave. */
export function monthAmounts(figures: MonthFigures, hourly: number, rules: OvertimeRules) {
  const overtime = round3(
    (hourly * (figures.overtimeDay * rules.overtimeDayRate + figures.overtimeNight * rules.overtimeNightRate + figures.overtimeRest * rules.overtimeRestRate)) / 60,
  );
  const lateness = rules.latenessDeduct ? round3((hourly * (figures.lateMinutes + figures.earlyLeaveMinutes)) / 60) : 0;
  return { overtime, lateness };
}

/** "3:05" for 185 minutes. */
export function hoursLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
