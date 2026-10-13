"use server";

import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { HELD_DOC_TYPES, createCustodyForm, type NewHeldDocument } from "@/lib/custody";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { clip, parseDateInput, req, safeReturn, str, todayInputValue } from "@/lib/utils";

const MAX_NEW_ROWS = 10;

function isDocType(value: string) {
  return (HELD_DOC_TYPES as readonly string[]).includes(value);
}

async function custodyEmployee(companyId: string, formData: FormData, back: string) {
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({ where: { id: req(formData, "employeeId"), companyId }, select: { id: true, fullName: true } });
  if (!employee) go(back, { error: t("الموظف غير موجود", "Employee not found") });
  return employee!;
}

/**
 * Receipt form (IN): the company takes originals from the employee into safekeeping —
 * new ones typed in the rows, and/or ones the employee is bringing back (returnIds).
 */
export async function receiveOriginals(formData: FormData) {
  const user = await requirePermission("documents.create");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/documents/custody");
  const employee = await custodyEmployee(user.companyId, formData, back);
  const types = formData.getAll("type").map(String);
  const titles = formData.getAll("title").map(String);
  const numbers = formData.getAll("documentNo").map(String);
  const newDocuments: NewHeldDocument[] = [];
  for (let index = 0; index < Math.min(types.length, MAX_NEW_ROWS); index += 1) {
    const type = types[index];
    const title = clip(titles[index] || "", 120);
    const documentNo = clip(numbers[index] || "", 60);
    if (!type || !isDocType(type)) continue;
    if (type === "OTHER" && !title) go(back, { error: t("اكتب اسم المستند في السطر «مستند آخر»", "Write the document name on the “Other document” row") });
    newDocuments.push({ type, title, documentNo });
  }
  const returnIds = [...new Set(formData.getAll("returnIds").map(String))].slice(0, 50);
  if (!newDocuments.length && !returnIds.length) go(back, { error: t("أضف مستنداً واحداً على الأقل", "Add at least one document") });

  const form = await createCustodyForm({
    companyId: user.companyId,
    employee,
    direction: "IN",
    documentIds: returnIds,
    newDocuments,
    purpose: clip(str(formData, "purpose"), 300),
    staffName: user.name,
    user: { id: user.id, name: user.name },
  });
  if (!form) go(back, { error: t("المستندات المختارة سبق استلامها", "The chosen documents were already received") });
  refreshAll();
  go(`/documents/custody/${form!.id}`, { message: t(`صدرت استمارة الاستلام ${form!.refNo}`, `Receipt form ${form!.refNo} issued`) });
}

/** Handover form (OUT): the company gives originals back to the employee, until dueBack or for good. */
export async function handOverOriginals(formData: FormData) {
  const user = await requirePermission("documents.edit");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/documents/custody");
  const employee = await custodyEmployee(user.companyId, formData, back);
  const documentIds = [...new Set(formData.getAll("documentIds").map(String))].slice(0, 50);
  if (!documentIds.length) go(back, { error: t("اختر المستندات المراد تسليمها", "Choose the documents to hand over") });
  const dueBack = parseDateInput(str(formData, "dueBack"));
  if (dueBack && dueBack < parseDateInput(todayInputValue())!) go(back, { error: t("تاريخ الإعادة لا يكون في الماضي", "The return date can't be in the past") });

  const form = await createCustodyForm({
    companyId: user.companyId,
    employee,
    direction: "OUT",
    documentIds,
    purpose: clip(str(formData, "purpose"), 300),
    dueBack,
    staffName: user.name,
    user: { id: user.id, name: user.name },
  });
  if (!form) go(back, { error: t("المستندات المختارة ليست محفوظة لدى المنشأة الآن", "The chosen documents aren't held by the company now") });
  refreshAll();
  go(`/documents/custody/${form!.id}`, { message: t(`صدرت استمارة التسليم ${form!.refNo}`, `Handover form ${form!.refNo} issued`) });
}

export async function updateHeldDocument(formData: FormData) {
  const user = await requirePermission("documents.edit");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/documents/custody");
  const type = req(formData, "type");
  if (!isDocType(type)) go(back, { error: t("اختر نوع المستند", "Choose the document type") });
  const title = clip(str(formData, "title"), 120);
  if (type === "OTHER" && !title) go(back, { error: t("اكتب اسم المستند", "Write the document name") });
  const updated = await prisma.heldDocument.updateMany({
    where: { id: req(formData, "id"), companyId: user.companyId },
    data: { type, title, documentNo: clip(str(formData, "documentNo"), 60), notes: clip(str(formData, "notes"), 500) },
  });
  if (!updated.count) go(back, { error: t("المستند غير موجود", "Document not found") });
  refreshAll();
  go(back, { message: t("حُفظ المستند", "Document saved") });
}

/** Only a mistaken entry whose sole movement is its own receipt can be removed; handovers stay the permanent record. */
export async function deleteHeldDocument(formData: FormData) {
  const user = await requirePermission("documents.delete");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/documents/custody");
  const doc = await prisma.heldDocument.findFirst({
    where: { id: req(formData, "id"), companyId: user.companyId },
    include: { employee: { select: { fullName: true } }, _count: { select: { items: true } } },
  });
  if (!doc) go(back, { error: t("المستند غير موجود", "Document not found") });
  if (doc!._count.items > 1) go(back, { error: t("لا يُحذف مستند له حركات تسليم واستلام؛ تبقى استماراته سجلاً دائماً", "A document with handovers can't be deleted; its forms stay on record") });
  await prisma.$transaction([prisma.custodyItem.deleteMany({ where: { documentId: doc!.id } }), prisma.heldDocument.delete({ where: { id: doc!.id } })]);
  await prisma.custodyForm.deleteMany({ where: { companyId: user.companyId, employeeId: doc!.employeeId, items: { none: {} } } });
  await writeAudit({ userId: user.id, employeeId: doc!.employeeId, action: "CUSTODY_DELETE", message: `حذف مستنداً أصلياً سُجّل خطأً لـ ${doc!.employee.fullName}` });
  refreshAll();
  go(back, { message: t("حُذف المستند", "Document deleted") });
}

/** Portal: the employee confirms the form electronically (receiving originals, or having handed them in). */
export async function acknowledgeCustodyForm(formData: FormData) {
  const token = req(formData, "token");
  const employee = await portalEmployee(token);
  const { t } = await getI18n();
  if (!employee) go("/portal/invalid", { error: t("الرابط غير صالح أو أُوقف", "This link is invalid or was turned off") });
  const id = req(formData, "id");
  const back = `/portal/${token}/custody/${id}`;
  const updated = await prisma.custodyForm.updateMany({ where: { id, employeeId: employee!.id, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
  if (!updated.count) go(back, { error: t("سبق الإقرار بهذه الاستمارة", "This form was already acknowledged") });
  const form = await prisma.custodyForm.findUnique({ where: { id }, select: { refNo: true } });
  await writeAudit({
    companyId: employee!.companyId,
    employeeId: employee!.id,
    action: "CUSTODY_ACK",
    message: `أقرّ ${employee!.fullName} إلكترونياً باستمارة المستندات ${form?.refNo || ""}`,
  });
  refreshAll();
  go(back, { message: t("سُجّل إقرارك إلكترونياً", "Your acknowledgement was recorded") });
}
