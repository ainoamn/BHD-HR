import type { Prisma } from "@prisma/client";
import { ATTENDANCE_LABEL, PLAIN_ATTENDANCE_AFTER, PLAIN_ATTENDANCE_BEFORE, attendanceType } from "./constants";
import { pick, type Lang } from "./i18n";
import { round3 } from "./utils";

export type LeaveTypeInfo = {
  key: string;
  nameAr: string;
  nameEn: string | null;
  days: number;
  allJobs: boolean;
  jobTitleIds: string[];
};

export type LeaveFigures = {
  entitlement: number;
  added: number;
  used: number;
  remaining: number;
};

export type LeaveBalance = LeaveFigures & { key: string; nameAr: string; nameEn: string | null; applies: boolean };

/** Attendance type used when recording leave of each built-in balance; company-defined types use CUSTOM_LEAVE. */
const BUILT_IN_ATTENDANCE: Record<string, string> = { annual: "LEAVE", sick: "SICK", compensatory: "COMPENSATORY", other: "OTHER_LEAVE" };
export const LEAVE_CHOICE = "leave:";

export function leaveName(type: { nameAr: string; nameEn: string | null }, lang: Lang) {
  return lang === "en" && type.nameEn ? type.nameEn : type.nameAr;
}

export function leaveApplies(type: Pick<LeaveTypeInfo, "allJobs" | "jobTitleIds">, jobTitleId: string | null | undefined) {
  return type.allJobs || Boolean(jobTitleId && type.jobTitleIds.includes(jobTitleId));
}

export function leaveOverrides(value: Prisma.JsonValue | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] >= 0));
}

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

/** The balance a row uses: its stored key, or the built-in one implied by older rows that have none. */
export function rowBalanceKey(row: { type: string; balanceKey: string | null }) {
  return row.balanceKey || attendanceType(row.type)?.balance || null;
}

export function salaryDayWeight(row: { type: string; deductsSalary: boolean }) {
  if (!row.deductsSalary) return 0;
  return row.type === "HALF_DAY" ? 0.5 : 1;
}

export function rowDays(row: { type: string }) {
  return row.type === "HALF_DAY" ? 0.5 : 1;
}

/**
 * Balances of the types that apply to the employee's job, plus any other type the employee already used or was
 * credited (so nothing recorded disappears from view). Entitlement = the employee's own days or the type's default.
 */
export function computeLeaveBalances(
  employee: { jobTitleId: string | null; leaveDays: Prisma.JsonValue | null },
  attendance: { type: string; balanceKey: string | null }[],
  credits: { balanceKey: string; days: number }[],
  types: LeaveTypeInfo[],
): LeaveBalance[] {
  const overrides = leaveOverrides(employee.leaveDays);
  return types
    .map((type) => {
      const added = round3(credits.filter((item) => item.balanceKey === type.key).reduce((sum, item) => sum + item.days, 0));
      const used = round3(attendance.reduce((sum, row) => (rowBalanceKey(row) === type.key ? sum + rowDays(row) : sum), 0));
      const applies = leaveApplies(type, employee.jobTitleId);
      const entitlement = applies ? (overrides[type.key] ?? type.days) : 0;
      return {
        key: type.key,
        nameAr: type.nameAr,
        nameEn: type.nameEn,
        applies,
        entitlement,
        added,
        used,
        remaining: round3(entitlement + added - used),
      };
    })
    .filter((item) => item.applies || item.added > 0 || item.used > 0);
}

export function remainingByKey(balances: LeaveBalance[]) {
  return Object.fromEntries(balances.map((item) => [item.key, item.remaining])) as Record<string, number>;
}

export type LeaveWarning = {
  key: string;
  nameAr: string;
  nameEn: string | null;
  level: "exceeded" | "exhausted" | "low";
  remaining: number;
  total: number;
};

export function leaveWarnings(balances: LeaveBalance[], warnDays: number) {
  const warnings: LeaveWarning[] = [];
  for (const figure of balances) {
    const base = { key: figure.key, nameAr: figure.nameAr, nameEn: figure.nameEn };
    const total = round3(figure.entitlement + figure.added);
    if (figure.remaining < 0) warnings.push({ ...base, level: "exceeded", remaining: figure.remaining, total });
    else if (figure.remaining === 0 && figure.used > 0) warnings.push({ ...base, level: "exhausted", remaining: 0, total });
    else if (figure.remaining > 0 && figure.remaining <= warnDays && total > warnDays) warnings.push({ ...base, level: "low", remaining: figure.remaining, total });
  }
  return warnings;
}

export function leaveWarningText(warning: LeaveWarning, lang: Lang) {
  const name = leaveName(warning, lang);
  const days = Math.abs(warning.remaining);
  const count = Number.isInteger(days) ? String(days) : days.toFixed(1);
  if (warning.level === "exceeded") {
    return lang === "en" ? `Exceeded ${name} by ${count} day(s)` : `تجاوز رصيد ${name} بـ ${count} يوم`;
  }
  if (warning.level === "exhausted") return lang === "en" ? `${name} fully used` : `نفد رصيد ${name}`;
  return lang === "en" ? `${name} almost used — ${count} day(s) left` : `اقترب من نفاد ${name} — متبقٍ ${count} يوم`;
}

/** Label of an attendance row: the leave type's current name, or the fixed label for absence and the like. */
export function attendanceLabel(row: { type: string; balanceKey: string | null }, types: LeaveTypeInfo[], lang: Lang) {
  const key = rowBalanceKey(row);
  const type = key ? types.find((item) => item.key === key) : null;
  return type ? leaveName(type, lang) : pick(ATTENDANCE_LABEL[row.type], lang, row.type);
}

export type AttendanceChoice = { value: string; label: string; balanceKey: string | null; deductsSalary: boolean };

/** Options for recording a period: absence and unpaid leave, then every leave type, then official duty and half day. */
export function attendanceChoices(types: LeaveTypeInfo[], lang: Lang): AttendanceChoice[] {
  const plain = (ids: string[]) =>
    ids.map((id) => {
      const meta = attendanceType(id)!;
      return { value: id, label: pick(meta.label, lang), balanceKey: null, deductsSalary: meta.deductsSalary };
    });
  return [
    ...plain(PLAIN_ATTENDANCE_BEFORE),
    ...types.map((type) => ({ value: `${LEAVE_CHOICE}${type.key}`, label: leaveName(type, lang), balanceKey: type.key, deductsSalary: false })),
    ...plain(PLAIN_ATTENDANCE_AFTER),
  ];
}

export function attendanceChoiceOf(row: { type: string; balanceKey: string | null }) {
  const key = rowBalanceKey(row);
  return key ? `${LEAVE_CHOICE}${key}` : row.type;
}

/** Turns a submitted choice into the stored type and balance key; null when it is not a valid choice. */
export function parseAttendanceChoice(value: string, types: LeaveTypeInfo[]) {
  if (value.startsWith(LEAVE_CHOICE)) {
    const key = value.slice(LEAVE_CHOICE.length);
    const type = types.find((item) => item.key === key);
    if (!type) return null;
    return { type: BUILT_IN_ATTENDANCE[key] || "CUSTOM_LEAVE", balanceKey: key, leaveType: type };
  }
  const meta = attendanceType(value);
  if (!meta || value === "CUSTOM_LEAVE") return null;
  const key = meta.balance;
  const leaveType = key ? types.find((item) => item.key === key) || null : null;
  if (key && !leaveType) return null;
  return { type: value, balanceKey: key, leaveType };
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
      const days = round3(sorted.reduce((sum, row) => sum + rowDays(row), 0));
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
