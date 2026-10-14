"use server";

import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { PAYMENT_LABEL, PAY_KINDS, PAY_KIND_LABEL, monthName } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { canEditPeriod, periodStatus } from "@/lib/payroll-period";
import { prisma } from "@/lib/prisma";
import { clip, intValue, money, num, parseDateInput, req, round3, safeReturn, str, todayInputValue } from "@/lib/utils";

const LIST = "/pay-items";
const TX = { maxWait: 10_000, timeout: 30_000 };

function readMonth(value: string) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

async function ownItem(id: string, companyId: string) {
  return prisma.payItem.findFirst({
    where: { id, companyId },
    include: { employee: { select: { fullName: true } }, lines: { include: { salary: { select: { paid: true } } } } },
  });
}

/** Adds a pay item (no id) or edits one; unpaid salaries of the employee are recalculated right away. */
export async function savePayItem(formData: FormData) {
  const id = req(formData, "id");
  const user = await requirePermission(id ? "salaries.edit" : "salaries.create", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const fail = (ar: string, en: string): never => go(back, { error: t(ar, en) });

  const kind = req(formData, "kind");
  if (!(PAY_KINDS as readonly string[]).includes(kind)) fail("اختر نوع البند", "Choose the item type");
  const amount = round3(num(formData, "amount"));
  if (amount <= 0 || amount > 10_000_000) fail("أدخل مبلغاً أكبر من صفر", "Enter an amount above zero");
  const start = readMonth(req(formData, "start"));
  if (!start) fail("اختر شهر البداية", "Choose the starting month");
  let months: number | null;
  if (kind === "ADVANCE") {
    months = intValue(formData, "installments");
    if (months < 1 || months > 120) fail("عدد الأقساط بين 1 و120", "Instalments must be between 1 and 120");
  } else {
    const repeat = req(formData, "repeat");
    months = repeat === "ongoing" ? null : repeat === "months" ? intValue(formData, "monthsCount") : 1;
    if (months !== null && (months < 1 || months > 120)) fail("عدد الأشهر بين 1 و120", "Months must be between 1 and 120");
  }
  if (months === 1 && !canEditPeriod(await periodStatus(user.companyId, start!.year, start!.month))) {
    fail(
      "مسير هذا الشهر معتمد أو مقفل؛ اختر شهراً لاحقاً مسيره مسودة، أو سجّل تصحيحاً من صفحة الراتب.",
      "That month's payroll is approved or locked; choose a later month whose payroll is a draft, or record a correction from the salary page.",
    );
  }
  const method = req(formData, "paymentMethod");
  const data = {
    kind,
    title: clip(str(formData, "title"), 120) || PAY_KIND_LABEL[kind].ar,
    amount,
    issuedAt: parseDateInput(req(formData, "issuedAt")) || parseDateInput(todayInputValue())!,
    startYear: start!.year,
    startMonth: start!.month,
    months,
    paymentMethod: kind === "ADVANCE" && PAYMENT_LABEL[method] ? method : null,
    notes: clip(str(formData, "notes"), 500),
  };

  let employeeId: string;
  let employeeName: string;
  if (id) {
    const item = await ownItem(id, user.companyId);
    if (!item) fail("البند غير موجود", "Item not found");
    const paidLines = item!.lines.filter((line) => line.salary.paid);
    const paidAmount = round3(paidLines.reduce((sum, line) => sum + line.amount, 0));
    if (paidLines.length && kind !== item!.kind) fail("لا يمكن تغيير النوع بعد صرف رواتب طُبّق فيها البند", "The type cannot change after salaries with this item were paid");
    if (kind === "ADVANCE" && amount < paidAmount)
      fail(`المبلغ أقل مما سُدّد فعلاً (${money(paidAmount, user.company.currency)})`, `The amount is below what was already repaid (${money(paidAmount, user.company.currency)})`);
    employeeId = item!.employeeId;
    employeeName = item!.employee.fullName;
  } else {
    const employee = await prisma.employee.findFirst({ where: { id: req(formData, "employeeId"), companyId: user.companyId }, select: { id: true, fullName: true } });
    if (!employee) fail("اختر الموظف", "Choose the employee");
    employeeId = employee!.id;
    employeeName = employee!.fullName;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.payItem.update({ where: { id }, data })
      : await tx.payItem.create({ data: { ...data, companyId: user.companyId, employeeId, createdByName: user.name } });
    const count = await syncEmployeeSalaries(tx, employeeId, user.company.salaryDays);
    return { saved, count };
  }, TX);

  const label = PAY_KIND_LABEL[kind];
  const period = `${monthName(start!.month, "ar")} ${start!.year}`;
  const periodEn = `${monthName(start!.month, "en")} ${start!.year}`;
  await writeAudit({
    userId: user.id,
    employeeId,
    action: id ? "PAY_ITEM_UPDATE" : "PAY_ITEM_CREATE",
    message: t(
      `${id ? "عدّل" : "أضاف"} ${label.ar} «${data.title}» لـ ${employeeName}: ${money(amount, user.company.currency)} من ${period}`,
      `${id ? "Edited" : "Added"} ${label.en} "${data.title}" for ${employeeName}: ${money(amount, user.company.currency)} from ${periodEn}`,
    ),
  });
  refreshAll();
  const synced = updated.count
    ? t(` وأُعيد احتساب ${updated.count} راتب غير مصروف`, `; ${updated.count} unpaid salary record(s) recalculated`)
    : "";
  go(back, { message: `${id ? t("تم حفظ التعديل", "Changes saved") : t(`تمت إضافة ${label.ar}`, `${label.en} added`)}${synced}` });
}

/** Stops an item (an advance: waives what is left) or resumes it. Paid salaries are not touched. */
export async function togglePayItem(formData: FormData) {
  const user = await requirePermission("salaries.edit", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const item = await ownItem(req(formData, "id"), user.companyId);
  if (!item) go(back, { error: t("البند غير موجود", "Item not found") });
  const stopping = !item!.stoppedAt;
  await prisma.$transaction(async (tx) => {
    await tx.payItem.update({ where: { id: item!.id }, data: { stoppedAt: stopping ? new Date() : null } });
    await syncEmployeeSalaries(tx, item!.employeeId, user.company.salaryDays);
  }, TX);
  await writeAudit({
    userId: user.id,
    employeeId: item!.employeeId,
    action: stopping ? "PAY_ITEM_STOP" : "PAY_ITEM_RESUME",
    message: t(
      `${stopping ? "أوقف" : "استأنف"} ${PAY_KIND_LABEL[item!.kind]?.ar || ""} «${item!.title}» لـ ${item!.employee.fullName}`,
      `${stopping ? "Stopped" : "Resumed"} ${PAY_KIND_LABEL[item!.kind]?.en || ""} "${item!.title}" for ${item!.employee.fullName}`,
    ),
  });
  refreshAll();
  go(back, { message: stopping ? t("تم إيقاف البند ولن يُطبّق على الرواتب غير المصروفة", "Item stopped; it no longer applies to unpaid salaries") : t("تم استئناف البند", "Item resumed") });
}

/** Deletes an item that never reached a paid salary; otherwise it must be stopped so paid records stay explained. */
export async function deletePayItem(formData: FormData) {
  const user = await requirePermission("salaries.delete", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const item = await ownItem(req(formData, "id"), user.companyId);
  if (!item) go(back, { error: t("البند غير موجود", "Item not found") });
  if (item!.lines.some((line) => line.salary.paid)) {
    go(back, {
      error: t(
        "هذا البند طُبّق في رواتب مصروفة فلا يُحذف. استخدم «إيقاف» حتى لا يُطبّق بعد الآن.",
        "This item is part of paid salaries and cannot be deleted. Use Stop so it no longer applies.",
      ),
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.salaryLine.deleteMany({ where: { payItemId: item!.id } });
    await tx.payItem.delete({ where: { id: item!.id } });
    await syncEmployeeSalaries(tx, item!.employeeId, user.company.salaryDays);
  }, TX);
  await writeAudit({
    userId: user.id,
    employeeId: item!.employeeId,
    action: "PAY_ITEM_DELETE",
    message: t(
      `حذف ${PAY_KIND_LABEL[item!.kind]?.ar || ""} «${item!.title}» (${money(item!.amount, user.company.currency)}) لـ ${item!.employee.fullName}`,
      `Deleted ${PAY_KIND_LABEL[item!.kind]?.en || ""} "${item!.title}" (${money(item!.amount, user.company.currency)}) for ${item!.employee.fullName}`,
    ),
  });
  refreshAll();
  go(back, { message: t("تم حذف البند", "Item deleted") });
}
