"use server";

import { writeAudit } from "@/lib/audit";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { clip, req, str } from "@/lib/utils";

/** Add or update a company internal policy shown on /regulations. */
export async function saveCompanyPolicy(formData: FormData) {
  const user = await requireAdmin("/regulations");
  const { t } = await getI18n();
  const id = str(formData, "id");
  const titleAr = req(formData, "titleAr").slice(0, 200);
  const titleEn = clip(str(formData, "titleEn"), 200);
  const bodyAr = req(formData, "bodyAr").slice(0, 50000);
  const bodyEn = clip(str(formData, "bodyEn"), 50000);
  const sourceNote = clip(str(formData, "sourceNote"), 200);
  if (titleAr.length < 2 || bodyAr.length < 5) go("/regulations?tab=company", { error: t("أدخل عنواناً ونصاً للنظام الداخلي", "Enter a title and body for the internal policy") });

  if (id) {
    const existing = await prisma.companyPolicy.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) go("/regulations?tab=company", { error: t("المستند غير موجود", "Document not found") });
    await prisma.companyPolicy.update({
      where: { id },
      data: { titleAr, titleEn, bodyAr, bodyEn, sourceNote },
    });
  } else {
    const count = await prisma.companyPolicy.count({ where: { companyId: user.companyId } });
    await prisma.companyPolicy.create({
      data: {
        companyId: user.companyId,
        titleAr,
        titleEn,
        bodyAr,
        bodyEn,
        sourceNote,
        sortOrder: count,
        createdById: user.id,
      },
    });
  }
  await writeAudit({ userId: user.id, action: "POLICY_SAVE", message: `حفظ نظام داخلي «${titleAr}» / Saved internal policy “${titleAr}”` });
  refreshAll();
  go("/regulations?tab=company", { message: t("حُفظ النظام الداخلي", "Internal policy saved") });
}

export async function deleteCompanyPolicy(formData: FormData) {
  const user = await requireAdmin("/regulations");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.companyPolicy.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/regulations?tab=company", { error: t("المستند غير موجود", "Document not found") });
  await prisma.companyPolicy.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: "POLICY_DELETE", message: `حذف نظام داخلي «${existing.titleAr}» / Deleted internal policy “${existing.titleAr}”` });
  refreshAll();
  go("/regulations?tab=company", { message: t("حُذف النظام الداخلي", "Internal policy deleted") });
}

/** Extra warning cause beyond Oman MD 618/2024. */
export async function saveCompanyPenaltyCause(formData: FormData) {
  const user = await requirePermission("letters.create", "/regulations");
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    const { redirect } = await import("next/navigation");
    redirect("/regulations");
  }
  const { t } = await getI18n();
  const id = str(formData, "id");
  const codeRaw = req(formData, "code").slice(0, 40).replace(/\s+/g, "-").toUpperCase();
  const code = codeRaw.startsWith("CO-") ? codeRaw : `CO-${codeRaw}`;
  const titleAr = req(formData, "titleAr").slice(0, 400);
  const titleEn = clip(str(formData, "titleEn"), 400);
  const detailAr = clip(str(formData, "detailAr"), 800);
  const detailEn = clip(str(formData, "detailEn"), 800);
  const defaultKind = (str(formData, "defaultKind") || "WARNING_1").slice(0, 40);
  if (titleAr.length < 2) go("/regulations?tab=causes", { error: t("أدخل نص المخالفة", "Enter the violation text") });

  try {
    if (id) {
      const existing = await prisma.companyPenaltyCause.findFirst({ where: { id, companyId: user.companyId } });
      if (!existing) go("/regulations?tab=causes", { error: t("البند غير موجود", "Cause not found") });
      await prisma.companyPenaltyCause.update({
        where: { id },
        data: { code, titleAr, titleEn, detailAr, detailEn, defaultKind },
      });
    } else {
      const count = await prisma.companyPenaltyCause.count({ where: { companyId: user.companyId } });
      await prisma.companyPenaltyCause.create({
        data: {
          companyId: user.companyId,
          code,
          titleAr,
          titleEn,
          detailAr,
          detailEn,
          defaultKind,
          sortOrder: count,
        },
      });
    }
  } catch {
    go("/regulations?tab=causes", { error: t("رمز البند مستخدم مسبقاً", "That cause code is already used") });
  }
  await writeAudit({ userId: user.id, action: "PENALTY_CAUSE_SAVE", message: `حفظ مسبب إنذار «${titleAr}» / Saved warning cause “${titleAr}”` });
  refreshAll();
  go("/regulations?tab=causes", { message: t("حُفظ مسبب الإنذار", "Warning cause saved") });
}

export async function deleteCompanyPenaltyCause(formData: FormData) {
  const user = await requireAdmin("/regulations");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.companyPenaltyCause.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/regulations?tab=causes", { error: t("البند غير موجود", "Cause not found") });
  await prisma.companyPenaltyCause.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: "PENALTY_CAUSE_DELETE", message: `حذف مسبب إنذار «${existing.titleAr}» / Deleted warning cause “${existing.titleAr}”` });
  refreshAll();
  go("/regulations?tab=causes", { message: t("حُذف مسبب الإنذار", "Warning cause deleted") });
}
