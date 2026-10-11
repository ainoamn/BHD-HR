"use server";

import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { leaveName } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { clip, daysLabel, num, req, safeReturn, str } from "@/lib/utils";

export async function addLeaveCredit(formData: FormData) {
  const user = await requirePermission("attendance.edit", "/attendance");
  const { t } = await getI18n();
  const employeeId = req(formData, "employeeId");
  const returnTo = safeReturn(formData.get("returnTo"), `/employees/${employeeId}?tab=attendance`);
  const balanceKey = req(formData, "balanceKey");
  const days = num(formData, "days");
  const type = (await getLeaveTypes(user.companyId)).find((item) => item.key === balanceKey);
  if (!type) go(returnTo, { error: t("نوع الرصيد غير صحيح", "Invalid balance type") });
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
      `أضاف ${daysLabel(days)} يوم إلى ${leaveName(type!, "ar")} للموظف ${employee!.fullName}`,
      `Added ${daysLabel(days)} day(s) to ${leaveName(type!, "en")} for ${employee!.fullName}`,
    ),
  });
  refreshAll();
  go(returnTo, { message: t(`تمت إضافة ${daysLabel(days)} يوم إلى الرصيد`, `Added ${daysLabel(days)} day(s) to the balance`) });
}
