"use server";

import { openAndSend, sendSummary } from "@/lib/accounts";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND } from "@/lib/constants";
import {
  isEmployeeNumberSort,
  normalizeEmployeeCode,
  rebuildEmployerEmployeeNumbers,
  suggestEmployeeCode,
} from "@/lib/employee-number";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { removeLogoIfUnused, saveUpload } from "@/lib/uploads";
import { normalizePhone } from "@/lib/phone";
import { clip, req, str } from "@/lib/utils";

function readEmployer(formData: FormData) {
  const kind = req(formData, "kind");
  return {
    name: clip(req(formData, "name"), 150) || "",
    nameEn: clip(str(formData, "nameEn"), 150),
    kind: EMPLOYER_KIND[kind] ? kind : "COMPANY",
    idNumber: clip(str(formData, "idNumber"), 40),
    phone: clip(normalizePhone(str(formData, "phone")), 30),
    email: clip(str(formData, "email"), 80),
    address: clip(str(formData, "address"), 250),
    notes: clip(str(formData, "notes"), 500),
  };
}

function readEmployeeCode(formData: FormData) {
  const raw = String(str(formData, "employeeCode") || "");
  if (!raw.trim()) return { raw, code: null as string | null, invalid: false };
  const code = normalizeEmployeeCode(raw);
  return { raw, code: code || null, invalid: !code };
}

async function uploadLogo(formData: FormData, companyId: string, current: string | null, errorPath: string) {
  const { lang, t } = await getI18n();
  try {
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file, companyId, lang);
      if (saved) return saved;
    }
    if (req(formData, "removeLogo") === "1") return null;
  } catch (error) {
    go(errorPath, { error: error instanceof Error ? error.message : t("تعذر رفع الشعار", "Could not upload logo") });
  }
  return current;
}

export async function createEmployer(formData: FormData) {
  const user = await requirePermission("employers.create", "/employers");
  const { t } = await getI18n();
  const data = readEmployer(formData);
  if (data.name.length < 2) go("/employers", { error: t("اسم الكفيل مطلوب", "Sponsor name is required") });
  const codeField = readEmployeeCode(formData);
  if (codeField.invalid) {
    go("/employers", { error: t("رمز الأرقام: حرفان إلى 8 من A–Z أو 0–9 فقط", "Number code: 2–8 characters, A–Z or 0–9 only") });
  }
  const employeeCode = codeField.code || suggestEmployeeCode(data.name, data.nameEn) || null;
  const logoUrl = await uploadLogo(formData, user.companyId, null, "/employers");
  const employer = await prisma.employer.create({ data: { ...data, employeeCode, logoUrl, companyId: user.companyId } });
  await writeAudit({ userId: user.id, action: "EMPLOYER_CREATE", message: t(`أضاف الكفيل ${employer.name}`, `Added sponsor ${employer.name}`) });
  let accountNote = "";
  if (req(formData, "openAccount") === "1") {
    const { sent } = await openAndSend({
      companyId: user.companyId,
      role: "EMPLOYER",
      person: { name: employer.name, email: employer.email, phone: employer.phone },
      employerId: employer.id,
      actorId: user.id,
      companyName: user.company.name,
      origin: await requestOrigin(),
      label: "صاحب عمل",
    });
    accountNote = t(" وفُتح له حساب دخول", " with a sign-in account") + sendSummary(sent, t);
  }
  refreshAll();
  go(`/employers/${employer.id}`, { message: t("تمت إضافة الكفيل", "Sponsor added") + accountNote });
}

export async function updateEmployer(formData: FormData) {
  const user = await requirePermission("employers.edit", "/employers");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employer.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
  const data = readEmployer(formData);
  if (data.name.length < 2) go(`/employers/${id}`, { error: t("اسم الكفيل مطلوب", "Sponsor name is required") });
  const logoUrl = await uploadLogo(formData, user.companyId, existing!.logoUrl, `/employers/${id}`);
  await prisma.employer.update({ where: { id }, data: { ...data, logoUrl } });
  if (logoUrl !== existing!.logoUrl) await removeLogoIfUnused(existing!.logoUrl);
  await writeAudit({ userId: user.id, action: "EMPLOYER_UPDATE", message: t(`عدّل بيانات الكفيل ${data.name}`, `Updated sponsor ${data.name}`) });
  refreshAll();
  go(`/employers/${id}`, { message: t("تم حفظ البيانات", "Saved") });
}

export async function updateEmployerCode(formData: FormData) {
  const user = await requirePermission("employers.edit", "/employers");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employer.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
  const codeField = readEmployeeCode(formData);
  if (codeField.invalid) {
    go(`/employers/${id}#numbers`, { error: t("رمز الأرقام: حرفان إلى 8 من A–Z أو 0–9 فقط", "Number code: 2–8 characters, A–Z or 0–9 only") });
  }
  const employeeCode = codeField.code;
  await prisma.employer.update({ where: { id }, data: { employeeCode } });
  await writeAudit({
    userId: user.id,
    action: "EMPLOYER_NUMBER_CODE",
    message: t(
      `ضبط رمز أرقام «${existing!.name}» إلى ${employeeCode || "EMP"}`,
      `Set number code for “${existing!.name}” to ${employeeCode || "EMP"}`,
    ),
  });
  refreshAll();
  go(`/employers/${id}#numbers`, {
    message: t(
      `حُفظ الرمز. الموظفون الجدد سيأخذون أرقاماً بصيغة ${(employeeCode || "EMP")}-0001. الأرقام الحالية لا تتغير إلا بإعادة البناء.`,
      `Code saved. New employees will get ${(employeeCode || "EMP")}-0001 style numbers. Current numbers change only when you rebuild.`,
    ),
  });
}

export async function rebuildEmployerNumbers(formData: FormData) {
  const user = await requirePermission("employers.edit", "/employers");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const back = `/employers/${id}#numbers`;
  const existing = await prisma.employer.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
  const sortRaw = req(formData, "sort");
  if (!isEmployeeNumberSort(sortRaw)) go(back, { error: t("اختر طريقة ترتيب الأرقام", "Choose how to order the numbers") });
  if (existing!.numberRebuilds > 0) {
    const password = req(formData, "password");
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
    if (!account?.password || !verifyPassword(password, account.password)) {
      go(back, { error: t("كلمة المرور غير صحيحة", "Wrong password") });
    }
  }
  const result = await rebuildEmployerEmployeeNumbers({
    companyId: user.companyId,
    employerId: id,
    code: existing!.employeeCode,
    sort: sortRaw,
  });
  const sortLabel =
    sortRaw === "seniority"
      ? t("الأقدمية", "seniority")
      : sortRaw === "job"
        ? t("الوظيفة", "job title")
        : t("الاسم", "name");
  await writeAudit({
    userId: user.id,
    action: "EMPLOYER_NUMBERS_REBUILD",
    message: t(
      `أعاد ترقيم ${result.count} موظفاً لكفيل «${existing!.name}» حسب ${sortLabel} (${result.prefix}-…)`,
      `Renumbered ${result.count} employee(s) for “${existing!.name}” by ${sortLabel} (${result.prefix}-…)`,
    ),
  });
  refreshAll();
  go(back, {
    message: t(
      `تم ترقيم ${result.count} موظفاً (${result.prefix}-0001…). ${existing!.numberRebuilds > 0 ? "أي إعادة لاحقة تحتاج كلمة المرور." : "أي إعادة لاحقة تحتاج كلمة مرور حسابك."}`,
      `Numbered ${result.count} employee(s) (${result.prefix}-0001…). ${existing!.numberRebuilds > 0 ? "Further rebuilds still need your password." : "Further rebuilds will require your account password."}`,
    ),
  });
}

export async function deleteEmployer(formData: FormData) {
  const user = await requirePermission("employers.delete", "/employers");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employer.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { employees: true } } },
  });
  if (!existing) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
  if (existing!._count.employees > 0) {
    go(`/employers/${id}`, { error: t("انقل موظفي هذا الكفيل إلى كفيل آخر قبل الحذف", "Move this sponsor's employees to another sponsor first") });
  }
  await prisma.salary.updateMany({ where: { employerId: id }, data: { employerId: null } });
  await prisma.employer.delete({ where: { id } });
  await removeLogoIfUnused(existing!.logoUrl);
  await writeAudit({ userId: user.id, action: "EMPLOYER_DELETE", message: t(`حذف الكفيل ${existing!.name}`, `Deleted sponsor ${existing!.name}`) });
  refreshAll();
  go("/employers", { message: t("تم حذف الكفيل", "Sponsor deleted") });
}
