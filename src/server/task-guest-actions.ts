"use server";

import type { ActionResult } from "@/lib/action-result";
import { writeAudit } from "@/lib/audit";
import { refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { inviteByToken } from "@/lib/task-invites";
import { GUEST_STATUSES, TASK_STATUS, isClosedStatus, type TaskStatus } from "@/lib/tasks";
import { clip, req, str } from "@/lib/utils";

type T = (ar: string, en: string) => string;

/** The invite behind the link, refusing revoked links and archived tasks; closed and paused tasks are read-only. */
type Invite = NonNullable<Awaited<ReturnType<typeof inviteByToken>>>;

async function guestTask(token: string, t: T): Promise<{ error: string } | { invite: Invite; author: string }> {
  const invite = await inviteByToken(token);
  if (!invite) return { error: t("الرابط لم يعد صالحاً", "This link is no longer valid") };
  if (invite.task.archivedAt || isClosedStatus(invite.task.status) || invite.task.status === "ON_HOLD") return { error: t("المهمة مغلقة أو معلّقة؛ لا يمكن تعديلها الآن", "The task is closed or on hold; it can't be changed now") };
  await prisma.taskInvite.update({ where: { id: invite.id }, data: { lastSeenAt: new Date() } });
  return { invite, author: `${invite.name || invite.email} (${t("مدعوّ بالبريد", "invited by email")})` };
}

/** Guest changes refresh the page in place, like the staff task page; refusals come back as an error. */
function refused(error: string): ActionResult {
  refreshAll();
  return { error };
}

export async function guestSetTaskStatus(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  const guest = await guestTask(req(formData, "token"), t);
  if ("error" in guest) return refused(guest.error);
  const { invite, author } = guest;
  const status = req(formData, "status");
  if (!(GUEST_STATUSES as readonly string[]).includes(status)) return refused(t("حالة غير متاحة", "Status not available"));
  const next = status as TaskStatus;
  if (next !== invite.task.status) {
    await prisma.task.update({ where: { id: invite.task.id }, data: { status: next } });
    const from = TASK_STATUS[invite.task.status as TaskStatus]?.label || { ar: invite.task.status, en: invite.task.status };
    await prisma.taskComment.create({
      data: {
        taskId: invite.task.id,
        authorName: author,
        kind: "STATUS",
        body: t(`غيّر الحالة من «${from.ar}» إلى «${TASK_STATUS[next].label.ar}»`, `Changed status from “${from.en}” to “${TASK_STATUS[next].label.en}”`),
      },
    });
    await writeAudit({
      companyId: invite.task.companyId,
      action: "TASK_GUEST",
      message: t(`${invite.email} غيّر حالة المهمة «${invite.task.title}» إلى ${TASK_STATUS[next].label.ar}`, `${invite.email} set task “${invite.task.title}” to ${TASK_STATUS[next].label.en}`),
    });
  }
  refreshAll();
  return { message: t(`الحالة: ${TASK_STATUS[next].label.ar}`, `Status: ${TASK_STATUS[next].label.en}`) };
}

export async function guestToggleTaskItem(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  const guest = await guestTask(req(formData, "token"), t);
  if ("error" in guest) return refused(guest.error);
  const item = await prisma.taskItem.findFirst({ where: { id: req(formData, "id"), taskId: guest.invite.task.id } });
  if (!item) return refused(t("الخطوة غير موجودة", "Step not found"));
  await prisma.taskItem.update({ where: { id: item.id }, data: { done: !item.done } });
  refreshAll();
  return {};
}

export async function guestAddTaskComment(formData: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  const guest = await guestTask(req(formData, "token"), t);
  if ("error" in guest) return refused(guest.error);
  const body = clip(str(formData, "body"), 3000);
  if (!body) return refused(t("اكتب التعليق", "Type a comment"));
  await prisma.taskComment.create({ data: { taskId: guest.invite.task.id, authorName: guest.author, body } });
  refreshAll();
  return {};
}
