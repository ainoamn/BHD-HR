"use server";

import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { muscatDay } from "@/lib/clock";
import { EXPENSE_CATEGORIES, EXPENSE_PAY_LABEL, EXPENSE_PAY_METHODS, MAX_EXPENSE_AMOUNT } from "@/lib/expenses";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { keyToPeriod, monthKey, syncEmployeeSalaries } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { clip, money, num, parseDateInput, req, round3, safeReturn, str, todayInputValue } from "@/lib/utils";

const LIST = "/expenses";
const TX = { maxWait: 10_000, timeout: 30_000 };

async function ownClaim(id: string, companyId: string) {
  return prisma.expenseClaim.findFirst({ where: { id, companyId }, include: { employee: { select: { id: true, fullName: true } } } });
}

/** HR records a claim for an employee; it can be approved in the same step. */
export async function addExpense(formData: FormData) {
  const user = await requirePermission("expenses.create", LIST);
  const { lang, t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const employee = await prisma.employee.findFirst({ where: { id: req(formData, "employeeId"), companyId: user.companyId }, select: { id: true, fullName: true } });
  if (!employee) go(back, { error: t("اختر الموظف", "Choose the employee") });
  const title = clip(str(formData, "title"), 120) || "";
  if (title.length < 2) go(back, { error: t("اكتب وصف المصروف، مثل «وقود رحلة صحار»", "Describe the expense, e.g. “Fuel for the Sohar trip”") });
  const amount = round3(num(formData, "amount"));
  if (amount <= 0 || amount > MAX_EXPENSE_AMOUNT) go(back, { error: t("أدخل مبلغاً أكبر من صفر", "Enter an amount above zero") });
  const category = req(formData, "category");
  const spentAt = parseDateInput(req(formData, "spentAt")) || parseDateInput(todayInputValue())!;
  const approve = req(formData, "approve") === "1" && can(user, "expenses.edit");
  let receiptUrl: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    try {
      receiptUrl = await saveUpload(file, user.companyId, lang);
    } catch (error) {
      go(back, { error: error instanceof Error ? error.message : t("تعذر رفع الإيصال", "Could not upload the receipt") });
    }
  }
  try {
    await prisma.expenseClaim.create({
      data: {
        companyId: user.companyId,
        employeeId: employee!.id,
        category: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : "OTHER",
        title,
        amount,
        spentAt,
        receiptUrl,
        notes: clip(str(formData, "notes"), 500),
        source: "HR",
        status: approve ? "APPROVED" : "PENDING",
        decidedByName: approve ? user.name : null,
        decidedAt: approve ? new Date() : null,
      },
    });
  } catch (error) {
    await removeUpload(receiptUrl);
    console.error(error);
    go(back, { error: t("تعذر حفظ المصروف", "Could not save the expense") });
  }
  await writeAudit({
    userId: user.id,
    employeeId: employee!.id,
    action: "EXPENSE_CREATE",
    message: t(`سجّل مصروفاً لـ ${employee!.fullName}: «${title}» ${money(amount, user.company.currency)}${approve ? " (معتمد)" : ""}`, `Recorded an expense for ${employee!.fullName}: "${title}" ${money(amount, user.company.currency)}`),
  });
  refreshAll();
  go(back, { message: approve ? t("سُجّل المصروف واعتُمد — اختر طريقة الصرف", "Expense recorded and approved — choose how to pay it") : t("سُجّل المصروف بانتظار الموافقة", "Expense recorded, awaiting approval") });
}

export async function decideExpense(formData: FormData) {
  const user = await requirePermission("expenses.edit", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const claim = await ownClaim(req(formData, "id"), user.companyId);
  if (!claim) go(back, { error: t("المصروف غير موجود", "Expense not found") });
  if (claim!.status !== "PENDING") go(back, { error: t("بُتّ في هذا الطلب من قبل", "This claim was already decided") });
  const approve = req(formData, "decision") === "approve";
  const note = clip(str(formData, "note"), 300);
  if (!approve && !note) go(back, { error: t("اكتب سبب الرفض ليراه الموظف", "Give the reason for rejecting so the employee can see it") });
  await prisma.expenseClaim.update({
    where: { id: claim!.id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedByName: user.name, decidedAt: new Date(), decisionNote: note },
  });
  await writeAudit({
    userId: user.id,
    employeeId: claim!.employeeId,
    action: approve ? "EXPENSE_APPROVE" : "EXPENSE_REJECT",
    message: t(
      `${approve ? "اعتمد" : "رفض"} مصروف ${claim!.employee.fullName} «${claim!.title}» ${money(claim!.amount, user.company.currency)}${note ? ` — ${note}` : ""}`,
      `${approve ? "Approved" : "Rejected"} ${claim!.employee.fullName}'s expense "${claim!.title}"`,
    ),
  });
  refreshAll();
  go(back, { message: approve ? t("اعتُمد المصروف — بقي صرفه", "Expense approved — it still needs paying") : t("رُفض المصروف", "Expense rejected") });
}

/**
 * Pays an approved claim. SALARY adds a one-month entitlement to the first salary month that is not paid yet
 * (this month, or the next one when this month's salary has gone out); other methods are paid on the spot.
 */
export async function payExpense(formData: FormData) {
  const user = await requirePermission("expenses.pay", LIST);
  const { lang, t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const claim = await ownClaim(req(formData, "id"), user.companyId);
  if (!claim) go(back, { error: t("المصروف غير موجود", "Expense not found") });
  if (claim!.status !== "APPROVED") go(back, { error: t("اعتمد المصروف قبل صرفه", "Approve the expense before paying it") });
  const method = req(formData, "method");
  if (!(EXPENSE_PAY_METHODS as readonly string[]).includes(method)) go(back, { error: t("اختر طريقة الصرف", "Choose how to pay") });
  const label = EXPENSE_PAY_LABEL[method];

  if (method === "SALARY") {
    if (!can(user, "salaries.create")) go(back, { error: t("إضافة المصروف للراتب تحتاج صلاحية إضافة بنود الرواتب", "Adding it to a salary needs permission to add pay items") });
    const [year, month] = muscatDay().split("-").map(Number);
    let key = monthKey(year, month);
    const paidThisMonth = await prisma.salary.count({ where: { employeeId: claim!.employeeId, year, month, paid: true } });
    if (paidThisMonth) key += 1;
    const period = keyToPeriod(key);
    await prisma.$transaction(async (tx) => {
      const item = await tx.payItem.create({
        data: {
          companyId: user.companyId,
          employeeId: claim!.employeeId,
          kind: "ENTITLEMENT",
          title: `تعويض مصروف: ${claim!.title}`.slice(0, 120),
          amount: claim!.amount,
          issuedAt: new Date(),
          startYear: period.year,
          startMonth: period.month,
          months: 1,
          notes: t("أُضيف تلقائياً من صفحة المصروفات", "Added automatically from the expenses page"),
          createdByName: user.name,
        },
      });
      await tx.expenseClaim.update({ where: { id: claim!.id }, data: { status: "PAID", payMethod: "SALARY", payItemId: item.id, paidAt: new Date(), paidByName: user.name } });
      await syncEmployeeSalaries(tx, claim!.employeeId, user.company.salaryDays);
    }, TX);
    await writeAudit({
      userId: user.id,
      employeeId: claim!.employeeId,
      action: "EXPENSE_PAY",
      message: t(
        `أضاف مصروف ${claim!.employee.fullName} «${claim!.title}» ${money(claim!.amount, user.company.currency)} إلى راتب ${monthName(period.month, "ar")} ${period.year}`,
        `Added ${claim!.employee.fullName}'s expense "${claim!.title}" to the ${monthName(period.month, "en")} ${period.year} salary`,
      ),
    });
    refreshAll();
    go(back, { message: t(`سيُصرف مع راتب ${monthName(period.month, lang)} ${period.year}`, `Will be paid with the ${monthName(period.month, lang)} ${period.year} salary`) });
  }

  await prisma.expenseClaim.update({ where: { id: claim!.id }, data: { status: "PAID", payMethod: method, paidAt: new Date(), paidByName: user.name } });
  await writeAudit({
    userId: user.id,
    employeeId: claim!.employeeId,
    action: "EXPENSE_PAY",
    message: t(
      `صرف مصروف ${claim!.employee.fullName} «${claim!.title}» ${money(claim!.amount, user.company.currency)} ${label.ar}`,
      `Paid ${claim!.employee.fullName}'s expense "${claim!.title}" by ${label.en.toLowerCase()}`,
    ),
  });
  refreshAll();
  go(back, { message: t("سُجّل صرف المصروف", "Payment recorded") });
}

/** Deletes a claim; one already added to a paid salary stays so the payslip remains explained. */
export async function deleteExpense(formData: FormData) {
  const user = await requirePermission("expenses.delete", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), LIST);
  const claim = await ownClaim(req(formData, "id"), user.companyId);
  if (!claim) go(back, { error: t("المصروف غير موجود", "Expense not found") });
  if (claim!.payItemId) {
    const paidLines = await prisma.salaryLine.count({ where: { payItemId: claim!.payItemId, salary: { paid: true } } });
    if (paidLines) go(back, { error: t("صُرف هذا المصروف ضمن راتب فلا يُحذف", "This expense was paid in a salary and cannot be deleted") });
  }
  await prisma.$transaction(async (tx) => {
    if (claim!.payItemId) {
      await tx.salaryLine.deleteMany({ where: { payItemId: claim!.payItemId } });
      await tx.payItem.deleteMany({ where: { id: claim!.payItemId, companyId: user.companyId } });
    }
    await tx.expenseClaim.delete({ where: { id: claim!.id } });
    if (claim!.payItemId) await syncEmployeeSalaries(tx, claim!.employeeId, user.company.salaryDays);
  }, TX);
  const stillUsed = claim!.receiptUrl ? await prisma.expenseClaim.count({ where: { receiptUrl: claim!.receiptUrl } }) : 0;
  if (!stillUsed) await removeUpload(claim!.receiptUrl);
  await writeAudit({
    userId: user.id,
    employeeId: claim!.employeeId,
    action: "EXPENSE_DELETE",
    message: t(`حذف مصروف ${claim!.employee.fullName} «${claim!.title}» ${money(claim!.amount, user.company.currency)}`, `Deleted ${claim!.employee.fullName}'s expense "${claim!.title}"`),
  });
  refreshAll();
  go(back, { message: t("حُذف المصروف", "Expense deleted") });
}
