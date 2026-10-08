"use server";

import { randomUUID } from "crypto";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ATTENDANCE_LABEL, BALANCE_LABEL, attendanceType } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, eachUtcDate } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { clip, daysLabel, formatDate, parseDateInput, req, safeReturn, str } from "@/lib/utils";

export async function markAttendance(formData: FormData) {
  return saveAttendance(formData, null);
}

/** Replaces a whole period (all rows of its group) after the same balance and overlap checks as a new entry. */
export async function updateAttendance(formData: FormData) {
  return saveAttendance(formData, req(formData, "id"));
}

async function saveAttendance(formData: FormData, replaceId: string | null) {
  const user = await requirePermission(replaceId ? "attendance.edit" : "attendance.create", "/attendance");
  const { lang, t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/attendance");
  let replacedIds: string[] = [];
  let employeeId = req(formData, "employeeId");
  if (replaceId) {
    const old = await prisma.attendance.findFirst({ where: { id: replaceId, employee: { companyId: user.companyId } } });
    if (!old) go(returnTo, { error: t("السجل غير موجود", "Record not found") });
    employeeId = old!.employeeId;
    replacedIds = old!.groupId
      ? (await prisma.attendance.findMany({ where: { groupId: old!.groupId, employeeId }, select: { id: true } })).map((row) => row.id)
      : [old!.id];
  }
  const type = req(formData, "type");
  const meta = attendanceType(type);
  const from = parseDateInput(req(formData, "from")) || parseDateInput(req(formData, "date"));
  const to = parseDateInput(req(formData, "to")) || from;
  if (!meta) go(returnTo, { error: t("نوع الحالة غير صحيح", "Invalid type") });
  if (!from || !to) go(returnTo, { error: t("حدد تاريخ البداية والنهاية", "Choose start and end dates") });
  if (to! < from!) go(returnTo, { error: t("تاريخ النهاية قبل تاريخ البداية", "End date is before start date") });
  const dates = eachUtcDate(from!, to!);
  if (dates.length > 366) go(returnTo, { error: t("المدة أطول من سنة. قسّمها إلى فترات أقصر.", "Period is longer than a year. Split it.") });
  if (type === "HALF_DAY" && dates.length !== 1) go(returnTo, { error: t("نصف اليوم يُسجل في يوم واحد فقط", "A half day can only be one date") });
  const days = type === "HALF_DAY" ? 0.5 : dates.length;
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: user.companyId },
    include: { attendance: true, leaveCredits: true },
  });
  if (!employee) go(returnTo, { error: t("الموظف غير موجود", "Employee not found") });
  const balanceKey = meta!.balance;
  let overdraft = 0;
  if (balanceKey) {
    const kept = employee!.attendance.filter((row) => !replacedIds.includes(row.id));
    const balances = computeLeaveBalances(employee!, kept, employee!.leaveCredits);
    const remaining = balances[balanceKey].remaining;
    if (days > remaining) {
      if (req(formData, "allowOverdraft") !== "1") {
        const name = pick(BALANCE_LABEL[balanceKey], lang);
        go(returnTo, {
          error: t(
            `رصيد ${name} غير كافٍ. المتبقي ${daysLabel(remaining)} يوم والمطلوب ${daysLabel(days)}. أضف أيامًا إضافية أو اختر التسجيل رغم التجاوز.`,
            `Not enough ${name}. Remaining ${daysLabel(remaining)}, requested ${daysLabel(days)}. Add extra days or choose to record it anyway.`,
          ),
        });
      }
      overdraft = days - Math.max(0, remaining);
    }
  }
  const deductsSalary = req(formData, "deductsSalary") === "1";
  const notes = clip(str(formData, "notes"), 300);
  const groupId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findMany({
        where: { employeeId, date: { in: dates }, id: { notIn: replacedIds } },
        select: { date: true },
      });
      if (existing.length) throw new Error("CONFLICT");
      if (replacedIds.length) await tx.attendance.deleteMany({ where: { id: { in: replacedIds } } });
      await tx.attendance.createMany({
        data: dates.map((date) => ({ employeeId, date, type, notes, deductsSalary, balanceKey, groupId })),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      go(returnTo, { error: t("بعض الأيام في هذه الفترة مسجّلة مسبقًا. احذف السجل القديم أولًا.", "Some days in this period are already recorded. Delete the old record first.") });
    }
    console.error(error);
    go(returnTo, { error: t("تعذر حفظ السجل", "Could not save the record") });
  }
  const period =
    formatDate(from) === formatDate(to) ? formatDate(from) : t(`من ${formatDate(from)} إلى ${formatDate(to)}`, `${formatDate(from)} to ${formatDate(to)}`);
  const balanceText = balanceKey ? t(` وخُصم من ${pick(BALANCE_LABEL[balanceKey], "ar")}`, `, deducted from ${pick(BALANCE_LABEL[balanceKey], "en")}`) : "";
  const payText = deductsSalary ? t(" مع خصم من الراتب", ", salary deducted") : t(" بدون خصم من الراتب", ", no salary deduction");
  const overText = overdraft > 0 ? t(` — تجاوز الرصيد بـ ${daysLabel(overdraft)} يوم`, ` — balance exceeded by ${daysLabel(overdraft)} day(s)`) : "";
  await writeAudit({
    userId: user.id,
    employeeId,
    action: replaceId ? "ATTENDANCE_UPDATE" : "ATTENDANCE",
    message: t(
      `${replaceId ? "عدّل الفترة إلى" : "سجّل"} ${pick(ATTENDANCE_LABEL[type], "ar")} للموظف ${employee!.fullName} ${period} (${daysLabel(days)} يوم)${balanceText}${payText}${overText}`,
      `${replaceId ? "Changed the period to" : "Recorded"} ${pick(ATTENDANCE_LABEL[type], "en")} for ${employee!.fullName} ${period} (${daysLabel(days)} days)${balanceText}${payText}${overText}`,
    ),
  });
  refreshAll();
  if (overdraft > 0) {
    go(returnTo, {
      error: t(
        `تم التسجيل (${daysLabel(days)} يوم)، لكن الموظف تجاوز رصيده بـ ${daysLabel(overdraft)} يوم.`,
        `Saved (${daysLabel(days)} day(s)), but the employee exceeded the balance by ${daysLabel(overdraft)} day(s).`,
      ),
    });
  }
  go(returnTo, { message: t(`تم التسجيل: ${daysLabel(days)} يوم`, `Saved: ${daysLabel(days)} day(s)`) });
}

export async function deleteAttendance(formData: FormData) {
  const user = await requirePermission("attendance.delete", "/attendance");
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/attendance");
  const id = req(formData, "id");
  const row = await prisma.attendance.findFirst({
    where: { id, employee: { companyId: user.companyId } },
    include: { employee: true },
  });
  if (!row) go(returnTo, { error: t("السجل غير موجود", "Record not found") });
  const rows = row!.groupId
    ? await prisma.attendance.findMany({ where: { groupId: row!.groupId, employeeId: row!.employeeId }, orderBy: { date: "asc" } })
    : [row!];
  await prisma.attendance.deleteMany({ where: { id: { in: rows.map((item) => item.id) } } });
  const first = formatDate(rows[0].date);
  const last = formatDate(rows[rows.length - 1].date);
  const period = first === last ? first : t(`من ${first} إلى ${last}`, `${first} to ${last}`);
  await writeAudit({
    userId: user.id,
    employeeId: row!.employeeId,
    action: "ATTENDANCE_DELETE",
    message: t(
      `حذف ${pick(ATTENDANCE_LABEL[row!.type], "ar", row!.type)} للموظف ${row!.employee.fullName} ${period}`,
      `Deleted ${pick(ATTENDANCE_LABEL[row!.type], "en", row!.type)} for ${row!.employee.fullName} ${period}`,
    ),
  });
  refreshAll();
  go(returnTo, { message: t("تم حذف الفترة وإعادة الأيام إلى الرصيد", "Period deleted and days returned to the balance") });
}
