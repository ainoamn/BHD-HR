"use server";

import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { NOTE_KINDS } from "@/lib/tasks";
import { clip, req, safeReturn } from "@/lib/utils";

const kindOf = (formData: FormData) => (NOTE_KINDS[req(formData, "kind")] ? req(formData, "kind") : "GENERAL");

export async function addNote(formData: FormData) {
  const user = await requirePermission("tasks.create", "/employees");
  const { t } = await getI18n();
  const employeeId = req(formData, "employeeId");
  const returnTo = safeReturn(formData.get("returnTo"), `/employees/${employeeId}?tab=notes`);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId }, select: { id: true, fullName: true } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  const body = clip(req(formData, "body"), 5000);
  if (!body) go(returnTo, { error: t("اكتب الملاحظة", "Type the note") });
  await prisma.employeeNote.create({
    data: {
      companyId: user.companyId,
      employeeId: employee!.id,
      kind: kindOf(formData),
      body: body!,
      pinned: formData.get("pinned") === "1",
      authorId: user.id,
      authorName: user.name,
    },
  });
  await writeAudit({ userId: user.id, employeeId: employee!.id, action: "NOTE_ADD", message: t(`أضاف ملاحظة في ملف ${employee!.fullName}`, `Added a note to ${employee!.fullName}'s file`) });
  refreshAll();
  go(returnTo, { message: t("تم حفظ الملاحظة", "Note saved") });
}

async function findNote(companyId: string, id: string) {
  return prisma.employeeNote.findFirst({ where: { id, companyId } });
}

export async function updateNote(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/employees");
  const { t } = await getI18n();
  const note = await findNote(user.companyId, req(formData, "id"));
  if (!note) go("/employees", { error: t("الملاحظة غير موجودة", "Note not found") });
  const returnTo = safeReturn(formData.get("returnTo"), `/employees/${note!.employeeId}?tab=notes`);
  const body = clip(req(formData, "body"), 5000);
  if (!body) go(returnTo, { error: t("اكتب الملاحظة", "Type the note") });
  await prisma.employeeNote.update({ where: { id: note!.id }, data: { body: body!, kind: kindOf(formData) } });
  refreshAll();
  go(returnTo, { message: t("تم تعديل الملاحظة", "Note updated") });
}

export async function toggleNotePin(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/employees");
  const { t } = await getI18n();
  const note = await findNote(user.companyId, req(formData, "id"));
  if (!note) go("/employees", { error: t("الملاحظة غير موجودة", "Note not found") });
  await prisma.employeeNote.update({ where: { id: note!.id }, data: { pinned: !note!.pinned } });
  refreshAll();
  go(safeReturn(formData.get("returnTo"), `/employees/${note!.employeeId}?tab=notes`));
}

export async function deleteNote(formData: FormData) {
  const user = await requirePermission("tasks.delete", "/employees");
  const { t } = await getI18n();
  const note = await findNote(user.companyId, req(formData, "id"));
  if (!note) go("/employees", { error: t("الملاحظة غير موجودة", "Note not found") });
  await prisma.employeeNote.delete({ where: { id: note!.id } });
  await writeAudit({ userId: user.id, employeeId: note!.employeeId, action: "NOTE_DELETE", message: t("حذف ملاحظة من ملف موظف", "Deleted a note from an employee's file") });
  refreshAll();
  go(safeReturn(formData.get("returnTo"), `/employees/${note!.employeeId}?tab=notes`), { message: t("تم حذف الملاحظة", "Note deleted") });
}
