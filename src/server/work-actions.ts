"use server";

import { writeAudit } from "@/lib/audit";
import { can, requireAdmin, requireUser } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { nextOpenMonth } from "@/lib/payroll-period";
import { prisma } from "@/lib/prisma";
import { monthTimesheet } from "@/lib/timesheet";
import { clip, intValue, num, req, round3, str } from "@/lib/utils";
import { hoursLabel, parseTime } from "@/lib/work-time";

const WORK = "/settings/work";

function readRate(formData: FormData, key: string, fallback: number) {
  const value = num(formData, key);
  return value >= 1 && value <= 5 ? value : fallback;
}

/** Creates or edits a work schedule. */
export async function saveSchedule(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const name = clip(str(formData, "name"), 80);
  const startTime = req(formData, "startTime");
  const endTime = req(formData, "endTime");
  const workDays = formData.getAll("workDays").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!name) go(WORK, { error: t("اكتب اسم الجدول", "Give the schedule a name") });
  if (parseTime(startTime) === null || parseTime(endTime) === null || startTime === endTime) {
    go(WORK, { error: t("أدخل وقتي بداية ونهاية صحيحين", "Enter a valid start and end time") });
  }
  if (!workDays.length) go(WORK, { error: t("اختر يوم عمل واحداً على الأقل", "Pick at least one working day") });
  const data = {
    name: name!,
    nameEn: clip(str(formData, "nameEn"), 80),
    startTime,
    endTime,
    breakMinutes: Math.min(Math.max(intValue(formData, "breakMinutes"), 0), 240),
    graceMinutes: Math.min(Math.max(intValue(formData, "graceMinutes"), 0), 120),
    workDays: [...new Set(workDays)].sort(),
  };
  if (id) {
    const updated = await prisma.workSchedule.updateMany({ where: { id, companyId: user.companyId }, data });
    if (!updated.count) go(WORK, { error: t("الجدول غير موجود", "Schedule not found") });
  } else {
    const created = await prisma.workSchedule.create({ data: { ...data, companyId: user.companyId } });
    const count = await prisma.workSchedule.count({ where: { companyId: user.companyId } });
    if (count === 1) await prisma.company.update({ where: { id: user.companyId }, data: { defaultScheduleId: created.id } });
  }
  await writeAudit({ userId: user.id, action: id ? "SCHEDULE_UPDATE" : "SCHEDULE_CREATE", message: t(`${id ? "عدّل" : "أضاف"} جدول الدوام ${name}`, `${id ? "Updated" : "Added"} work schedule ${name}`) });
  refreshAll();
  go(WORK, { message: t("حُفظ جدول الدوام", "Work schedule saved") });
}

export async function deleteSchedule(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const schedule = await prisma.workSchedule.findFirst({ where: { id, companyId: user.companyId } });
  if (!schedule) go(WORK, { error: t("الجدول غير موجود", "Schedule not found") });
  await prisma.$transaction([
    prisma.workSchedule.delete({ where: { id } }),
    prisma.company.updateMany({ where: { id: user.companyId, defaultScheduleId: id }, data: { defaultScheduleId: null } }),
  ]);
  await writeAudit({ userId: user.id, action: "SCHEDULE_DELETE", message: t(`حذف جدول الدوام ${schedule!.name}`, `Deleted work schedule ${schedule!.name}`) });
  refreshAll();
  go(WORK, { message: t("حُذف الجدول، ومن كان عليه يتبع الجدول الافتراضي", "Schedule deleted; its employees follow the default schedule") });
}

/** Default schedule, overtime multipliers and whether lateness is deducted. */
export async function saveOvertimeSettings(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const defaultId = req(formData, "defaultScheduleId");
  if (defaultId && !(await prisma.workSchedule.findFirst({ where: { id: defaultId, companyId: user.companyId }, select: { id: true } }))) {
    go(WORK, { error: t("الجدول غير موجود", "Schedule not found") });
  }
  await prisma.company.update({
    where: { id: user.companyId },
    data: {
      defaultScheduleId: defaultId || null,
      overtimeDayRate: readRate(formData, "overtimeDayRate", 1.25),
      overtimeNightRate: readRate(formData, "overtimeNightRate", 1.5),
      overtimeRestRate: readRate(formData, "overtimeRestRate", 2),
      latenessDeduct: req(formData, "latenessDeduct") === "1",
    },
  });
  await writeAudit({ userId: user.id, action: "OVERTIME_SETTINGS", message: t("عدّل إعدادات العمل الإضافي والتأخير", "Updated overtime and lateness settings") });
  refreshAll();
  go(WORK, { message: t("حُفظت الإعدادات", "Settings saved") });
}

/**
 * Approves a month's timesheets (one employee or every one not yet approved): overtime becomes a one-month
 * entitlement and, if the company deducts it, lateness a one-month deduction, in that month or the first open one.
 */
export async function approveTimesheets(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  const year = intValue(formData, "year");
  const month = intValue(formData, "month");
  const only = req(formData, "employeeId");
  const back = `/attendance/timesheet?year=${year}&month=${month}`;
  if (!can(user, "salaries.edit")) go(back, { error: t("ليست لديك صلاحية لهذا الإجراء", "You do not have permission for this action") });
  if (year < 2000 || year > 2100 || month < 1 || month > 12) go("/attendance/timesheet", { error: t("طلب غير صحيح", "Invalid request") });
  const rows = (await monthTimesheet(user.companyId, year, month)).filter(
    (row) => !row.approved && row.schedule && row.figures.days > 0 && (!only || row.employeeId === only),
  );
  if (!rows.length) go(back, { error: t("لا يوجد ما يُعتمد", "Nothing to approve") });
  const start = await nextOpenMonth(user.companyId, { year, month });
  const label = `${monthName(month, "ar")} ${year}`;
  const now = new Date();
  let total = 0;
  for (const row of rows) {
    const items: string[] = [];
    await prisma.$transaction(async (tx) => {
      const base = { companyId: user.companyId, employeeId: row.employeeId, issuedAt: now, startYear: start.year, startMonth: start.month, months: 1, createdByName: user.name };
      if (row.amounts.overtime > 0) {
        const minutes = row.figures.overtimeDay + row.figures.overtimeNight + row.figures.overtimeRest;
        const item = await tx.payItem.create({
          data: { ...base, kind: "ENTITLEMENT", title: `عمل إضافي ${label} (${hoursLabel(minutes)} ساعة)`, amount: row.amounts.overtime, notes: `TIMESHEET:${year}-${month}` },
        });
        items.push(item.id);
      }
      if (row.amounts.lateness > 0) {
        const minutes = row.figures.lateMinutes + row.figures.earlyLeaveMinutes;
        const item = await tx.payItem.create({
          data: { ...base, kind: "DEDUCTION", title: `تأخير وخروج مبكر ${label} (${hoursLabel(minutes)} ساعة)`, amount: row.amounts.lateness, notes: `TIMESHEET:${year}-${month}` },
        });
        items.push(item.id);
      }
      await tx.timeSheet.create({
        data: {
          companyId: user.companyId,
          employeeId: row.employeeId,
          year,
          month,
          days: row.figures.days,
          workedMinutes: row.figures.workedMinutes,
          lateMinutes: row.figures.lateMinutes,
          earlyLeaveMinutes: row.figures.earlyLeaveMinutes,
          overtimeDay: row.figures.overtimeDay,
          overtimeNight: row.figures.overtimeNight,
          overtimeRest: row.figures.overtimeRest,
          overtimeAmount: row.amounts.overtime,
          latenessAmount: row.amounts.lateness,
          payItemIds: items,
          approvedById: user.id,
        },
      });
      if (items.length) await syncEmployeeSalaries(tx, row.employeeId, user.company.salaryDays);
    });
    total = round3(total + row.amounts.overtime - row.amounts.lateness);
  }
  await writeAudit({
    userId: user.id,
    employeeId: only || undefined,
    action: "TIMESHEET_APPROVE",
    message: t(
      `اعتمد ساعات ${label} لـ ${rows.length} موظف (صافي الأثر ${total})، تُطبّق في راتب ${monthName(start.month, "ar")} ${start.year}`,
      `Approved ${monthName(month, "en")} ${year} hours for ${rows.length} employee(s) (net ${total}), applied to the ${monthName(start.month, "en")} ${start.year} salary`,
    ),
  });
  refreshAll();
  go(back, { message: t(`اعتُمدت ساعات ${rows.length} موظف وأُضيفت إلى راتب ${monthName(start.month, "ar")} ${start.year}`, `Approved ${rows.length} timesheet(s); added to the ${monthName(start.month, "en")} ${start.year} salary`) });
}

/** Withdraws an approval while the pay items it made are still in an editable, unpaid month. */
export async function withdrawTimesheet(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const sheet = await prisma.timeSheet.findFirst({ where: { id, companyId: user.companyId } });
  const back = sheet ? `/attendance/timesheet?year=${sheet.year}&month=${sheet.month}` : "/attendance/timesheet";
  if (!can(user, "salaries.edit")) go(back, { error: t("ليست لديك صلاحية لهذا الإجراء", "You do not have permission for this action") });
  if (!sheet) go(back, { error: t("السجل غير موجود", "Record not found") });
  const itemIds = Array.isArray(sheet!.payItemIds) ? (sheet!.payItemIds as string[]) : [];
  const items = await prisma.payItem.findMany({ where: { id: { in: itemIds }, companyId: user.companyId }, select: { startYear: true, startMonth: true } });
  for (const item of items) {
    const [paid, period] = await Promise.all([
      prisma.salary.findFirst({ where: { employeeId: sheet!.employeeId, year: item.startYear, month: item.startMonth, paid: true }, select: { id: true } }),
      prisma.payrollPeriod.findUnique({ where: { companyId_year_month: { companyId: user.companyId, year: item.startYear, month: item.startMonth } }, select: { status: true } }),
    ]);
    if (paid || (period && period.status !== "DRAFT")) {
      go(back, { error: t("صُرف الراتب الذي أُضيفت إليه الساعات أو أُقفل شهره؛ سجّل تصحيحاً بدل الإلغاء", "The salary these hours went into is paid or its month is closed; record a correction instead") });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.payItem.deleteMany({ where: { id: { in: itemIds }, companyId: user.companyId } });
    await tx.timeSheet.delete({ where: { id: sheet!.id } });
    await syncEmployeeSalaries(tx, sheet!.employeeId, user.company.salaryDays);
  });
  await writeAudit({
    userId: user.id,
    employeeId: sheet!.employeeId,
    action: "TIMESHEET_WITHDRAW",
    message: t(`ألغى اعتماد ساعات ${monthName(sheet!.month, "ar")} ${sheet!.year}`, `Withdrew the ${monthName(sheet!.month, "en")} ${sheet!.year} hours approval`),
  });
  refreshAll();
  go(back, { message: t("أُلغي الاعتماد وحُذفت بنوده من الراتب", "Approval withdrawn and its pay items removed") });
}
