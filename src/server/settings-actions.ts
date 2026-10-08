"use server";

import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { writeAudit } from "@/lib/audit";
import { isRole, requireAdmin, requireUser } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { hashPassword, verifyPassword } from "@/lib/password";
import { normalizePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { removeLogoIfUnused, saveUpload } from "@/lib/uploads";
import { clip, intValue, req, str } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateCompanySettings(formData: FormData) {
  const user = await requireAdmin();
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

  const previousLogo = user.company.logoUrl;
  let logoUrl = req(formData, "removeLogo") === "1" ? null : previousLogo;
  try {
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file, user.companyId, lang);
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
  await writeAudit({ userId: user.id, action: "SETTINGS", message: t("حدّث إعدادات المنشأة", "Updated company settings") });
  refreshAll();
  go("/settings", { message: t("تم حفظ إعدادات المنشأة", "Company settings saved") });
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  const newName = req(formData, "userName");
  const newEmail = user.bhdSub ? user.email : req(formData, "userEmail").toLowerCase() || user.email;
  if (!EMAIL.test(newEmail) || newEmail.length > 120) go("/settings", { error: t("البريد غير صالح", "Invalid email") });
  if (newEmail !== user.email && (await prisma.user.findUnique({ where: { email: newEmail } }))) {
    go("/settings", { error: t("هذا البريد مستخدم لمستخدم آخر", "This email belongs to another user") });
  }
  const newPassword = req(formData, "newPassword");
  const currentPassword = req(formData, "currentPassword");
  if (newPassword) {
    if (!verifyPassword(currentPassword, user.password)) go("/settings", { error: t("كلمة المرور الحالية غير صحيحة", "Current password is wrong") });
    if (newPassword.length < 6) go("/settings", { error: t("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف", "New password must be at least 6 characters") });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: newName.length >= 2 ? clip(newName, 80) || user.name : user.name,
      email: newEmail,
      ...(newPassword ? { password: hashPassword(newPassword), mustChangePassword: false } : {}),
    },
  });
  if (newEmail !== user.email) {
    await prisma.membership.updateMany({ where: { userId: user.id }, data: { email: newEmail } });
  }
  await writeAudit({ userId: user.id, action: "PROFILE", message: t("حدّث بياناته الشخصية", "Updated own profile") });
  refreshAll();
  go("/settings", { message: t("تم حفظ بياناتك", "Your details were saved") });
}

const MEMBERS = "/settings#members";

function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

/** Role and, for CUSTOM, the ticked permissions. Presets ignore the list. */
async function readAccess(formData: FormData) {
  const { t } = await getI18n();
  const role = req(formData, "role");
  if (!isRole(role)) go(MEMBERS, { error: t("صلاحية غير معروفة", "Unknown role") });
  const permissions = role === "CUSTOM" ? normalizePermissions(formData.getAll("perm")) : null;
  if (role === "CUSTOM" && !permissions!.length) go(MEMBERS, { error: t("اختر صلاحية واحدة على الأقل", "Choose at least one permission") });
  return { role, permissions };
}

function accessLabel(role: string, permissions: string[] | null) {
  return role === "CUSTOM" ? `CUSTOM (${permissions?.length ?? 0})` : role;
}

/**
 * Creates the membership with a one-time link. Anyone already registered with that email gets access at once;
 * otherwise it attaches on their first BHD sign-in or when they open the link.
 */
export async function inviteMember(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const email = req(formData, "email").toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) go(MEMBERS, { error: t("البريد غير صالح", "Invalid email") });
  const { role, permissions } = await readAccess(formData);
  if (await prisma.membership.findUnique({ where: { companyId_email: { companyId: user.companyId, email } } })) {
    go(MEMBERS, { error: t("هذا البريد عضو في المنشأة مسبقاً", "This email is already a member") });
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const member = await prisma.membership.create({
    data: {
      companyId: user.companyId,
      email,
      role,
      permissions: permissions ?? Prisma.DbNull,
      userId: existing?.id ?? null,
      inviteToken: newInviteToken(),
      invitedById: user.id,
      invitedAt: new Date(),
    },
  });
  await writeAudit({
    userId: user.id,
    action: "MEMBER_INVITE",
    message: t(`دعا ${email} بصلاحية ${accessLabel(role, permissions)}`, `Invited ${email} as ${accessLabel(role, permissions)}`),
  });
  refreshAll();
  go(`/settings?invite=${member.id}#members`, {
    message: t("تم إنشاء الدعوة. انسخ الرابط وأرسله للمستخدم.", "Invitation created. Copy the link and send it to the user."),
  });
}

async function memberOfCompany(membershipId: string, companyId: string) {
  const { t } = await getI18n();
  const member = await prisma.membership.findFirst({ where: { id: membershipId, companyId } });
  if (!member) go(MEMBERS, { error: t("العضو غير موجود", "Member not found") });
  return member!;
}

export async function updateMemberAccess(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const member = await memberOfCompany(req(formData, "membershipId"), user.companyId);
  if (member.id === user.membershipId) go(MEMBERS, { error: t("لا يمكنك تغيير صلاحيتك بنفسك", "You cannot change your own access") });
  const { role, permissions } = await readAccess(formData);
  await prisma.membership.update({ where: { id: member.id }, data: { role, permissions: permissions ?? Prisma.DbNull } });
  const before = accessLabel(member.role, Array.isArray(member.permissions) ? (member.permissions as string[]) : null);
  await writeAudit({ userId: user.id, action: "MEMBER_ROLE", message: `${member.email}: ${before} → ${accessLabel(role, permissions)}` });
  refreshAll();
  go(MEMBERS, { message: t(`تم حفظ صلاحيات ${member.email}`, `Saved permissions for ${member.email}`) });
}

/** Issues a fresh link; the previous one stops working. */
export async function renewInviteLink(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const member = await memberOfCompany(req(formData, "membershipId"), user.companyId);
  if (member.acceptedAt) go(MEMBERS, { error: t("قَبِل هذا العضو الدعوة مسبقاً", "This member already accepted") });
  await prisma.membership.update({ where: { id: member.id }, data: { inviteToken: newInviteToken(), invitedAt: new Date(), invitedById: user.id } });
  await writeAudit({ userId: user.id, action: "MEMBER_INVITE", message: t(`جدّد رابط دعوة ${member.email}`, `Renewed the invitation link for ${member.email}`) });
  refreshAll();
  go(`/settings?invite=${member.id}#members`, { message: t("تم إنشاء رابط جديد وأُلغي الرابط السابق", "New link created; the old link no longer works") });
}

export async function removeMember(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const member = await memberOfCompany(req(formData, "membershipId"), user.companyId);
  if (member.id === user.membershipId) go(MEMBERS, { error: t("لا يمكنك إزالة نفسك", "You cannot remove yourself") });
  await prisma.membership.delete({ where: { id: member.id } });
  await writeAudit({
    userId: user.id,
    action: "MEMBER_REMOVE",
    message: member.userId
      ? t(`أزال ${member.email} من المنشأة`, `Removed ${member.email} from the company`)
      : t(`ألغى دعوة ${member.email}`, `Cancelled the invitation for ${member.email}`),
  });
  refreshAll();
  go(MEMBERS, { message: member.userId ? t("تمت إزالة العضو", "Member removed") : t("أُلغيت الدعوة", "Invitation cancelled") });
}
