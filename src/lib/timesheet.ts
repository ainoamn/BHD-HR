import type { WorkSchedule } from "@prisma/client";
import { prisma } from "./prisma";
import { dayFigures, hourlyRate, monthAmounts, readWorkDays, sumDays, type MonthFigures, type Schedule } from "./work-time";

export function toSchedule(row: Pick<WorkSchedule, "startTime" | "endTime" | "breakMinutes" | "graceMinutes" | "workDays">): Schedule {
  return { startTime: row.startTime, endTime: row.endTime, breakMinutes: row.breakMinutes, graceMinutes: row.graceMinutes, workDays: readWorkDays(row.workDays) };
}

/** The employee's own schedule, else the company default; null when neither is set. */
export async function scheduleFor(employeeId: string, companyId: string) {
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { schedule: true, company: { select: { defaultScheduleId: true } } },
  });
  if (row?.schedule) return row.schedule;
  if (!row?.company.defaultScheduleId) return null;
  return prisma.workSchedule.findFirst({ where: { id: row.company.defaultScheduleId, companyId } });
}

export type TimesheetRow = {
  employeeId: string;
  fullName: string;
  nameEn: string | null;
  employeeNumber: string;
  schedule: WorkSchedule | null;
  figures: MonthFigures;
  openDays: number;
  amounts: { overtime: number; lateness: number };
  approved: { id: string; overtimeAmount: number; latenessAmount: number; approvedAt: Date } | null;
};

/** Every active employee's clock-ins of a month measured against their schedule, with any approved timesheet. */
export async function monthTimesheet(companyId: string, year: number, month: number): Promise<TimesheetRow[]> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const [company, schedules, employees, entries, sheets] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { defaultScheduleId: true, salaryDays: true, overtimeDayRate: true, overtimeNightRate: true, overtimeRestRate: true, latenessDeduct: true },
    }),
    prisma.workSchedule.findMany({ where: { companyId } }),
    prisma.employee.findMany({
      where: { companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true, basicSalary: true, scheduleId: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.clockEntry.findMany({ where: { companyId, day: { startsWith: prefix } }, select: { employeeId: true, day: true, inAt: true, outAt: true } }),
    prisma.timeSheet.findMany({ where: { companyId, year, month } }),
  ]);
  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const fallback = company.defaultScheduleId ? (byId.get(company.defaultScheduleId) ?? null) : null;
  const sheetBy = new Map(sheets.map((sheet) => [sheet.employeeId, sheet]));
  return employees.map((employee) => {
    const schedule = (employee.scheduleId && byId.get(employee.scheduleId)) || fallback;
    const own = entries.filter((entry) => entry.employeeId === employee.id);
    const rule = schedule ? toSchedule(schedule) : null;
    const figures = sumDays(rule ? own.map((entry) => dayFigures(entry.day, entry.inAt, entry.outAt, rule)) : []);
    const hourly = rule ? hourlyRate(employee.basicSalary, company.salaryDays, rule) : 0;
    const sheet = sheetBy.get(employee.id);
    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      nameEn: employee.nameEn,
      employeeNumber: employee.employeeNumber,
      schedule,
      figures,
      openDays: own.filter((entry) => !entry.outAt).length,
      amounts: monthAmounts(figures, hourly, company),
      approved: sheet ? { id: sheet.id, overtimeAmount: sheet.overtimeAmount, latenessAmount: sheet.latenessAmount, approvedAt: sheet.approvedAt } : null,
    };
  });
}
