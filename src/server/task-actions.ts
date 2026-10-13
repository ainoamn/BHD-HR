"use server";

import type { ActionResult } from "@/lib/action-result";
import { aiTaskChecklist } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import type { Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { isEmail, newTaskInviteToken, sendTaskInvite } from "@/lib/task-invites";
import { TASK_PRIORITY, TASK_STATUS, isClosedStatus, isTaskPriority, isTaskStatus, type TaskEvent, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { clip, formatDate, parseDateInput, req, safeReturn, str } from "@/lib/utils";

type T = (ar: string, en: string) => string;
type Actor = { id: string; name: string };

const MAX_INVITES = 30;

/**
 * Actions used on the task page return their outcome instead of redirecting, so the page refreshes in place
 * (no navigation, no flash, scroll kept). `fail` ends one early with an error.
 */
class Stop {
  constructor(readonly result: ActionResult) {}
}

function fail(error?: string): never {
  throw new Stop(error ? { error } : {});
}

async function inPage(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    refreshAll();
    return error.result;
  }
}

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

const statusName = (status: string, t: T) => (isTaskStatus(status) ? t(TASK_STATUS[status].label.ar, TASK_STATUS[status].label.en) : status);
const priorityName = (priority: string, t: T) => (isTaskPriority(priority) ? t(TASK_PRIORITY[priority].label.ar, TASK_PRIORITY[priority].label.en) : priority);
const personName = (employee: { fullName: string; nameEn: string | null }, lang: Lang) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

/** Fields that change with the status: when it closed, what an ON_HOLD task resumes to, and the hold / close note. */
function statusChange(task: { status: string; completedAt: Date | null; resumeStatus: string | null }, next: TaskStatus, note?: string | null) {
  return {
    status: next,
    completedAt: isClosedStatus(next) ? (isClosedStatus(task.status) && task.completedAt ? task.completedAt : new Date()) : null,
    resumeStatus: next === "ON_HOLD" ? (task.status === "ON_HOLD" ? task.resumeStatus : task.status) : null,
    statusNote: next === "ON_HOLD" || isClosedStatus(next) ? note || null : null,
  };
}

async function logEvent(taskId: string, actor: Actor, kind: TaskEvent, body: string) {
  await prisma.taskComment.create({ data: { taskId, userId: actor.id, authorName: actor.name, kind, body: body.slice(0, 3000) } });
}

async function statusEvent(task: { id: string; title: string; status: string }, next: TaskStatus, actor: Actor & { companyId: string }, t: T, note?: string | null) {
  if (task.status === next) return;
  await logEvent(task.id, actor, "STATUS", t(`غيّر الحالة من «${statusName(task.status, t)}» إلى «${statusName(next, t)}»`, `Changed status from “${statusName(task.status, t)}” to “${statusName(next, t)}”`) + (note ? `\n${note}` : ""));
  if (next === "DONE" || next === "CANCELLED") {
    await writeAudit({
      userId: actor.id,
      companyId: actor.companyId,
      action: next === "DONE" ? "TASK_DONE" : "TASK_CLOSE",
      message: next === "DONE" ? t(`أنجز المهمة «${task.title}»`, `Completed task “${task.title}”`) : t(`أغلق المهمة «${task.title}» دون إنجاز`, `Closed task “${task.title}” without completion`),
    });
  }
}

const today = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

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
      completedAt: isClosedStatus(data.status) ? new Date() : null,
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

async function findTask(companyId: string, id: string, t: T) {
  const task = await prisma.task.findFirst({ where: { id, companyId } });
  if (!task) fail(t("المهمة غير موجودة", "Task not found"));
  return task;
}

/** Like findTask, but refuses archived tasks: restore them before changing anything. */
async function liveTask(companyId: string, id: string, t: T) {
  const task = await findTask(companyId, id, t);
  if (task.archivedAt) fail(t("المهمة مؤرشفة. استعدها أولاً.", "The task is archived. Restore it first."));
  return task;
}

export async function updateTask(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { lang, t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const data = readTask(formData);
    if (data.title.length < 2) fail(t("اكتب عنوان المهمة", "Enter a task title"));
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) fail(t("تاريخ البداية بعد تاريخ الاستحقاق", "The start date is after the due date"));
    const assigneeIds = await companyEmployeeIds(user.companyId, formData);
    const before = await prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { employeeId: true } });
    const { status, ...rest } = data;
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
      prisma.task.update({
        where: { id: task.id },
        data: {
          ...rest,
          ...(status === task.status ? {} : statusChange(task, status)),
          assignees: { create: assigneeIds.map((employeeId) => ({ employeeId })) },
        },
      }),
    ]);
    await statusEvent(task, status, user, t);
    if (data.priority !== task.priority) await logEvent(task.id, user, "PRIORITY", t(`غيّر الأولوية من «${priorityName(task.priority, t)}» إلى «${priorityName(data.priority, t)}»`, `Changed priority from “${priorityName(task.priority, t)}” to “${priorityName(data.priority, t)}”`));
    const beforeIds = new Set(before.map((row) => row.employeeId));
    const added = assigneeIds.filter((employeeId) => !beforeIds.has(employeeId));
    const removed = [...beforeIds].filter((employeeId) => !assigneeIds.includes(employeeId));
    if (added.length || removed.length) {
      const people = await prisma.employee.findMany({ where: { id: { in: [...added, ...removed] } }, select: { id: true, fullName: true, nameEn: true } });
      const names = (ids: string[]) => ids.map((employeeId) => people.find((person) => person.id === employeeId)).filter(Boolean).map((person) => personName(person!, lang)).join("، ");
      const lines = [added.length ? t(`أضاف: ${names(added)}`, `Added: ${names(added)}`) : null, removed.length ? t(`أزال: ${names(removed)}`, `Removed: ${names(removed)}`) : null].filter(Boolean);
      await logEvent(task.id, user, "ASSIGN", lines.join("\n"));
    }
    refreshAll();
    return { message: t("تم حفظ المهمة", "Task saved") };
  });
}

/**
 * Status buttons and the hold / close / reopen forms. `status` may also be RESUME (back to where an ON_HOLD
 * task was paused). `note` is the hold or close reason.
 */
export async function setTaskStatus(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const wanted = req(formData, "status");
    const resumed = task.resumeStatus && isTaskStatus(task.resumeStatus) && task.resumeStatus !== "ON_HOLD" ? task.resumeStatus : "TODO";
    const status = wanted === "RESUME" ? resumed : wanted;
    if (!isTaskStatus(status)) fail(t("حالة غير معروفة", "Unknown status"));
    const note = clip(str(formData, "note"), 500);
    if (status === "CANCELLED" && !note) fail(t("اكتب سبب الإغلاق دون إنجاز", "Write why the task is closed without completion"));
    if (status === task.status && !note) {
      refreshAll();
      return {};
    }
    await prisma.task.update({ where: { id: task.id }, data: statusChange(task, status, note) });
    await statusEvent(task, status, user, t, note);
    refreshAll();
    return { message: t(`الحالة: ${TASK_STATUS[status].label.ar}`, `Status: ${TASK_STATUS[status].label.en}`) };
  });
}

export async function setTaskPriority(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const priority = req(formData, "priority");
    if (!isTaskPriority(priority)) fail(t("أولوية غير معروفة", "Unknown priority"));
    if (priority === task.priority) {
      refreshAll();
      return {};
    }
    await prisma.task.update({ where: { id: task.id }, data: { priority } });
    await logEvent(task.id, user, "PRIORITY", t(`غيّر الأولوية من «${priorityName(task.priority, t)}» إلى «${priorityName(priority, t)}»`, `Changed priority from “${priorityName(task.priority, t)}” to “${priorityName(priority, t)}”`));
    refreshAll();
    return { message: t(`الأولوية: ${TASK_PRIORITY[priority].label.ar}`, `Priority: ${TASK_PRIORITY[priority].label.en}`) };
  });
}

/** Drag and drop on the board: puts the task in `status` and stores the column order the client sends. */
export async function moveTask(taskId: string, status: string, orderedIds: string[]): Promise<{ error?: string }> {
  const user = await getSessionUser();
  const { t } = await getI18n();
  if (!user || !can(user, "tasks.edit")) return { error: t("ليست لديك صلاحية تعديل المهام", "You cannot edit tasks") };
  if (!isTaskStatus(status)) return { error: t("حالة غير معروفة", "Unknown status") };
  const ids = [...new Set(orderedIds.map(String))].slice(0, 500);
  if (!ids.includes(taskId)) ids.push(taskId);
  const owned = await prisma.task.findMany({
    where: { companyId: user.companyId, archivedAt: null, id: { in: ids } },
    select: { id: true, status: true, completedAt: true, resumeStatus: true, title: true },
  });
  const moving = owned.find((task) => task.id === taskId);
  if (!moving) return { error: t("المهمة غير موجودة", "Task not found") };
  const ownedIds = new Set(owned.map((task) => task.id));
  await prisma.$transaction(
    ids
      .filter((id) => ownedIds.has(id))
      .map((id, position) =>
        prisma.task.update({
          where: { id },
          data: id === taskId ? { position, ...(moving.status === status ? {} : statusChange(moving, status)) } : { position },
        }),
      ),
  );
  await statusEvent(moving, status, user, t);
  refreshAll();
  return {};
}

export async function deleteTask(formData: FormData) {
  const user = await requirePermission("tasks.delete", "/tasks");
  const { t } = await getI18n();
  const returnTo = safeReturn(formData.get("returnTo"), "/tasks");
  const task = await prisma.task.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!task) go(returnTo, { error: t("المهمة غير موجودة", "Task not found") });
  await prisma.task.delete({ where: { id: task.id } });
  await writeAudit({ userId: user.id, action: "TASK_DELETE", message: t(`حذف المهمة «${task.title}»`, `Deleted task “${task.title}”`) });
  refreshAll();
  go(returnTo, { message: t("تم حذف المهمة", "Task deleted") });
}

/** Creates (or re-opens) the email invite for one address and emails it when the mail service is on. */
async function inviteAddress(
  task: { id: string },
  actor: Actor,
  input: { email: string; name: string | null; employeeId: string | null; note: string | null },
  origin: string,
) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.taskInvite.findUnique({ where: { taskId_email: { taskId: task.id, email } } });
  const invite = existing
    ? await prisma.taskInvite.update({
        where: { id: existing.id },
        data: {
          name: input.name || existing.name,
          employeeId: input.employeeId || existing.employeeId,
          invitedById: actor.id,
          invitedByName: actor.name,
          ...(existing.revokedAt ? { revokedAt: null, token: newTaskInviteToken(), emailStatus: "PENDING", sentAt: null, emailError: null } : {}),
        },
      })
    : await prisma.taskInvite.create({
        data: { taskId: task.id, email, name: input.name, employeeId: input.employeeId, token: newTaskInviteToken(), invitedById: actor.id, invitedByName: actor.name },
      });
  const sent = await sendTaskInvite(invite.id, origin, input.note);
  return { invite, sent };
}

function sentMessage(sent: "SENT" | "PENDING" | "FAILED", email: string, t: T) {
  if (sent === "SENT") return { message: t(`أُرسل الإشعار بالبريد إلى ${email}`, `Notification emailed to ${email}`) };
  if (sent === "FAILED") return { error: t(`تعذّر إرسال البريد إلى ${email}. انسخ الرابط من «المدعوّون بالبريد» وأرسله بنفسك.`, `Could not email ${email}. Copy the link from “Invited by email” and send it yourself.`) };
  return { message: t(`جُهّز رابط المهمة لـ ${email}. البريد الآلي غير مفعّل بعد؛ أرسله من «المدعوّون بالبريد» ببريدك أو واتساب.`, `A task link is ready for ${email}. Automatic email isn't set up yet; send it from “Invited by email” with your own mail or WhatsApp.`) };
}

async function activeEmployee(companyId: string, id: string) {
  if (!id) return null;
  return prisma.employee.findFirst({ where: { id, companyId, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, nameEn: true, email: true } });
}

/** Hands the task from one assignee to another employee (or from everyone, when `fromId` is empty). */
export async function transferTask(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { lang, t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    if (isClosedStatus(task.status)) fail(t("أعد فتح المهمة قبل تحويلها", "Reopen the task before transferring it"));
    const assignees = await prisma.taskAssignee.findMany({ where: { taskId: task.id }, include: { employee: { select: { id: true, fullName: true, nameEn: true } } } });
    const fromId = str(formData, "fromId") || "";
    const to = await activeEmployee(user.companyId, req(formData, "toId"));
    if (!to) fail(t("اختر الموظف الذي ستُحوَّل إليه المهمة", "Choose who the task goes to"));
    const from = fromId ? assignees.find((row) => row.employeeId === fromId) : null;
    if (fromId && !from) fail(t("الموظف المختار ليس مكلّفاً بهذه المهمة", "That employee isn't assigned to this task"));
    if (fromId === to.id) fail(t("اختر موظفاً آخر", "Choose a different employee"));
    const note = clip(str(formData, "note"), 500);
    const leaving = from ? [from] : assignees.filter((row) => row.employeeId !== to.id);
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: task.id, employeeId: { in: leaving.map((row) => row.employeeId) } } }),
      prisma.taskAssignee.createMany({ data: [{ taskId: task.id, employeeId: to.id }], skipDuplicates: true }),
      prisma.taskInvite.updateMany({ where: { taskId: task.id, employeeId: { in: leaving.map((row) => row.employeeId) }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    const fromNames = leaving.map((row) => personName(row.employee, lang)).join("، ");
    const toName = personName(to, lang);
    await logEvent(
      task.id,
      user,
      "TRANSFER",
      (fromNames ? t(`حوّل المهمة من «${fromNames}» إلى «${toName}»`, `Transferred the task from “${fromNames}” to “${toName}”`) : t(`أسند المهمة إلى «${toName}»`, `Assigned the task to “${toName}”`)) + (note ? `\n${note}` : ""),
    );
    await writeAudit({ userId: user.id, employeeId: to.id, action: "TASK_TRANSFER", message: t(`حوّل المهمة «${task.title}» إلى ${toName}`, `Transferred task “${task.title}” to ${toName}`) });
    let result: ActionResult = { message: t(`حُوّلت المهمة إلى ${toName}`, `Task transferred to ${toName}`) };
    if (formData.get("notify") === "1") {
      if (to.email && isEmail(to.email)) {
        const { sent } = await inviteAddress(task, user, { email: to.email, name: to.fullName, employeeId: to.id, note }, await requestOrigin());
        result = sentMessage(sent, to.email, t);
      } else result = { message: t(`حُوّلت المهمة إلى ${toName}. لا يوجد بريد في ملفه لإشعاره.`, `Task transferred to ${toName}. There is no email on file to notify them.`) };
    }
    refreshAll();
    return result;
  });
}

export async function addTaskAssignee(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { lang, t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const employee = await activeEmployee(user.companyId, req(formData, "employeeId"));
    if (!employee) fail(t("اختر موظفاً", "Choose an employee"));
    const exists = await prisma.taskAssignee.findUnique({ where: { taskId_employeeId: { taskId: task.id, employeeId: employee.id } } });
    if (exists) fail(t("الموظف مكلّف بالمهمة من قبل", "This employee is already assigned"));
    await prisma.taskAssignee.create({ data: { taskId: task.id, employeeId: employee.id } });
    const name = personName(employee, lang);
    await logEvent(task.id, user, "ASSIGN", t(`أضاف «${name}» إلى المهمة`, `Added “${name}” to the task`));
    let result: ActionResult = { message: t(`أُضيف ${name}`, `${name} added`) };
    if (formData.get("notify") === "1") {
      if (employee.email && isEmail(employee.email)) {
        const { sent } = await inviteAddress(task, user, { email: employee.email, name: employee.fullName, employeeId: employee.id, note: null }, await requestOrigin());
        result = sentMessage(sent, employee.email, t);
      } else result = { message: t(`أُضيف ${name}. لا يوجد بريد في ملفه لإشعاره.`, `${name} added. There is no email on file to notify them.`) };
    }
    refreshAll();
    return result;
  });
}

export async function removeTaskAssignee(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { lang, t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const row = await prisma.taskAssignee.findUnique({
      where: { taskId_employeeId: { taskId: task.id, employeeId: req(formData, "employeeId") } },
      include: { employee: { select: { fullName: true, nameEn: true } } },
    });
    if (!row) fail();
    await prisma.$transaction([
      prisma.taskAssignee.delete({ where: { taskId_employeeId: { taskId: task.id, employeeId: row.employeeId } } }),
      prisma.taskInvite.updateMany({ where: { taskId: task.id, employeeId: row.employeeId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    const name = personName(row.employee, lang);
    await logEvent(task.id, user, "ASSIGN", t(`أزال «${name}» من المهمة`, `Removed “${name}” from the task`));
    refreshAll();
    return { message: t(`أُزيل ${name} من المهمة`, `${name} removed from the task`) };
  });
}

/** Invites anyone by email. An address that belongs to an employee also makes them an assignee. */
export async function inviteToTask(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { lang, t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    const email = (str(formData, "email") || "").trim().toLowerCase().slice(0, 160);
    if (!isEmail(email)) fail(t("اكتب بريداً إلكترونياً صحيحاً", "Enter a valid email address"));
    const open = await prisma.taskInvite.count({ where: { taskId: task.id, revokedAt: null } });
    if (open >= MAX_INVITES) fail(t(`الحد ${MAX_INVITES} مدعوّاً للمهمة الواحدة`, `Up to ${MAX_INVITES} people can be invited to one task`));
    const employee = await prisma.employee.findFirst({
      where: { companyId: user.companyId, status: { not: "TERMINATED" }, email: { equals: email, mode: "insensitive" } },
      select: { id: true, fullName: true, nameEn: true },
    });
    const name = clip(str(formData, "name"), 120) || employee?.fullName || null;
    const note = clip(str(formData, "note"), 500);
    if (employee) await prisma.taskAssignee.createMany({ data: [{ taskId: task.id, employeeId: employee.id }], skipDuplicates: true });
    const { sent } = await inviteAddress(task, user, { email, name, employeeId: employee?.id || null, note }, await requestOrigin());
    const who = name ? `${name} <${email}>` : email;
    await logEvent(
      task.id,
      user,
      "INVITE",
      (employee ? t(`دعا «${who}» بالبريد وأضافه مكلّفاً (${personName(employee, lang)})`, `Invited “${who}” by email and assigned them (${personName(employee, lang)})`) : t(`دعا «${who}» بالبريد لمتابعة المهمة`, `Invited “${who}” by email to follow the task`)) +
        (note ? `\n${note}` : ""),
    );
    await writeAudit({ userId: user.id, action: "TASK_INVITE", message: t(`دعا ${email} إلى المهمة «${task.title}»`, `Invited ${email} to task “${task.title}”`) });
    refreshAll();
    return sentMessage(sent, email, t);
  });
}

async function findInvite(companyId: string, id: string) {
  return prisma.taskInvite.findFirst({ where: { id, task: { companyId } } });
}

export async function resendTaskInvite(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const invite = await findInvite(user.companyId, req(formData, "id"));
    if (!invite || invite.revokedAt) fail(t("الدعوة غير موجودة", "Invite not found"));
    const sent = await sendTaskInvite(invite.id, await requestOrigin());
    refreshAll();
    return sentMessage(sent, invite.email, t);
  });
}

export async function revokeTaskInvite(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const invite = await findInvite(user.companyId, req(formData, "id"));
    if (!invite) fail(t("الدعوة غير موجودة", "Invite not found"));
    if (!invite.revokedAt) {
      await prisma.taskInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      await logEvent(invite.taskId, user, "INVITE", t(`ألغى دعوة ${invite.email}؛ لم يعد رابطه يعمل`, `Revoked ${invite.email}'s invite; their link no longer works`));
    }
    refreshAll();
    return { message: t("أُلغيت الدعوة", "Invite revoked") };
  });
}

/** Moves the due date: a preset number of days (`days`) from the later of the current due date and today, or a chosen date. */
export async function postponeTask(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "id"), t);
    if (isClosedStatus(task.status)) fail(t("أعد فتح المهمة قبل تأجيلها", "Reopen the task before postponing it"));
    const days = Number(str(formData, "days") || 0);
    const start = today();
    const base = task.dueDate && task.dueDate > start ? task.dueDate : start;
    const chosen = parseDateInput(str(formData, "dueDate"));
    const next = days > 0 && days <= 365 ? new Date(base.getTime() + days * 86400000) : chosen;
    if (!next) fail(t("اختر مدة التأجيل أو التاريخ الجديد", "Choose how long to postpone or the new date"));
    if (next < start) fail(t("التاريخ الجديد مضى", "The new date has passed"));
    if (task.dueDate && next.getTime() === task.dueDate.getTime()) fail(t("هذا هو تاريخ الاستحقاق الحالي", "That is already the due date"));
    const reason = clip(str(formData, "reason"), 500);
    await prisma.task.update({
      where: { id: task.id },
      data: { dueDate: next, postponeCount: { increment: 1 }, ...(task.startDate && task.startDate > next ? { startDate: next } : {}) },
    });
    await logEvent(
      task.id,
      user,
      "POSTPONE",
      (task.dueDate ? t(`أجّل الاستحقاق من ${formatDate(task.dueDate)} إلى ${formatDate(next)}`, `Postponed the due date from ${formatDate(task.dueDate)} to ${formatDate(next)}`) : t(`حدّد الاستحقاق ${formatDate(next)}`, `Set the due date to ${formatDate(next)}`)) +
        (reason ? `\n${reason}` : ""),
    );
    refreshAll();
    return { message: t(`الاستحقاق الجديد: ${formatDate(next)}`, `New due date: ${formatDate(next)}`) };
  });
}

export async function archiveTask(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await findTask(user.companyId, req(formData, "id"), t);
    const restore = formData.get("restore") === "1";
    if (restore === !task.archivedAt) fail();
    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: restore ? null : new Date() } });
    await logEvent(task.id, user, "ARCHIVE", restore ? t("استعاد المهمة من الأرشيف", "Restored the task from the archive") : t("أرشف المهمة", "Archived the task"));
    await writeAudit({ userId: user.id, action: restore ? "TASK_RESTORE" : "TASK_ARCHIVE", message: restore ? t(`استعاد المهمة «${task.title}» من الأرشيف`, `Restored task “${task.title}” from the archive`) : t(`أرشف المهمة «${task.title}»`, `Archived task “${task.title}”`) });
    refreshAll();
    return { message: restore ? t("استُعيدت المهمة", "Task restored") : t("أُرشفت المهمة؛ لن تظهر في اللوحة والتنبيهات حتى تستعيدها", "Task archived; it leaves the board and alerts until you restore it") };
  });
}

/** A fresh copy to do again: same details, people and steps (unticked), back in To do. */
export async function duplicateTask(formData: FormData) {
  const user = await requirePermission("tasks.create", "/tasks");
  const { t } = await getI18n();
  const source = await prisma.task.findFirst({
    where: { id: req(formData, "id"), companyId: user.companyId },
    include: { assignees: { select: { employeeId: true } }, items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { text: true } } },
  });
  if (!source) go("/tasks", { error: t("المهمة غير موجودة", "Task not found") });
  const first = await prisma.task.findFirst({ where: { companyId: user.companyId, status: "TODO" }, orderBy: { position: "asc" }, select: { position: true } });
  const copy = await prisma.task.create({
    data: {
      companyId: user.companyId,
      title: clip(t(`${source!.title} (نسخة)`, `${source!.title} (copy)`), 200)!,
      description: source!.description,
      priority: source!.priority,
      startDate: source!.startDate,
      dueDate: source!.dueDate,
      position: (first?.position ?? 1) - 1,
      createdById: user.id,
      createdByName: user.name,
      assignees: { create: source!.assignees.map(({ employeeId }) => ({ employeeId })) },
      items: { create: source!.items.map(({ text }, position) => ({ text, position })) },
    },
  });
  await writeAudit({ userId: user.id, action: "TASK_CREATE", message: t(`نسخ المهمة «${source!.title}»`, `Duplicated task “${source!.title}”`) });
  refreshAll();
  go(`/tasks/${copy.id}`, { message: t("أُنشئت نسخة من المهمة؛ عدّل تاريخها ومن يتولاها إن لزم", "A copy was created; adjust its date and people if needed") });
}

export async function addTaskItem(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "taskId"), t);
    const text = clip(req(formData, "text"), 200);
    if (!text) fail(t("اكتب نص الخطوة", "Type the step"));
    const count = await prisma.taskItem.count({ where: { taskId: task.id } });
    await prisma.taskItem.create({ data: { taskId: task.id, text, position: count } });
    refreshAll();
    return {};
  });
}

export async function toggleTaskItem(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), task: { companyId: user.companyId, archivedAt: null } } });
    if (!item) fail(t("الخطوة غير موجودة", "Step not found"));
    await prisma.taskItem.update({ where: { id: item.id }, data: { done: !item.done } });
    refreshAll();
    return {};
  });
}

export async function deleteTaskItem(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), task: { companyId: user.companyId, archivedAt: null } } });
    if (!item) fail(t("الخطوة غير موجودة", "Step not found"));
    await prisma.taskItem.delete({ where: { id: item.id } });
    refreshAll();
    return {};
  });
}

/** AI: proposes checklist steps from the title and description and appends them. */
export async function suggestTaskItems(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await liveTask(user.companyId, req(formData, "taskId"), t);
    let steps: string[] = [];
    try {
      steps = await aiTaskChecklist(task.title, task.description);
    } catch (error) {
      console.error("AI checklist failed", error);
      fail(t("تعذر اقتراح الخطوات الآن. حاول لاحقاً.", "Could not suggest steps right now. Try again later."));
    }
    if (!steps.length) fail(t("لم يقترح الذكاء الاصطناعي خطوات لهذه المهمة", "The AI suggested no steps for this task"));
    const count = await prisma.taskItem.count({ where: { taskId: task.id } });
    await prisma.taskItem.createMany({ data: steps.map((text, index) => ({ taskId: task.id, text, position: count + index })) });
    refreshAll();
    return { message: t(`أُضيفت ${steps.length} خطوات مقترحة`, `Added ${steps.length} suggested steps`) };
  });
}

export async function addTaskComment(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const task = await findTask(user.companyId, req(formData, "taskId"), t);
    const body = clip(req(formData, "body"), 3000);
    if (!body) fail(t("اكتب التعليق", "Type a comment"));
    await prisma.taskComment.create({ data: { taskId: task.id, userId: user.id, authorName: user.name, body } });
    refreshAll();
    return {};
  });
}

export async function deleteTaskComment(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("tasks.edit", "/tasks");
  const { t } = await getI18n();
  return inPage(async () => {
    const comment = await prisma.taskComment.findFirst({ where: { id: req(formData, "id"), kind: "COMMENT", task: { companyId: user.companyId } } });
    if (!comment) fail(t("التعليق غير موجود", "Comment not found"));
    if (comment.userId !== user.id && !can(user, "tasks.delete")) fail(t("لا يمكنك حذف تعليق غيرك", "You can only delete your own comments"));
    await prisma.taskComment.delete({ where: { id: comment.id } });
    refreshAll();
    return {};
  });
}
