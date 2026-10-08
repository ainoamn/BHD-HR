"use server";

import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { EMPLOYER_KIND } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { removeLogoIfUnused, saveUpload } from "@/lib/uploads";
import { clip, req, str } from "@/lib/utils";

function readEmployer(formData: FormData) {
  const kind = req(formData, "kind");
  return {
    name: clip(req(formData, "name"), 150) || "",
    nameEn: clip(str(formData, "nameEn"), 150),
    kind: EMPLOYER_KIND[kind] ? kind : "COMPANY",
    idNumber: clip(str(formData, "idNumber"), 40),
    phone: clip(str(formData, "phone"), 30),
    email: clip(str(formData, "email"), 80),
    address: clip(str(formData, "address"), 250),
    notes: clip(str(formData, "notes"), 500),
  };
}

async function uploadLogo(formData: FormData, current: string | null, errorPath: string) {
  const { lang, t } = await getI18n();
  try {
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file, lang);
      if (saved) return saved;
    }
    if (req(formData, "removeLogo") === "1") return null;
  } catch (error) {
    go(errorPath, { error: error instanceof Error ? error.message : t("تعذر رفع الشعار", "Could not upload logo") });
  }
  return current;
}

export async function createEmployer(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const data = readEmployer(formData);
  if (data.name.length < 2) go("/employers", { error: t("اسم الكفيل مطلوب", "Sponsor name is required") });
  const logoUrl = await uploadLogo(formData, null, "/employers");
  const employer = await prisma.employer.create({ data: { ...data, logoUrl, companyId: user.companyId } });
  await writeAudit({ userId: user.id, action: "EMPLOYER_CREATE", message: t(`أضاف الكفيل ${employer.name}`, `Added sponsor ${employer.name}`) });
  refreshAll();
  go(`/employers/${employer.id}`, { message: t("تمت إضافة الكفيل", "Sponsor added") });
}

export async function updateEmployer(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employer.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employers", { error: t("الكفيل غير موجود", "Sponsor not found") });
  const data = readEmployer(formData);
  if (data.name.length < 2) go(`/employers/${id}`, { error: t("اسم الكفيل مطلوب", "Sponsor name is required") });
  const logoUrl = await uploadLogo(formData, existing!.logoUrl, `/employers/${id}`);
  await prisma.employer.update({ where: { id }, data: { ...data, logoUrl } });
  if (logoUrl !== existing!.logoUrl) await removeLogoIfUnused(existing!.logoUrl);
  await writeAudit({ userId: user.id, action: "EMPLOYER_UPDATE", message: t(`عدّل بيانات الكفيل ${data.name}`, `Updated sponsor ${data.name}`) });
  refreshAll();
  go(`/employers/${id}`, { message: t("تم حفظ البيانات", "Saved") });
}

export async function deleteEmployer(formData: FormData) {
  const user = await requireWriter();
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
