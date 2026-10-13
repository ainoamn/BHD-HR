import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive, AtSign, ListChecks, MessageSquare, PauseCircle } from "lucide-react";
import { FlashToast, Toaster } from "@/components/action-form";
import { TranslateToggle, Tr } from "@/components/ai-translate";
import { AiWriteAssist } from "@/components/ai-write";
import { LiveUpdates } from "@/components/live-updates";
import { CommentComposer } from "@/components/comment-composer";
import { TaskChecklist, type StepComment } from "@/components/task-checklist";
import { LiveBadges, StatusButtons, TaskLive } from "@/components/task-live";
import { TaskTimeline, type TimelineEntry } from "@/components/task-timeline";
import { Card, InfoItem, SectionTitle } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { inviteByToken } from "@/lib/task-invites";
import { taskMembers } from "@/lib/task-members";
import { GUEST_STATUSES, dueInfo, isClosedStatus, isTaskPriority, isTaskStatus } from "@/lib/tasks";
import { formatDate, formatDateTime } from "@/lib/utils";
import { guestAddTaskComment, guestSetTaskStatus, guestToggleTaskItem } from "@/server/task-guest-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Someone invited to a task by email: no account, the link's token is the only key. */
export default async function GuestTaskPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const invite = await inviteByToken(token);
  if (!invite) notFound();
  const { lang, t } = await getI18n();
  const [task, unread] = await Promise.all([
    prisma.task.findUnique({
      where: { id: invite.taskId },
      include: {
        assignees: { include: { employee: { select: { id: true, fullName: true, nameEn: true } } } },
        items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        comments: {
          orderBy: { createdAt: "asc" },
          take: 300,
          include: { mentions: { where: { kind: "MENTION" }, select: { name: true, inviteId: true } }, item: { select: { id: true, text: true } } },
        },
      },
    }),
    prisma.taskMention.findMany({ where: { taskId: invite.taskId, inviteId: invite.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  if (!task) notFound();
  const company = lang === "en" && invite.task.company.nameEn ? invite.task.company.nameEn : invite.task.company.name;
  const status = isTaskStatus(task.status) ? task.status : "TODO";
  const priority = isTaskPriority(task.priority) ? task.priority : "NORMAL";
  const locked = Boolean(task.archivedAt) || isClosedStatus(status) || status === "ON_HOLD";
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const [members] = await Promise.all([
    locked ? [] : taskMembers(task, lang, true),
    prisma.taskInvite.update({ where: { id: invite.id }, data: { lastSeenAt: new Date() } }),
    unread.length ? prisma.taskMention.updateMany({ where: { id: { in: unread.map((row) => row.id) } }, data: { readAt: new Date() } }) : null,
  ]);
  const lead = task.assignees.find((row) => row.employeeId === task.leadId)?.employee || null;
  const author = `${invite.name || invite.email} (${t("مدعوّ بالبريد", "invited by email")})`;
  const toEntry = (row: (typeof task.comments)[number]): TimelineEntry => ({
    ...row,
    mentions: row.mentions.map((mention) => ({ name: mention.name, mine: mention.inviteId === invite.id })),
    step: row.item,
  });
  const replies = new Map<string, TimelineEntry[]>();
  const threads: Record<string, StepComment[]> = {};
  for (const row of task.comments) {
    if (row.parentId) replies.set(row.parentId, [...(replies.get(row.parentId) || []), toEntry(row)]);
    if (row.kind === "COMMENT" && row.itemId) {
      threads[row.itemId] = [
        ...(threads[row.itemId] || []),
        { id: row.id, authorName: row.authorName, body: row.body, when: formatDateTime(row.createdAt), names: row.mentions.map((mention) => mention.name), mine: row.mentions.some((mention) => mention.inviteId === invite.id) },
      ];
    }
  }
  const timeline = task.comments.filter((row) => !row.parentId).map((row) => ({ ...toEntry(row), replies: replies.get(row.id) || [] }));

  return (
    <TaskLive status={status} priority={priority} resumeTo="TODO">
      <div className="min-h-dvh bg-slate-50" data-ai-context={`Task: ${task.title}${task.description ? `. Details: ${task.description.slice(0, 600)}` : ""}`}>
        <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
          <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-white/75">
                {t(`مهمة من «${company}»`, `A task from “${company}”`)}
                {invite.invitedByName ? ` · ${t(`دعاك ${invite.invitedByName}`, `invited by ${invite.invitedByName}`)}` : ""}
              </p>
              <TranslateToggle tone="dark" />
            </div>
            <h1 className="mt-2 break-words text-xl font-bold sm:text-2xl">
              <Tr text={task.title} size="text-base sm:text-lg" tone="dark" />
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LiveBadges due={dueInfo(task.dueDate, "TODO", lang)} plainDue={task.dueDate ? formatDate(task.dueDate) : null} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
          {unread.length ? (
            <div className="space-y-1.5 rounded-2xl bg-teal-50 p-4 text-sm leading-6 text-teal-900 ring-1 ring-inset ring-teal-200">
              {unread.map((row) => (
                <a key={row.id} href={row.commentId ? `#c-${row.commentId}` : "#comments"} className="flex items-start gap-2 font-semibold hover:underline">
                  <AtSign size={16} className="mt-1 shrink-0" />
                  <span>
                    {row.kind === "LEAD"
                      ? t(`عيّنك ${row.byName} مسؤولاً رئيسياً عن هذه المهمة`, `${row.byName} made you the lead of this task`)
                      : row.kind === "REPLY"
                        ? t(`ردّ ${row.byName} على تعليقك — اضغط لعرضه`, `${row.byName} replied to your comment — tap to see it`)
                        : t(`وجّه إليك ${row.byName} تعليقاً (يراه الجميع) — اضغط لعرضه`, `${row.byName} addressed a comment to you (everyone can see it) — tap to see it`)}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {locked ? (
            <div className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-sm leading-6 text-slate-700 shadow-card ring-1 ring-slate-200">
              {task.archivedAt ? <Archive size={18} className="mt-0.5 shrink-0 text-slate-500" /> : <PauseCircle size={18} className="mt-0.5 shrink-0 text-fuchsia-700" />}
              <p className="min-w-0">
                {task.archivedAt
                  ? t("أُرشفت هذه المهمة. يمكنك الاطلاع عليها فقط.", "This task has been archived. You can only view it.")
                  : status === "ON_HOLD"
                    ? t("المهمة معلّقة حالياً؛ ستتمكن من تحديثها عند استئنافها.", "The task is on hold; you can update it once it resumes.")
                    : t("أُغلقت هذه المهمة. شكراً لمتابعتك.", "This task is closed. Thank you for following up.")}
                {task.statusNote ? (
                  <span className="mt-1 block whitespace-pre-line break-words text-slate-600">
                    <Tr text={task.statusNote} />
                  </span>
                ) : null}
              </p>
            </div>
          ) : (
            <Card>
              <SectionTitle hint={t("أبلغ من دعاك بما وصلت إليه", "Tell the person who invited you where things are")}>{t("حدّث الحالة", "Update the status")}</SectionTitle>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                <StatusButtons action={guestSetTaskStatus} fields={{ token }} quick={GUEST_STATUSES} />
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              {task.description ? (
                <Card>
                  <SectionTitle>{t("الوصف", "Description")}</SectionTitle>
                  <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-700">
                    <Tr text={task.description} />
                  </p>
                </Card>
              ) : null}

              {task.items.length ? (
                <Card id="checklist" className="scroll-mt-6">
                  <SectionTitle>
                    <span className="inline-flex items-center gap-2">
                      <ListChecks size={18} className="text-teal-700" />
                      {t("خطوات التنفيذ", "Checklist")}
                    </span>
                  </SectionTitle>
                  <TaskChecklist
                    items={task.items.map((item) => ({ id: item.id, text: item.text, done: item.done }))}
                    fields={{ token }}
                    toggle={locked ? undefined : guestToggleTaskItem}
                    emptyText={t("لا توجد خطوات بعد.", "No steps yet.")}
                    threads={threads}
                    discuss={locked ? undefined : { action: guestAddTaskComment, fields: { token }, members, authorName: author }}
                  />
                </Card>
              ) : null}

              <Card id="comments" className="scroll-mt-6">
                <SectionTitle>
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={18} className="text-teal-700" />
                    {t("التعليقات والمتابعة", "Comments & updates")}
                  </span>
                </SectionTitle>
                <TaskTimeline
                  entries={timeline}
                  emptyText={t("لا توجد تعليقات بعد.", "No comments yet.")}
                  reply={
                    locked
                      ? undefined
                      : (entry) =>
                          entry.kind === "COMMENT" ? (
                            <CommentComposer
                              action={guestAddTaskComment}
                              fields={{ token, parentId: entry.id }}
                              members={members}
                              authorName={author}
                              placeholder={t(`ردّ على ${entry.authorName}…`, `Reply to ${entry.authorName}…`)}
                              submitLabel={t("رد", "Reply")}
                              toggle={t("رد", "Reply")}
                              compact
                            />
                          ) : null
                  }
                />
                {locked ? null : (
                  <CommentComposer
                    action={guestAddTaskComment}
                    fields={{ token }}
                    members={members}
                    authorName={author}
                    placeholder={t("اكتب تحديثاً أو سؤالاً… واكتب @ لتوجيهه إلى شخص", "Write an update or a question… type @ to address someone")}
                    submitLabel={t("إرسال", "Send")}
                  />
                )}
              </Card>
            </div>

            <aside className="min-w-0 space-y-4">
              <Card>
                <SectionTitle>{t("التفاصيل", "Details")}</SectionTitle>
                <dl className="grid gap-2">
                  <InfoItem label={t("تاريخ البداية", "Start date")} value={formatDate(task.startDate)} />
                  <InfoItem label={t("تاريخ الاستحقاق", "Due date")} value={formatDate(task.dueDate)} />
                  {lead ? <InfoItem label={t("المسؤول الرئيسي", "Task lead")} value={nameOf(lead)} /> : null}
                  <InfoItem label={t("المكلّفون", "Assigned to")} value={task.assignees.map(({ employee }) => nameOf(employee)).join("، ") || "—"} />
                  <InfoItem label={t("أنت", "You")} value={invite.name ? `${invite.name} · ${invite.email}` : invite.email} />
                </dl>
              </Card>
            </aside>
          </div>
        </main>
      </div>
      <FlashToast error={sp.error} message={sp.message} />
      {locked ? null : <AiWriteAssist />}
      <LiveUpdates source={{ task: token }} />
      <Toaster />
    </TaskLive>
  );
}
