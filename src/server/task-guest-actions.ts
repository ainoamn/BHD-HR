"use server";

import { writeAudit } from "@/lib/audit";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { inviteByToken } from "@/lib/task-invites";
import { GUEST_STATUSES, TASK_STATUS, isClosedStatus, type TaskStatus } from "@/lib/tasks";
import { clip, req, str } from "@/lib/utils";

/** The invite behind the link, refusing revoked links and archived tasks; closed and paused tasks are read-only. */
async function guestTask(token: string, t: (ar: string, en: string) => string, anchor = "") {
  const invite = await inviteByToken(token);
  const back = `/task/${token}${anchor}`;
  if (!invite) go(back);
  if (invite!.task.archivedAt || isClosedStatus(invite!.task.status) || invite!.task.status === "ON_HOLD") go(back, { error: t("المهمة مغلقة أو معلّقة؛ لا يمكن تعديلها الآن", "The task is closed or on hold; it can't be changed now") });
  await prisma.taskInvite.update({ where: { id: invite!.id }, data: { lastSeenAt: new Date() } });
  return { invite: invite!, back, author: invite!.name || invite!.email };
}

export async function guestSetTaskStatus(formData: FormData) {
  const { t } = await getI18n();
  const token = req(formData, "token");
  const { invite, back, author } = await guestTask(token, t);
  const status = req(formData, "status");
  if (!(GUEST_STATUSES as readonly string[]).includes(status)) go(back, { error: t("حالة غير متاحة", "Status not available") });
  const next = status as TaskStatus;
  if (next !== invite.task.status) {
    await prisma.task.update({ where: { id: invite.task.id }, data: { status: next } });
    const from = TASK_STATUS[invite.task.status as TaskStatus]?.label || { ar: invite.task.status, en: invite.task.status };
    await prisma.taskComment.create({
      data: {
        taskId: invite.task.id,
        authorName: `${author} (${t("مدعوّ بالبريد", "invited by email")})`,
        kind: "STATUS",
        body: t(`غيّر الحالة من «${from.ar}» إلى «${TASK_STATUS[next].label.ar}»`, `Changed status from “${from.en}” to “${TASK_STATUS[next].label.en}”`),
      },
    });
    await writeAudit({
      companyId: invite.task.companyId,
      action: "TASK_GUEST",
      message: t(`${invite.email} غيّر حالة المهمة «${invite.task.title}» إلى ${TASK_STATUS[next].label.ar}`, `${invite.email} set task “${invite.task.title}” to ${TASK_STATUS[next].label.en}`),
    });
    refreshAll();
  }
  go(back, { message: t(`الحالة: ${TASK_STATUS[next].label.ar}`, `Status: ${TASK_STATUS[next].label.en}`) });
}

export async function guestToggleTaskItem(formData: FormData) {
  const { t } = await getI18n();
  const { invite, back } = await guestTask(req(formData, "token"), t, "#checklist");
  const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), taskId: invite.task.id } });
  if (!item) go(back);
  await prisma.taskItem.update({ where: { id: item!.id }, data: { done: !item!.done } });
  refreshAll();
  go(back);
}

export async function guestAddTaskComment(formData: FormData) {
  const { t } = await getI18n();
  const { invite, back, author } = await guestTask(req(formData, "token"), t, "#comments");
  const body = clip(str(formData, "body"), 3000);
  if (!body) go(back, { error: t("اكتب التعليق", "Type a comment") });
  await prisma.taskComment.create({ data: { taskId: invite.task.id, authorName: `${author} (${t("مدعوّ بالبريد", "invited by email")})`, body: body! } });
  refreshAll();
  go(back);
}
