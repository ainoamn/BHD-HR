import { randomBytes } from "crypto";
import { channelReady, sendEmailMessage } from "./delivery";
import { prisma } from "./prisma";
import { TASK_PRIORITY, isTaskPriority } from "./tasks";
import { formatDate } from "./utils";

export function newTaskInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function taskInviteUrl(origin: string, token: string) {
  return `${origin}/task/${token}`;
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

type InviteMessage = {
  name: string | null;
  inviterName: string;
  companyName: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  note?: string | null;
  url: string;
};

/** Bilingual body used for the email and for the "send from my mail / WhatsApp" fallbacks. */
export function taskInviteMessage(input: InviteMessage) {
  const priority = isTaskPriority(input.priority) ? TASK_PRIORITY[input.priority].label : TASK_PRIORITY.NORMAL.label;
  const due = input.dueDate ? formatDate(input.dueDate) : null;
  const note = input.note?.trim();
  return [
    `مرحباً${input.name ? ` ${input.name}` : ""}،`,
    `يدعوك ${input.inviterName} من «${input.companyName}» لمتابعة المهمة: «${input.title}».`,
    `الأولوية: ${priority.ar}${due ? ` · الاستحقاق: ${due}` : ""}`,
    note ? `ملاحظة: ${note}` : null,
    `افتح المهمة من الرابط (لا يحتاج حساباً):`,
    input.url,
    "",
    `Hello${input.name ? ` ${input.name}` : ""},`,
    `${input.inviterName} from “${input.companyName}” invites you to follow the task “${input.title}”.`,
    `Priority: ${priority.en}${due ? ` · Due: ${due}` : ""}`,
    note ? `Note: ${note}` : null,
    `Open the task (no account needed):`,
    input.url,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function taskInviteSubject(title: string) {
  return `مهمة: ${title} / Task: ${title}`;
}

/** Emails the invite when the mail service is configured; otherwise it stays PENDING for the link to be shared by hand. */
export async function sendTaskInvite(inviteId: string, origin: string, note?: string | null) {
  const invite = await prisma.taskInvite.findUnique({ where: { id: inviteId }, include: { task: { include: { company: { select: { name: true } } } } } });
  if (!invite || invite.revokedAt) return "PENDING" as const;
  if (!channelReady("EMAIL")) return "PENDING" as const;
  const url = taskInviteUrl(origin, invite.token);
  try {
    await sendEmailMessage({
      to: invite.email,
      subject: taskInviteSubject(invite.task.title),
      text: taskInviteMessage({
        name: invite.name,
        inviterName: invite.invitedByName || invite.task.company.name,
        companyName: invite.task.company.name,
        title: invite.task.title,
        priority: invite.task.priority,
        dueDate: invite.task.dueDate,
        note,
        url,
      }),
    });
    await prisma.taskInvite.update({ where: { id: invite.id }, data: { emailStatus: "SENT", sentAt: new Date(), emailError: null } });
    return "SENT" as const;
  } catch (error) {
    await prisma.taskInvite.update({
      where: { id: invite.id },
      data: { emailStatus: "FAILED", emailError: error instanceof Error ? error.message.slice(0, 500) : "send failed" },
    });
    return "FAILED" as const;
  }
}

/** The open invite behind a /task/<token> link, or null when it is unknown or revoked. */
export async function inviteByToken(token: string) {
  if (!token || token.length < 20 || token.length > 64) return null;
  const invite = await prisma.taskInvite.findUnique({ where: { token }, include: { task: { include: { company: { select: { id: true, name: true, nameEn: true } } } } } });
  if (!invite || invite.revokedAt) return null;
  return invite;
}
