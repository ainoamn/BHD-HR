"use server";

import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { DOC_LABEL, EXTRA_DOC_TYPES } from "@/lib/constants";
import { go, refreshAll } from "@/lib/http";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { clip, parseDateInput, req, safeReturn, str } from "@/lib/utils";

export async function addDocument(formData: FormData) {
  const user = await requireWriter();
  const { lang, t } = await getI18n();
  const employeeId = req(formData, "employeeId");
  const returnTo = safeReturn(formData.get("returnTo"), `/employees/${employeeId}?tab=docs`);
  const type = req(formData, "type");
  if (!EXTRA_DOC_TYPES.includes(type)) go(returnTo, { error: t("نوع المستند غير صحيح", "Invalid document type") });
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  let fileUrl: string | null = null;
  try {
    const file = formData.get("file");
    fileUrl = await saveUpload(file instanceof File ? file : null, user.companyId, lang);
  } catch (error) {
    go(returnTo, { error: error instanceof Error ? error.message : t("تعذر رفع الملف", "Could not upload the file") });
  }
  await prisma.employeeDocument.create({
    data: {
      employeeId,
      type,
      documentNo: clip(str(formData, "documentNo"), 60),
      expiryDate: parseDateInput(str(formData, "expiryDate")),
      notes: clip(str(formData, "notes"), 300),
      fileUrl,
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId,
    action: "DOCUMENT",
    message: t(`أضاف مستند ${pick(DOC_LABEL[type], "ar", type)} للموظف ${employee!.fullName}`, `Added ${pick(DOC_LABEL[type], "en", type)} for ${employee!.fullName}`),
  });
  refreshAll();
  go(returnTo, { message: t("تم حفظ المستند", "Document saved") });
}

export async function deleteDocument(formData: FormData) {
  const user = await requireWriter();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const row = await prisma.employeeDocument.findFirst({
    where: { id, employee: { companyId: user.companyId } },
    include: { employee: true },
  });
  const returnTo = safeReturn(formData.get("returnTo"), row ? `/employees/${row.employeeId}?tab=docs` : "/documents");
  if (!row) go(returnTo, { error: t("المستند غير موجود", "Document not found") });
  await removeUpload(row!.fileUrl);
  await prisma.employeeDocument.delete({ where: { id: row!.id } });
  await writeAudit({
    userId: user.id,
    employeeId: row!.employeeId,
    action: "DOCUMENT_DELETE",
    message: t(
      `حذف مستند ${pick(DOC_LABEL[row!.type], "ar", row!.type)} للموظف ${row!.employee.fullName}`,
      `Deleted ${pick(DOC_LABEL[row!.type], "en", row!.type)} for ${row!.employee.fullName}`,
    ),
  });
  refreshAll();
  go(returnTo, { message: t("تم حذف المستند", "Document deleted") });
}
