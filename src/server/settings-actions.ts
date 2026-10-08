"use server";

import { writeAudit } from "@/lib/audit";
import { ROLES, requireWriter } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { removeLogoIfUnused, saveUpload } from "@/lib/uploads";
import { clip, intValue, req, str } from "@/lib/utils";

export async function updateSettings(formData: FormData) {
  const user = await requireWriter();
  const { lang, t } = await getI18n();
  const name = req(formData, "name");
  if (name.length < 2) go("/settings", { error: t("اسم النظام / المنشأة مطلوب", "System / company name is required") });
  const salaryDays = intValue(formData, "salaryDays");
  const alertUrgentDays = intValue(formData, "alertUrgentDays");
  const alertWarningDays = intValue(formData, "alertWarningDays");
  const alertEarlyDays = intValue(formData, "alertEarlyDays");
  const payDay = intValue(formData, "payDay");
  const leaveWarningDays = intValue(formData, "leaveWarningDays");
  if (salaryDays < 1 || salaryDays > 31) go("/settings", { error: t("أيام حساب الراتب يجب أن تكون بين 1 و 31", "Salary days must be between 1 and 31") });
  if (payDay < 0 || payDay > 31) go("/settings", { error: t("يوم الاستحقاق يجب أن يكون بين 0 و 31", "Pay day must be between 0 and 31") });
  if (leaveWarningDays < 0 || leaveWarningDays > 60) go("/settings", { error: t("أيام تنبيه الإجازة يجب أن تكون بين 0 و 60", "Leave alert days must be between 0 and 60") });
  if (alertUrgentDays < 1 || alertWarningDays < 1 || alertEarlyDays < 1) {
    go("/settings", { error: t("أيام التنبيه يجب أن تكون أكبر من صفر", "Alert days must be above zero") });
  }
  if (!(alertUrgentDays <= alertWarningDays && alertWarningDays <= alertEarlyDays)) {
    go("/settings", { error: t("اجعل التنبيه العاجل أقل من التحذير، والتحذير أقل من التنبيه المبكر", "Urgent ≤ warning ≤ early") });
  }
  const newName = req(formData, "userName");
  const newEmail = user.bhdSub ? user.email : req(formData, "userEmail").toLowerCase() || user.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 120) {
    go("/settings", { error: t("البريد غير صالح", "Invalid email") });
  }
  if (newEmail !== user.email && (await prisma.user.findUnique({ where: { email: newEmail } }))) {
    go("/settings", { error: t("هذا البريد مستخدم لمستخدم آخر", "This email belongs to another user") });
  }
  const newPassword = req(formData, "newPassword");
  const currentPassword = req(formData, "currentPassword");
  if (newPassword) {
    if (!verifyPassword(currentPassword, user.password)) go("/settings", { error: t("كلمة المرور الحالية غير صحيحة", "Current password is wrong") });
    if (newPassword.length < 6) go("/settings", { error: t("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف", "New password must be at least 6 characters") });
  }

  const previousLogo = user.company.logoUrl;
  let logoUrl = req(formData, "removeLogo") === "1" ? null : previousLogo;
  try {
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file, lang);
      if (saved) logoUrl = saved;
    }
  } catch (error) {
    go("/settings", { error: error instanceof Error ? error.message : t("تعذر رفع الشعار", "Could not upload logo") });
  }

  await prisma.company.update({
    where: { id: user.companyId },
    data: {
      name: clip(name, 120) || name,
      nameEn: clip(str(formData, "nameEn"), 120),
      crNumber: clip(str(formData, "crNumber"), 40),
      phone: clip(str(formData, "phone"), 30),
      email: clip(str(formData, "email"), 80),
      address: clip(str(formData, "address"), 250),
      currency: clip(str(formData, "currency"), 12) || "ر.ع",
      salaryDays,
      alertUrgentDays,
      alertWarningDays,
      alertEarlyDays,
      payDay,
      leaveWarningDays,
      logoUrl,
    },
  });
  if (logoUrl !== previousLogo) await removeLogoIfUnused(previousLogo);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: newName.length >= 2 ? clip(newName, 80) || user.name : user.name,
      email: newEmail,
      ...(newPassword ? { password: hashPassword(newPassword), mustChangePassword: false } : {}),
    },
  });
  await writeAudit({ userId: user.id, action: "SETTINGS", message: t("حدّث الإعدادات", "Updated settings") });
  refreshAll();
  go("/settings", { message: t("تم حفظ الإعدادات", "Settings saved") });
}

export async function updateUserRole(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  if (user.role !== "ADMIN") go("/settings", { error: t("هذه الصلاحية للمسؤول فقط", "Administrators only") });
  const userId = req(formData, "userId");
  const role = req(formData, "role");
  if (!(ROLES as readonly string[]).includes(role)) go("/settings", { error: t("صلاحية غير معروفة", "Unknown role") });
  if (userId === user.id) go("/settings", { error: t("لا يمكنك تغيير صلاحيتك بنفسك", "You cannot change your own role") });
  const member = await prisma.user.findFirst({ where: { id: userId, companyId: user.companyId } });
  if (!member) go("/settings", { error: t("المستخدم غير موجود", "User not found") });
  await prisma.user.update({ where: { id: member!.id }, data: { role } });
  await writeAudit({ userId: user.id, action: "USER_ROLE", message: `${member!.email}: ${member!.role} → ${role}` });
  refreshAll();
  go("/settings", { message: t("تم تحديث صلاحية المستخدم", "User role updated") });
}
