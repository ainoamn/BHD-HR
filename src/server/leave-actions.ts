"use server";

import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { BALANCE_LABEL, type BalanceKey } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { clip, daysLabel, num, req, safeReturn, str } from "@/lib/utils";

export async function addLeaveCredit(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const employeeId = req(formData, "employeeId");
  const returnTo = safeReturn(formData.get("returnTo"), `/employees/${employeeId}?tab=attendance`);
  const balanceKey = req(formData, "balanceKey") as BalanceKey;
  const days = num(formData, "days");
  if (!BALANCE_LABEL[balanceKey]) go(returnTo, { error: t("نوع الرصيد غير صحيح", "Invalid balance type") });
  if (days <= 0) go(returnTo, { error: t("اكتب عدد أيام أكبر من صفر", "Enter more than zero days") });
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  await prisma.leaveCredit.create({
    data: { employeeId, balanceKey, days, reason: clip(str(formData, "reason"), 200) },
  });
  await writeAudit({
    userId: user.id,
    employeeId,
    action: "LEAVE_CREDIT",
    message: t(
      `أضاف ${daysLabel(days)} يوم إلى ${pick(BALANCE_LABEL[balanceKey], "ar")} للموظف ${employee!.fullName}`,
      `Added ${daysLabel(days)} day(s) to ${pick(BALANCE_LABEL[balanceKey], "en")} for ${employee!.fullName}`,
    ),
  });
  refreshAll();
  go(returnTo, { message: t(`تمت إضافة ${daysLabel(days)} يوم إلى الرصيد`, `Added ${daysLabel(days)} day(s) to the balance`) });
}
