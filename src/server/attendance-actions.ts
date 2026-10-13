"use server";

import { randomUUID } from "crypto";
import { writeAudit } from "@/lib/audit";
import { requireActor, requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { LEAVE_CHOICE, attendanceLabel, computeLeaveBalances, eachUtcDate, leaveApplies, leaveName, parseAttendanceChoice, rowBalanceKey } from "@/lib/leave";
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
  const { user, scope } = replaceId
    ? await requireActor("attendance.edit", null, "/attendance")
    : await requireActor("attendance.create", "team.attendance.create", "/attendance");
  const { lang, t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), scope ? "/team" : "/attendance");
  let replacedIds: string[] = [];
  let replacedKey: string | null = null;
  let replacedGroupId: string | null = null;
  let employeeId = req(formData, "employeeId");
  if (replaceId) {
    const old = await prisma.attendance.findFirst({ where: { id: replaceId, employee: { companyId: user.companyId } } });
    if (!old) go(returnTo, { error: t("السجل غير موجود", "Record not found") });
    employeeId = old!.employeeId;
    replacedKey = rowBalanceKey(old!);
    replacedGroupId = old!.groupId;
    replacedIds = old!.groupId
      ? (await prisma.attendance.findMany({ where: { groupId: old!.groupId, employeeId }, select: { id: true } })).map((row) => row.id)
      : [old!.id];
  }
  const leaveTypes = await getLeaveTypes(user.companyId);
  const choice = parseAttendanceChoice(req(formData, "type"), leaveTypes);
  if (!choice) go(returnTo, { error: t("نوع الحالة غير صحيح", "Invalid type") });
  const { type, balanceKey, leaveType } = choice!;
  const from = parseDateInput(req(formData, "from")) || parseDateInput(req(formData, "date"));
  const to = parseDateInput(req(formData, "to")) || from;
  if (!from || !to) go(returnTo, { error: t("حدد تاريخ البداية والنهاية", "Choose start and end dates") });
  if (to! < from!) go(returnTo, { error: t("تاريخ النهاية قبل تاريخ البداية", "End date is before start date") });
  const dates = eachUtcDate(from!, to!);
  if (dates.length > 366) go(returnTo, { error: t("المدة أطول من سنة. قسّمها إلى فترات أقصر.", "Period is longer than a year. Split it.") });
  if (type === "HALF_DAY" && dates.length !== 1) go(returnTo, { error: t("نصف اليوم يُسجل في يوم واحد فقط", "A half day can only be one date") });
  const days = type === "HALF_DAY" ? 0.5 : dates.length;
  if (scope && !scope.includes(employeeId)) go(returnTo, { error: t("الموظف غير موجود", "Employee not found") });
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: user.companyId },
    include: { attendance: true, leaveCredits: true },
  });
  if (!employee) go(returnTo, { error: t("الموظف غير موجود", "Employee not found") });
  let overdraft = 0;
  if (balanceKey && leaveType) {
    const name = leaveName(leaveType, lang);
    if (!leaveApplies(leaveType, employee!.jobTitleId) && replacedKey !== balanceKey) {
      go(returnTo, {
        error: t(`${name} غير مشمولة لوظيفة هذا الموظف. غيّر ذلك من الضبط ← الموارد البشرية.`, `${name} does not apply to this employee's job. Change it in Settings → HR.`),
      });
    }
    const kept = employee!.attendance.filter((row) => !replacedIds.includes(row.id));
    const balances = computeLeaveBalances(employee!, kept, employee!.leaveCredits, leaveTypes);
    const remaining = balances.find((item) => item.key === balanceKey)?.remaining ?? 0;
    if (days > remaining) {
      if (req(formData, "allowOverdraft") !== "1") {
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
      if (replacedGroupId) {
        const requestChoice = type === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : balanceKey && type !== "HALF_DAY" ? `${LEAVE_CHOICE}${balanceKey}` : null;
        await tx.leaveRequest.updateMany({
          where: { attendanceGroupId: replacedGroupId, employeeId, status: "APPROVED" },
          data: requestChoice ? { attendanceGroupId: groupId, choice: requestChoice, fromDate: from!, toDate: to!, days } : { status: "REVOKED" },
        });
      }
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
  const balanceText = leaveType ? t(` وخُصم من ${leaveName(leaveType, "ar")}`, `, deducted from ${leaveName(leaveType, "en")}`) : "";
  const row = { type, balanceKey };
  const payText = deductsSalary ? t(" مع خصم من الراتب", ", salary deducted") : t(" بدون خصم من الراتب", ", no salary deduction");
  const overText = overdraft > 0 ? t(` — تجاوز الرصيد بـ ${daysLabel(overdraft)} يوم`, ` — balance exceeded by ${daysLabel(overdraft)} day(s)`) : "";
  await writeAudit({
    userId: user.id,
    employeeId,
    action: replaceId ? "ATTENDANCE_UPDATE" : "ATTENDANCE",
    message: t(
      `${replaceId ? "عدّل الفترة إلى" : "سجّل"} ${attendanceLabel(row, leaveTypes, "ar")} للموظف ${employee!.fullName} ${period} (${daysLabel(days)} يوم)${balanceText}${payText}${overText}`,
      `${replaceId ? "Changed the period to" : "Recorded"} ${attendanceLabel(row, leaveTypes, "en")} for ${employee!.fullName} ${period} (${daysLabel(days)} days)${balanceText}${payText}${overText}`,
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
  const revoked = await prisma.$transaction(async (tx) => {
    await tx.attendance.deleteMany({ where: { id: { in: rows.map((item) => item.id) } } });
    if (!row!.groupId) return 0;
    const { count } = await tx.leaveRequest.updateMany({
      where: { attendanceGroupId: row!.groupId, employeeId: row!.employeeId, status: "APPROVED" },
      data: { status: "REVOKED" },
    });
    return count;
  });
  const first = formatDate(rows[0].date);
  const last = formatDate(rows[rows.length - 1].date);
  const period = first === last ? first : t(`من ${first} إلى ${last}`, `${first} to ${last}`);
  const leaveTypes = await getLeaveTypes(user.companyId);
  await writeAudit({
    userId: user.id,
    employeeId: row!.employeeId,
    action: "ATTENDANCE_DELETE",
    message: t(
      `حذف ${attendanceLabel(row!, leaveTypes, "ar")} للموظف ${row!.employee.fullName} ${period}${revoked ? " وأُلغي طلب الإجازة المرتبط به" : ""}`,
      `Deleted ${attendanceLabel(row!, leaveTypes, "en")} for ${row!.employee.fullName} ${period}${revoked ? " and cancelled the linked leave request" : ""}`,
    ),
  });
  refreshAll();
  go(returnTo, {
    message: revoked
      ? t("تم حذف الفترة وإعادة الأيام إلى الرصيد، وظهر طلب الإجازة للموظف «ألغتها الإدارة»", "Period deleted, days returned to the balance, and the employee's leave request now shows “Cancelled by HR”")
      : t("تم حذف الفترة وإعادة الأيام إلى الرصيد", "Period deleted and days returned to the balance"),
  });
}
