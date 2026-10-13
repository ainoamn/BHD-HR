import { STAFF_ROLES } from "./auth";
import { channelReady, sendEmailMessage } from "./delivery";
import { type Lang, makeT } from "./i18n";
import { permissionsFor } from "./permissions";
import { prisma } from "./prisma";
import { isEmail, newTaskInviteToken, taskInviteUrl } from "./task-invites";

/** Someone who can be named with @ in a task comment. `key` is e:<employee>, i:<invite> or u:<staff user>. */
export type TaskMember = { key: string; name: string; hint: string };

type TaskRef = { id: string; companyId: string; leadId: string | null; createdById?: string | null };

const nameIn = (employee: { fullName: string; nameEn: string | null }, lang: Lang) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

/**
 * The lead, the assignees, people invited by email and the staff who can open tasks. Guests only get the staff
 * already involved in this task (who wrote in it, created it or invited someone), not the company's whole staff.
 */
export async function taskMembers(task: TaskRef, lang: Lang, forGuest = false): Promise<TaskMember[]> {
  const t = makeT(lang);
  const [assignees, invites, company, involved] = await Promise.all([
    prisma.taskAssignee.findMany({ where: { taskId: task.id }, include: { employee: { select: { id: true, fullName: true, nameEn: true } } } }),
    prisma.taskInvite.findMany({ where: { taskId: task.id, revokedAt: null, employeeId: null }, select: { id: true, name: true, email: true, invitedById: true }, orderBy: { createdAt: "asc" } }),
    prisma.company.findUnique({ where: { id: task.companyId }, select: { rolePermissions: true } }),
    forGuest ? prisma.taskComment.findMany({ where: { taskId: task.id, userId: { not: null } }, select: { userId: true }, distinct: ["userId"] }) : [],
  ]);
  const staffIds = forGuest
    ? [...new Set([...involved.map((row) => row.userId), task.createdById, ...invites.map((invite) => invite.invitedById)].filter((id): id is string => Boolean(id)))]
    : null;
  const memberships = await prisma.membership.findMany({
    where: { companyId: task.companyId, userId: staffIds ? { in: staffIds } : { not: null }, role: { in: [...STAFF_ROLES] } },
    select: { role: true, permissions: true, user: { select: { id: true, name: true } } },
    take: 300,
  });
  const lead = assignees.find((row) => row.employeeId === task.leadId);
  const members: TaskMember[] = [
    ...(lead ? [lead] : []),
    ...assignees.filter((row) => row !== lead),
  ].map((row) => ({ key: `e:${row.employeeId}`, name: nameIn(row.employee, lang), hint: row === lead ? t("المسؤول الرئيسي", "Task lead") : t("مكلّف", "Assignee") }));
  for (const invite of invites) members.push({ key: `i:${invite.id}`, name: (invite.name || invite.email.split("@")[0]).trim(), hint: t("مدعوّ بالبريد", "Invited by email") });
  for (const membership of memberships) {
    if (!membership.user || !permissionsFor(membership.role, membership.permissions, company?.rolePermissions).includes("tasks.view")) continue;
    members.push({ key: `u:${membership.user.id}`, name: membership.user.name.trim(), hint: t("الإدارة", "Staff") });
  }
  const seen = new Set<string>();
  return members.filter((member) => member.name && !seen.has(member.key) && seen.add(member.key));
}

/** Members named as "@Name" in the text; longer names win, so "@Ali Hassan" is not also "@Ali". */
export function mentionedIn(body: string, members: TaskMember[]) {
  let rest = body;
  const found: TaskMember[] = [];
  for (const member of [...members].sort((a, b) => b.name.length - a.name.length)) {
    const token = `@${member.name}`;
    if (!rest.includes(token)) continue;
    found.push(member);
    rest = rest.split(token).join(" ");
  }
  return found;
}

type Target = { name: string; userId?: string; inviteId?: string; employeeId?: string; email?: string | null; url?: string };
type Kind = "MENTION" | "REPLY" | "LEAD";

/**
 * Who a member key reaches: staff through their alerts, guests and employees through their task link. An
 * employee with no link yet gets one (when `canInvite`, i.e. staff are writing), so they can open the task.
 */
async function resolve(key: string, task: { id: string; companyId: string }, origin: string, canInvite: boolean, by: { id: string | null; name: string }): Promise<Target | null> {
  const [type, id] = [key.slice(0, 1), key.slice(2)];
  if (type === "u") {
    const user = await prisma.user.findFirst({ where: { id, memberships: { some: { companyId: task.companyId } } }, select: { id: true, name: true, email: true } });
    return user ? { name: user.name, userId: user.id, email: user.email, url: `${origin}/tasks/${task.id}` } : null;
  }
  if (type === "i") {
    const invite = await prisma.taskInvite.findFirst({ where: { id, taskId: task.id, revokedAt: null } });
    return invite ? { name: invite.name || invite.email, inviteId: invite.id, email: invite.email, url: taskInviteUrl(origin, invite.token) } : null;
  }
  if (type !== "e") return null;
  const employee = await prisma.employee.findFirst({ where: { id, companyId: task.companyId }, select: { id: true, fullName: true, email: true } });
  if (!employee) return null;
  let invite = await prisma.taskInvite.findFirst({ where: { taskId: task.id, employeeId: employee.id, revokedAt: null } });
  const email = employee.email?.trim().toLowerCase();
  if (!invite && canInvite && email && isEmail(email)) {
    const existing = await prisma.taskInvite.findUnique({ where: { taskId_email: { taskId: task.id, email } } });
    invite = existing
      ? await prisma.taskInvite.update({ where: { id: existing.id }, data: { employeeId: employee.id, revokedAt: null, ...(existing.revokedAt ? { token: newTaskInviteToken(), emailStatus: "PENDING", sentAt: null } : {}) } })
      : await prisma.taskInvite.create({ data: { taskId: task.id, email, name: employee.fullName, employeeId: employee.id, token: newTaskInviteToken(), invitedById: by.id, invitedByName: by.name } });
  }
  return { name: employee.fullName, employeeId: employee.id, inviteId: invite?.id, email: invite?.email || email, url: invite ? taskInviteUrl(origin, invite.token) : undefined };
}

function noticeText(kind: Kind, byName: string, title: string, excerpt: string, url: string) {
  const quote = excerpt ? `«${excerpt}»` : "";
  const ar = kind === "LEAD" ? `عيّنك ${byName} مسؤولاً رئيسياً عن المهمة «${title}».` : kind === "REPLY" ? `ردّ ${byName} على تعليقك في المهمة «${title}»:` : `وجّه إليك ${byName} تعليقاً في المهمة «${title}» (يراه كل من في المهمة):`;
  const en = kind === "LEAD" ? `${byName} made you the lead of the task “${title}”.` : kind === "REPLY" ? `${byName} replied to your comment on “${title}”:` : `${byName} addressed a comment to you on “${title}” (everyone on the task can see it):`;
  return [ar, quote, `افتح المهمة: ${url}`, "", en, quote, `Open the task: ${url}`].filter((line, index) => line || index === 3).join("\n");
}

/**
 * Records the personal notices for a comment (or a new lead) and emails them when the mail service is on.
 * The author is never notified about their own words. Returns who was reached and who has no way to be told.
 */
export async function notifyTask(input: {
  task: { id: string; title: string; companyId: string };
  commentId: string | null;
  kind: Kind;
  /** Who to notify, with the name as it was written after @ (kept for marking it in the comment). */
  people: { key: string; name: string }[];
  reply?: { userId: string | null; inviteId: string | null; name: string } | null;
  author: { userId?: string | null; inviteId?: string | null; name: string };
  excerpt: string;
  origin: string;
  canInvite: boolean;
}) {
  const targets: (Target & { kind: Kind })[] = [];
  const same = (a: Target, b: Target) => Boolean((a.userId && a.userId === b.userId) || (a.inviteId && a.inviteId === b.inviteId) || (a.employeeId && a.employeeId === b.employeeId));
  const self: Target = { name: input.author.name, userId: input.author.userId || undefined, inviteId: input.author.inviteId || undefined };
  for (const person of input.people.slice(0, 20)) {
    const target = await resolve(person.key, input.task, input.origin, input.canInvite, { id: input.author.userId || null, name: input.author.name });
    if (target && !same(target, self) && !targets.some((row) => same(row, target))) targets.push({ ...target, name: person.name, kind: input.kind });
  }
  if (input.reply && (input.reply.userId || input.reply.inviteId)) {
    const target: Target = { name: input.reply.name, userId: input.reply.userId || undefined, inviteId: input.reply.inviteId || undefined };
    if (!same(target, self) && !targets.some((row) => same(row, target))) {
      if (target.userId) {
        const user = await prisma.user.findUnique({ where: { id: target.userId }, select: { email: true } });
        Object.assign(target, { email: user?.email, url: `${input.origin}/tasks/${input.task.id}` });
      } else {
        const invite = await prisma.taskInvite.findFirst({ where: { id: target.inviteId, revokedAt: null } });
        if (invite) Object.assign(target, { email: invite.email, url: taskInviteUrl(input.origin, invite.token) });
        else target.inviteId = undefined;
      }
      if (target.userId || target.inviteId) targets.push({ ...target, kind: "REPLY" });
    }
  }
  if (!targets.length) return { reached: [] as string[], unreached: [] as string[] };
  await prisma.taskMention.createMany({
    data: targets.map((target) => ({
      taskId: input.task.id,
      commentId: input.commentId,
      kind: target.kind,
      userId: target.userId || null,
      inviteId: target.inviteId || null,
      employeeId: target.employeeId || null,
      name: target.name.slice(0, 160),
      byName: input.author.name.slice(0, 160),
    })),
  });
  if (channelReady("EMAIL")) {
    await Promise.all(
      targets
        .filter((target) => target.email && target.url && isEmail(target.email))
        .map((target) =>
          sendEmailMessage({
            to: target.email!,
            subject: `${target.kind === "LEAD" ? "مسؤول رئيسي" : target.kind === "REPLY" ? "رد على تعليقك" : "تعليق موجّه إليك"}: ${input.task.title}`,
            text: noticeText(target.kind, input.author.name, input.task.title, input.excerpt.slice(0, 400), `${target.url}${input.commentId ? `#c-${input.commentId}` : ""}`),
          }).catch((error) => console.error("Task notice email failed", error)),
        ),
    );
  }
  return {
    reached: targets.filter((target) => target.userId || target.inviteId).map((target) => target.name),
    unreached: targets.filter((target) => !target.userId && !target.inviteId).map((target) => target.name),
  };
}
