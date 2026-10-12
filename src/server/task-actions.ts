"use server";

import { aiTaskChecklist } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { isTaskPriority, isTaskStatus, TASK_STATUS, type TaskStatus } from "@/lib/tasks";
import { clip, parseDateInput, req, safeReturn, str } from "@/lib/utils";

async function companyEmployeeIds(companyId: string, formData: FormData) {
  const wanted = [...new Set(formData.getAll("assigneeIds").map(String).filter(Boolean))].slice(0, 50);
  if (!wanted.length) return [];
  const rows = await prisma.employee.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true } });
  return rows.map((row) => row.id);
}

function readTask(formData: FormData) {
  const status = req(formData, "status");
  const priority = req(formData, "priority");
  return {
    title: clip(req(formData, "title"), 200) || "",
    description: clip(str(formData, "description"), 5000),
    status: isTaskStatus(status) ? status : "TODO",
    priority: isTaskPriority(priority) ? priority : "NORMAL",
    startDate: parseDateInput(str(formData, "startDate")),
    dueDate: parseDateInput(str(formData, "dueDate")),
  };
}

export async function createTask(formData: FormData) {
  const user = await requirePermission("tasks.create", "/tasks");
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/tasks");
  const data = readTask(formData);
  if (data.title.length < 2) go(returnTo, { error: t("اكتب عنوان المهمة", "Enter a task title") });
  if (data.startDate && data.dueDate && data.startDate > data.dueDate) go(returnTo, { error: t("تاريخ البداية بعد تاريخ الاستحقاق", "The start date is after the due date") });
  const assigneeIds = await companyEmployeeIds(user.companyId, formData);
  const items = String(formData.get("checklist") || "")
    .split("\n")
    .map((line) => line.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 30);
  const first = await prisma.task.findFirst({ where: { companyId: user.companyId, status: data.status }, orderBy: { position: "asc" }, select: { position: true } });
  const task = await prisma.task.create({
    data: {
      ...data,
      companyId: user.companyId,
      completedAt: data.status === "DONE" ? new Date() : null,
      position: (first?.position ?? 1) - 1,
      createdById: user.id,
      createdByName: user.name,
      assignees: { create: assigneeIds.map((employeeId) => ({ employeeId })) },
      items: { create: items.map((text, position) => ({ text, position })) },
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId: assigneeIds.length === 1 ? assigneeIds[0] : null,
    action: "TASK_CREATE",
    message: t(`أضاف المهمة «${task.title}»${assigneeIds.length ? ` لـ ${assigneeIds.length} موظف` : ""}`, `Added task “${task.title}”${assigneeIds.length ? ` for ${assigneeIds.length} employee(s)` : ""}`),
  });
  refreshAll();
  go(formData.get("open") === "1" ? `/tasks/${task.id}` : returnTo, { message: t("تمت إضافة المهمة", "Task added") });
}

async function findTask(companyId: string, id: string, returnTo: string, t: (ar: string, en: string) => string) {
  const task = await prisma.task.findFirst({ where: { id, companyId } });
  if (!task) go(returnTo, { error: t("المهمة غير موجودة", "Task not found") });
  return task!;
}

export async function updateTask(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const returnTo = safeReturn(formData.get("returnTo"), `/tasks/${id}`);
  const task = await findTask(user.companyId, id, returnTo, t);
  const data = readTask(formData);
  if (data.title.length < 2) go(returnTo, { error: t("اكتب عنوان المهمة", "Enter a task title") });
  if (data.startDate && data.dueDate && data.startDate > data.dueDate) go(returnTo, { error: t("تاريخ البداية بعد تاريخ الاستحقاق", "The start date is after the due date") });
  const assigneeIds = await companyEmployeeIds(user.companyId, formData);
  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
    prisma.task.update({
      where: { id: task.id },
      data: {
        ...data,
        completedAt: data.status === "DONE" ? (task.completedAt ?? new Date()) : null,
        assignees: { create: assigneeIds.map((employeeId) => ({ employeeId })) },
      },
    }),
  ]);
  refreshAll();
  go(returnTo, { message: t("تم حفظ المهمة", "Task saved") });
}

export async function setTaskStatus(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const returnTo = safeReturn(formData.get("returnTo"), `/tasks/${id}`);
  const status = req(formData, "status");
  if (!isTaskStatus(status)) go(returnTo, { error: t("حالة غير معروفة", "Unknown status") });
  const task = await findTask(user.companyId, id, returnTo, t);
  await prisma.task.update({ where: { id: task.id }, data: { status, completedAt: status === "DONE" ? (task.completedAt ?? new Date()) : null } });
  if (status === "DONE" && task.status !== "DONE") {
    await writeAudit({ userId: user.id, action: "TASK_DONE", message: t(`أنجز المهمة «${task.title}»`, `Completed task “${task.title}”`) });
  }
  refreshAll();
  go(returnTo, { message: t(`الحالة: ${TASK_STATUS[status as TaskStatus].label.ar}`, `Status: ${TASK_STATUS[status as TaskStatus].label.en}`) });
}

/** Drag and drop on the board: puts the task in `status` and stores the column order the client sends. */
export async function moveTask(taskId: string, status: string, orderedIds: string[]): Promise<{ error?: string }> {
  const user = await getSessionUser();
  const { t } = await getI18n();
  if (!user || !can(user, "tasks.edit")) return { error: t("ليست لديك صلاحية تعديل المهام", "You cannot edit tasks") };
  if (!isTaskStatus(status)) return { error: t("حالة غير معروفة", "Unknown status") };
  const ids = [...new Set(orderedIds.map(String))].slice(0, 500);
  if (!ids.includes(taskId)) ids.push(taskId);
  const owned = await prisma.task.findMany({ where: { companyId: user.companyId, id: { in: ids } }, select: { id: true, status: true, completedAt: true, title: true } });
  const moving = owned.find((task) => task.id === taskId);
  if (!moving) return { error: t("المهمة غير موجودة", "Task not found") };
  const ownedIds = new Set(owned.map((task) => task.id));
  await prisma.$transaction(
    ids
      .filter((id) => ownedIds.has(id))
      .map((id, position) =>
        prisma.task.update({
          where: { id },
          data:
            id === taskId
              ? { status, position, completedAt: status === "DONE" ? (moving.completedAt ?? new Date()) : null }
              : { position },
        }),
      ),
  );
  if (status === "DONE" && moving.status !== "DONE") {
    await writeAudit({ userId: user.id, companyId: user.companyId, action: "TASK_DONE", message: t(`أنجز المهمة «${moving.title}»`, `Completed task “${moving.title}”`) });
  }
  refreshAll();
  return {};
}

export async function deleteTask(formData: FormData) {
  const user = await requirePermission("tasks.delete", "/tasks");
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/tasks");
  const task = await findTask(user.companyId, req(formData, "id"), returnTo, t);
  await prisma.task.delete({ where: { id: task.id } });
  await writeAudit({ userId: user.id, action: "TASK_DELETE", message: t(`حذف المهمة «${task.title}»`, `Deleted task “${task.title}”`) });
  refreshAll();
  go(returnTo, { message: t("تم حذف المهمة", "Task deleted") });
}

export async function addTaskItem(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const id = req(formData, "taskId");
  const returnTo = `/tasks/${id}`;
  const task = await findTask(user.companyId, id, "/tasks", t);
  const text = clip(req(formData, "text"), 200);
  if (!text) go(returnTo, { error: t("اكتب نص الخطوة", "Type the step") });
  const count = await prisma.taskItem.count({ where: { taskId: task.id } });
  await prisma.taskItem.create({ data: { taskId: task.id, text: text!, position: count } });
  refreshAll();
  go(`${returnTo}#checklist`);
}

export async function toggleTaskItem(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), task: { companyId: user.companyId } } });
  if (!item) go("/tasks", { error: t("الخطوة غير موجودة", "Step not found") });
  await prisma.taskItem.update({ where: { id: item!.id }, data: { done: !item!.done } });
  refreshAll();
  go(`/tasks/${item!.taskId}#checklist`);
}

export async function deleteTaskItem(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), task: { companyId: user.companyId } } });
  if (!item) go("/tasks", { error: t("الخطوة غير موجودة", "Step not found") });
  await prisma.taskItem.delete({ where: { id: item!.id } });
  refreshAll();
  go(`/tasks/${item!.taskId}#checklist`);
}

/** AI: proposes checklist steps from the title and description and appends them. */
export async function suggestTaskItems(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const task = await findTask(user.companyId, req(formData, "taskId"), "/tasks", t);
  const back = `/tasks/${task.id}#checklist`;
  let steps: string[] = [];
  try {
    steps = await aiTaskChecklist(task.title, task.description);
  } catch (error) {
    console.error("AI checklist failed", error);
    go(back, { error: t("تعذر اقتراح الخطوات الآن. حاول لاحقاً.", "Could not suggest steps right now. Try again later.") });
  }
  if (!steps.length) go(back, { error: t("لم يقترح الذكاء الاصطناعي خطوات لهذه المهمة", "The AI suggested no steps for this task") });
  const count = await prisma.taskItem.count({ where: { taskId: task.id } });
  await prisma.taskItem.createMany({ data: steps.map((text, index) => ({ taskId: task.id, text, position: count + index })) });
  refreshAll();
  go(back, { message: t(`أُضيفت ${steps.length} خطوات مقترحة`, `Added ${steps.length} suggested steps`) });
}

export async function addTaskComment(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const task = await findTask(user.companyId, req(formData, "taskId"), "/tasks", t);
  const body = clip(req(formData, "body"), 3000);
  if (!body) go(`/tasks/${task.id}#comments`, { error: t("اكتب التعليق", "Type a comment") });
  await prisma.taskComment.create({ data: { taskId: task.id, userId: user.id, authorName: user.name, body: body! } });
  refreshAll();
  go(`/tasks/${task.id}#comments`);
}

export async function deleteTaskComment(formData: FormData) {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  const comment = await prisma.taskComment.findFirst({ where: { id: req(formData, "id"), task: { companyId: user.companyId } } });
  if (!comment) go("/tasks", { error: t("التعليق غير موجود", "Comment not found") });
  if (comment!.userId !== user.id && !can(user, "tasks.delete")) go(`/tasks/${comment!.taskId}#comments`, { error: t("لا يمكنك حذف تعليق غيرك", "You can only delete your own comments") });
  await prisma.taskComment.delete({ where: { id: comment!.id } });
  refreshAll();
  go(`/tasks/${comment!.taskId}#comments`);
}
