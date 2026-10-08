"use server";

import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { REMINDER_REPEAT } from "@/lib/calendar";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { clip, formatDate, parseDateInput, req, safeReturn, str } from "@/lib/utils";

export async function createReminder(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/calendar");
  const title = clip(req(formData, "title"), 150) || "";
  const date = parseDateInput(req(formData, "date"));
  const repeat = REMINDER_REPEAT[req(formData, "repeat")] ? req(formData, "repeat") : "NONE";
  const employeeId = str(formData, "employeeId");
  if (title.length < 2) go(returnTo, { error: t("اكتب عنوان التذكير", "Enter a reminder title") });
  if (!date) go(returnTo, { error: t("اختر تاريخ التذكير", "Choose the reminder date") });
  if (employeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId }, select: { id: true } });
    if (!employee) go(returnTo, { error: t("الموظف غير موجود", "Employee not found") });
  }
  await prisma.reminder.create({
    data: {
      companyId: user.companyId,
      title,
      date: date!,
      repeat,
      employeeId,
      notes: clip(str(formData, "notes"), 500),
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId,
    action: "REMINDER_CREATE",
    message: t(`أضاف تذكير «${title}» بتاريخ ${formatDate(date)}`, `Added reminder “${title}” on ${formatDate(date)}`),
  });
  refreshAll();
  go(returnTo, { message: t("تم حفظ التذكير", "Reminder saved") });
}

export async function toggleReminder(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/calendar");
  const reminder = await prisma.reminder.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!reminder) go(returnTo, { error: t("التذكير غير موجود", "Reminder not found") });
  await prisma.reminder.update({ where: { id: reminder!.id }, data: { done: !reminder!.done } });
  refreshAll();
  go(returnTo, { message: reminder!.done ? t("أُعيد فتح التذكير", "Reminder reopened") : t("تم إنجاز التذكير", "Reminder marked done") });
}

export async function deleteReminder(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/calendar");
  const reminder = await prisma.reminder.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!reminder) go(returnTo, { error: t("التذكير غير موجود", "Reminder not found") });
  await prisma.reminder.delete({ where: { id: reminder!.id } });
  await writeAudit({
    userId: user.id,
    employeeId: reminder!.employeeId,
    action: "REMINDER_DELETE",
    message: t(`حذف التذكير «${reminder!.title}»`, `Deleted reminder “${reminder!.title}”`),
  });
  refreshAll();
  go(returnTo, { message: t("تم حذف التذكير", "Reminder deleted") });
}
