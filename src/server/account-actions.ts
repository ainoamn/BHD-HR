"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import {
  PERSON_ROLES,
  loginUrl,
  newPassword,
  openAndSend,
  openSecret,
  sealSecret,
  sendCredentials,
  sendSummary,
} from "@/lib/accounts";
import { writeAudit } from "@/lib/audit";
import { type SessionUser, STAFF_ROLES, can, homePath, isRole, isStaffRole, requireAdmin, requirePermission, requireUser } from "@/lib/auth";
import { readIds } from "@/lib/employee-filter";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { hashPassword, verifyPassword } from "@/lib/password";
import { TUNABLE_ROLES, type TunableRole, normalizePermissions, normalizeTeamPermissions, readRoleMap } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { req } from "@/lib/utils";

const ROLE_NAME: Record<string, string> = {
  EMPLOYEE: "موظف",
  TEAM_MANAGER: "مدير فريق",
  EMPLOYER: "صاحب عمل",
  VIEWER: "مستخدم",
  MANAGER: "مدير الموارد البشرية",
  ADMIN: "مسؤول",
  CUSTOM: "مخصص",
};

function companyName(user: SessionUser) {
  return user.company.name;
}

/**
 * The account and where to send the user back. Employee accounts follow employees.edit, sponsor accounts
 * employers.edit; anything holding a main-system role, or not tied to a person, is the admin's.
 */
async function manageable(membershipId: string) {
  const user = await requireUser();
  const { t } = await getI18n();
  const member = await prisma.membership.findFirst({
    where: { id: membershipId, companyId: user.companyId },
    include: { user: { include: { _count: { select: { memberships: true } } } }, employee: { select: { id: true, fullName: true, email: true, phone: true } }, employer: { select: { id: true, name: true, email: true, phone: true } } },
  });
  const back = member?.employeeId ? `/employees/${member.employeeId}#account` : member?.employerId ? `/employers/${member.employerId}#account` : "/settings#members";
  if (!member) go("/", { error: t("الحساب غير موجود", "Account not found") });
  if (member!.id === user.membershipId) go(back, { error: t("لا يمكنك تعديل حسابك من هنا", "You cannot change your own account here") });
  const isAdmin = user.role === "ADMIN";
  const allowed = isAdmin || (!isStaffRole(member!.role) && (member!.employeeId ? can(user, "employees.edit") : member!.employerId ? can(user, "employers.edit") : false));
  if (!allowed) go(back, { error: t("هذا الإجراء للمسؤول فقط", "Only an admin can do this") });
  const person = member!.employee
    ? { name: member!.employee.fullName, email: member!.employee.email, phone: member!.employee.phone }
    : member!.employer
      ? { name: member!.employer.name, email: member!.employer.email, phone: member!.employer.phone }
      : { name: member!.user?.name || member!.email, email: member!.email, phone: null };
  return { user, member: member!, back, isAdmin, person, t };
}

/** Opens an account from the employee or sponsor page for someone who does not have one. */
export async function openPersonAccount(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  const kind = req(formData, "kind");
  const id = req(formData, "id");
  const origin = await requestOrigin();
  if (kind === "employer") {
    const back = `/employers/${id}#account`;
    if (!can(user, "employers.edit")) go(back, { error: t("ليست لديك صلاحية", "Not allowed") });
    const employer = await prisma.employer.findFirst({ where: { id, companyId: user.companyId } });
    if (!employer) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
    const { sent } = await openAndSend({
      companyId: user.companyId,
      role: "EMPLOYER",
      person: { name: employer!.name, email: employer!.email, phone: employer!.phone },
      employerId: employer!.id,
      actorId: user.id,
      companyName: companyName(user),
      origin,
      label: "صاحب عمل",
    });
    refreshAll();
    go(back, { message: t("فُتح حساب صاحب العمل", "Sponsor account opened") + sendSummary(sent, t) });
  }
  const back = `/employees/${id}#account`;
  if (!can(user, "employees.edit")) go(back, { error: t("ليست لديك صلاحية", "Not allowed") });
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { _count: { select: { reports: { where: { status: { not: "TERMINATED" } } } } } } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  if (employee!.status === "TERMINATED") go(back, { error: t("انتهت خدمة هذا الموظف", "This employee's service has ended") });
  const role = employee!._count.reports > 0 || req(formData, "role") === "TEAM_MANAGER" ? "TEAM_MANAGER" : "EMPLOYEE";
  const { sent } = await openAndSend({
    companyId: user.companyId,
    role,
    person: { name: employee!.fullName, email: employee!.email, phone: employee!.phone },
    employeeId: employee!.id,
    actorId: user.id,
    companyName: companyName(user),
    origin,
    label: ROLE_NAME[role],
  });
  refreshAll();
  go(back, { message: t("فُتح حساب الدخول", "Account opened") + sendSummary(sent, t) });
}

/** A new temporary password; the old one stops working. Only for accounts this system opened in this company. */
export async function resetAccountPassword(formData: FormData) {
  const { user, member, back, person, t } = await manageable(req(formData, "membershipId"));
  if (!member.user?.username || member.user.bhdSub || member.user._count.memberships > 1) {
    go(back, { error: t("هذا الشخص يدخل بحسابه الخاص؛ لا يمكن تغيير كلمة مروره من هنا.", "This person signs in with their own account; its password cannot be changed here.") });
  }
  const password = newPassword();
  await prisma.user.update({ where: { id: member.userId! }, data: { password: hashPassword(password), tempPassword: sealSecret(password), mustChangePassword: true } });
  const sent = await sendCredentials({ ...person, company: companyName(user), username: member.user!.username!, password, url: loginUrl(await requestOrigin()) });
  await writeAudit({ userId: user.id, employeeId: member.employeeId, action: "ACCOUNT_PASSWORD", message: `أنشأ كلمة مرور مؤقتة جديدة لحساب ${person.name}` });
  refreshAll();
  go(back, { message: t("أُنشئت كلمة مرور مؤقتة جديدة", "New temporary password created") + sendSummary(sent, t) });
}

/** Sends the current temporary details again on the configured channels. */
export async function resendAccountDetails(formData: FormData) {
  const { user, member, back, person, t } = await manageable(req(formData, "membershipId"));
  const password = member.user?.bhdSub ? null : openSecret(member.user?.tempPassword);
  if (!member.user?.username || !password) go(back, { error: t("غيّر صاحب الحساب كلمة مروره؛ أنشئ كلمة مؤقتة جديدة إن نسيها.", "The person already set their own password; create a new temporary one if they forgot it.") });
  const sent = await sendCredentials({ ...person, company: companyName(user), username: member.user!.username!, password: password!, url: loginUrl(await requestOrigin()) });
  if (sent.email !== "sent" && sent.whatsapp !== "sent") {
    go(back, { error: t("لا توجد قناة إرسال مفعّلة لهذا الشخص. استخدم أزرار المشاركة اليدوية.", "No active sending channel for this person. Use the manual share buttons.") });
  }
  go(back, { message: t("أُعيد إرسال بيانات الدخول", "Sign-in details sent again") + sendSummary(sent, t) });
}

/** Employee ↔ team manager is HR's call; any main-system role (for example HR manager) is the admin's. */
export async function setAccountRole(formData: FormData) {
  const { user, member, back, isAdmin, person, t } = await manageable(req(formData, "membershipId"));
  const role = req(formData, "role");
  if (!isRole(role) || role === "CUSTOM") go(back, { error: t("دور غير معروف", "Unknown role") });
  const personRoles: readonly string[] = member.employerId ? ["EMPLOYER"] : PERSON_ROLES.filter((item) => item !== "EMPLOYER");
  if (!personRoles.includes(role) && !(STAFF_ROLES as readonly string[]).includes(role)) go(back, { error: t("دور غير مناسب لهذا الحساب", "Role does not fit this account") });
  if (isStaffRole(role) && !isAdmin) go(back, { error: t("منح صلاحيات النظام للمسؤول فقط", "Only an admin can grant system access") });
  if (role === member.role) go(back, { message: t("لم يتغير شيء", "Nothing changed") });
  await prisma.membership.update({ where: { id: member.id }, data: { role, permissions: Prisma.DbNull } });
  await writeAudit({ userId: user.id, employeeId: member.employeeId, action: "ACCOUNT_ROLE", message: `غيّر دور حساب ${person.name}: ${ROLE_NAME[member.role] || member.role} ← ${ROLE_NAME[role] || role}` });
  refreshAll();
  go(back, { message: t(`أصبح دور ${person.name}: ${ROLE_NAME[role]}`, `${person.name}'s role is now ${role}`) });
}

/** Ends this company's access. The sign-in itself stays (it may belong to other companies) but opens nothing here. */
export async function closeAccount(formData: FormData) {
  const { user, member, back, person, t } = await manageable(req(formData, "membershipId"));
  await prisma.membership.delete({ where: { id: member.id } });
  await writeAudit({ userId: user.id, employeeId: member.employeeId, action: "ACCOUNT_CLOSE", message: `أوقف حساب دخول ${person.name}` });
  refreshAll();
  go(back, { message: t("أُوقف الحساب", "Account closed") });
}

const BATCH = 60;

/** Opens accounts for every active employee and/or sponsor that has none; people with reports become team managers. */
export async function openAccountsForAll(formData: FormData) {
  const user = await requireAdmin("/settings#roles");
  const { t } = await getI18n();
  const origin = await requestOrigin();
  const back = "/settings#roles";
  const withEmployees = req(formData, "employees") === "1";
  const withEmployers = req(formData, "employers") === "1";
  if (!withEmployees && !withEmployers) go(back, { error: t("اختر الموظفين أو أصحاب العمل", "Choose employees or sponsors") });
  const employees = withEmployees
    ? await prisma.employee.findMany({
        where: { companyId: user.companyId, status: { not: "TERMINATED" }, account: null },
        include: { _count: { select: { reports: { where: { status: { not: "TERMINATED" } } } } } },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      })
    : [];
  const employers = withEmployers ? await prisma.employer.findMany({ where: { companyId: user.companyId, account: null }, orderBy: { createdAt: "asc" }, take: Math.max(0, BATCH - employees.length) }) : [];
  let opened = 0;
  let emailed = 0;
  for (const employee of employees) {
    const role = employee._count.reports > 0 ? "TEAM_MANAGER" : "EMPLOYEE";
    const result = await openAndSend({
      companyId: user.companyId,
      role,
      person: { name: employee.fullName, email: employee.email, phone: employee.phone },
      employeeId: employee.id,
      actorId: user.id,
      companyName: companyName(user),
      origin,
      label: ROLE_NAME[role],
    });
    opened += 1;
    if (result.sent?.email === "sent" || result.sent?.whatsapp === "sent") emailed += 1;
  }
  for (const employer of employers) {
    const result = await openAndSend({
      companyId: user.companyId,
      role: "EMPLOYER",
      person: { name: employer.name, email: employer.email, phone: employer.phone },
      employerId: employer.id,
      actorId: user.id,
      companyName: companyName(user),
      origin,
      label: ROLE_NAME.EMPLOYER,
    });
    opened += 1;
    if (result.sent?.email === "sent" || result.sent?.whatsapp === "sent") emailed += 1;
  }
  refreshAll();
  const more = opened >= BATCH ? t(" — بقي آخرون، اضغط مرة أخرى", " — more remain, press again") : "";
  go(back, {
    message: opened
      ? t(`فُتح ${opened} حساب، وأُرسلت البيانات تلقائياً لـ ${emailed}${more}`, `Opened ${opened} account(s); details sent automatically to ${emailed}${more}`)
      : t("لكل شخص حساب بالفعل", "Everyone already has an account"),
  });
}

/** From the employees list: an account for every current employee still without one (those added before accounts were automatic). */
export async function openMissingEmployeeAccounts(formData?: FormData) {
  const user = await requirePermission("employees.edit");
  const { t } = await getI18n();
  const origin = await requestOrigin();
  const ids = formData ? readIds(formData.getAll("ids").map(String).join(",")) : [];
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" }, account: null, ...(ids.length ? { id: { in: ids } } : {}) },
    include: { _count: { select: { reports: { where: { status: { not: "TERMINATED" } } } } } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let sent = 0;
  for (const employee of employees) {
    const role = employee._count.reports > 0 ? "TEAM_MANAGER" : "EMPLOYEE";
    const result = await openAndSend({
      companyId: user.companyId,
      role,
      person: { name: employee.fullName, email: employee.email, phone: employee.phone },
      employeeId: employee.id,
      actorId: user.id,
      companyName: companyName(user),
      origin,
      label: ROLE_NAME[role],
    });
    if (result.sent?.email === "sent" || result.sent?.whatsapp === "sent") sent += 1;
  }
  refreshAll();
  if (!employees.length) go("/employees", { message: t("لكل موظف حساب دخول بالفعل", "Every employee already has a sign-in account") });
  const more = employees.length >= BATCH ? t(" بقي آخرون، اضغط مرة أخرى.", " More remain; press again.") : "";
  go("/employees", {
    message: t(
      `فُتح ${employees.length} حساب دخول، وأُرسلت البيانات تلقائياً لـ ${sent}. اسم المستخدم وكلمة المرور المؤقتة وأزرار المشاركة في بطاقة «حساب الدخول» بملف كل موظف.${more}`,
      `Opened ${employees.length} sign-in account(s); details sent automatically to ${sent}. Each employee's username, temporary password and share buttons are on the “Sign-in account” card in their file.${more}`,
    ),
  });
}

/** Saves the permission list of one role for the whole company, or puts the built-in preset back. */
export async function saveRolePermissions(formData: FormData) {
  const user = await requireAdmin("/settings#roles");
  const { t } = await getI18n();
  const back = "/settings#roles";
  const role = req(formData, "role") as TunableRole;
  if (!(TUNABLE_ROLES as readonly string[]).includes(role)) go(back, { error: t("دور غير معروف", "Unknown role") });
  const map = readRoleMap(user.company.rolePermissions);
  const reset = req(formData, "reset") === "1";
  if (reset) delete map[role];
  else {
    const list = role === "MANAGER" || role === "VIEWER" ? normalizePermissions(formData.getAll("perm")) : normalizeTeamPermissions(formData.getAll("perm"));
    map[role] = list;
  }
  await prisma.company.update({ where: { id: user.companyId }, data: { rolePermissions: map } });
  await writeAudit({ userId: user.id, action: "ROLE_PERMISSIONS", message: reset ? `أعاد صلاحيات دور ${ROLE_NAME[role]} إلى الافتراضي` : `عدّل صلاحيات دور ${ROLE_NAME[role]} (${map[role]!.length} صلاحية)` });
  refreshAll();
  go(back, { message: t(`حُفظت صلاحيات دور ${ROLE_NAME[role]}`, `Saved the ${role} role permissions`) });
}

/** First sign-in of a system-opened account, or any time the person wants a new password. */
export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const { t } = await getI18n();
  if (user.bhdSub && !user.password) go("/password", { error: t("كلمة مرورك تُدار في حساب BHD الموحّد.", "Your password is managed in your BHD account.") });
  const next = req(formData, "password");
  const confirm = req(formData, "confirm");
  const back = "/password";
  if (!user.mustChangePassword && !verifyPassword(req(formData, "current"), user.password)) go(back, { error: t("كلمة المرور الحالية غير صحيحة", "Current password is wrong") });
  if (next.length < 8) go(back, { error: t("كلمة المرور يجب ألا تقل عن 8 أحرف", "Use at least 8 characters") });
  if (next !== confirm) go(back, { error: t("كلمتا المرور غير متطابقتين", "The passwords do not match") });
  if (verifyPassword(next, user.password)) go(back, { error: t("اختر كلمة مرور مختلفة عن المؤقتة", "Choose a password different from the temporary one") });
  await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(next), mustChangePassword: false, tempPassword: null } });
  await prisma.membership.updateMany({ where: { userId: user.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
  await writeAudit({ userId: user.id, employeeId: user.employeeId, action: "PASSWORD_SET", message: `اختار ${user.name} كلمة مرور جديدة` });
  refreshAll();
  redirect(`${homePath(user)}${homePath(user).includes("?") ? "&" : "?"}message=${encodeURIComponent(t("تم حفظ كلمة المرور الجديدة", "New password saved"))}`);
}