import { BALANCE_KEYS, type BalanceKey, attendanceType } from "./constants";
import { round3 } from "./utils";

export type LeaveFigures = {
  entitlement: number;
  added: number;
  used: number;
  remaining: number;
};

export function countInclusiveDays(from: string, to: string) {
  const start = parseInputUtc(from);
  const end = parseInputUtc(to);
  if (start === null || end === null || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function eachUtcDate(from: Date, to: Date) {
  const dates: Date[] = [];
  let cursor = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor <= end) {
    const current = new Date(cursor);
    dates.push(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 12, 0, 0)));
    cursor += 86400000;
  }
  return dates;
}

export function inferredBalance(type: string): BalanceKey | null {
  return attendanceType(type)?.balance || null;
}

export function balanceDayWeight(row: { type: string; balanceKey: string | null }) {
  const key = (row.balanceKey || inferredBalance(row.type)) as BalanceKey | null;
  if (!key || !(BALANCE_KEYS as readonly string[]).includes(key)) return { key: null as BalanceKey | null, days: 0 };
  return { key, days: row.type === "HALF_DAY" ? 0.5 : 1 };
}

export function salaryDayWeight(row: { type: string; deductsSalary: boolean }) {
  if (!row.deductsSalary) return 0;
  return row.type === "HALF_DAY" ? 0.5 : 1;
}

export function computeLeaveBalances(
  employee: { annualLeaveDays: number; sickLeaveDays: number; otherLeaveDays: number },
  attendance: { type: string; balanceKey: string | null }[],
  credits: { balanceKey: string; days: number }[],
) {
  const entitlement: Record<BalanceKey, number> = {
    annual: employee.annualLeaveDays,
    sick: employee.sickLeaveDays,
    compensatory: 0,
    other: employee.otherLeaveDays,
  };
  const result = {} as Record<BalanceKey, LeaveFigures>;
  for (const key of BALANCE_KEYS) {
    const added = round3(credits.filter((item) => item.balanceKey === key).reduce((sum, item) => sum + item.days, 0));
    const used = round3(
      attendance.reduce((sum, row) => {
        const item = balanceDayWeight(row);
        return item.key === key ? sum + item.days : sum;
      }, 0),
    );
    result[key] = {
      entitlement: entitlement[key],
      added,
      used,
      remaining: round3(entitlement[key] + added - used),
    };
  }
  return result;
}

export type LeaveWarning = {
  key: BalanceKey;
  level: "exceeded" | "exhausted" | "low";
  remaining: number;
  total: number;
};

export function leaveWarnings(balances: Record<BalanceKey, LeaveFigures>, warnDays: number) {
  const warnings: LeaveWarning[] = [];
  for (const key of BALANCE_KEYS) {
    const figure = balances[key];
    const total = round3(figure.entitlement + figure.added);
    if (figure.remaining < 0) warnings.push({ key, level: "exceeded", remaining: figure.remaining, total });
    else if (figure.remaining === 0 && figure.used > 0) warnings.push({ key, level: "exhausted", remaining: 0, total });
    else if (figure.remaining > 0 && figure.remaining <= warnDays && total > warnDays) warnings.push({ key, level: "low", remaining: figure.remaining, total });
  }
  return warnings;
}

export function leaveWarningText(warning: LeaveWarning, name: string, lang: "ar" | "en") {
  const days = Math.abs(warning.remaining);
  const count = Number.isInteger(days) ? String(days) : days.toFixed(1);
  if (warning.level === "exceeded") {
    return lang === "en" ? `Exceeded ${name} by ${count} day(s)` : `تجاوز رصيد ${name} بـ ${count} يوم`;
  }
  if (warning.level === "exhausted") return lang === "en" ? `${name} fully used` : `نفد رصيد ${name}`;
  return lang === "en" ? `${name} almost used — ${count} day(s) left` : `اقترب من نفاد ${name} — متبقٍ ${count} يوم`;
}

export function groupAttendance<T extends { id: string; date: Date | string; type: string; groupId: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.groupId || row.id;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  return Array.from(groups.values())
    .map((list) => {
      const sorted = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
      const days = round3(sorted.reduce((sum, row) => sum + (row.type === "HALF_DAY" ? 0.5 : 1), 0));
      return {
        id: sorted[0].groupId || sorted[0].id,
        deleteId: sorted[0].id,
        start: sorted[0].date,
        end: sorted[sorted.length - 1].date,
        days,
        row: sorted[0],
      };
    })
    .sort((a, b) => +new Date(b.start) - +new Date(a.start));
}

function parseInputUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
