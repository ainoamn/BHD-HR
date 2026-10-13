import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive, Check, Flag, ListChecks, MessageSquare, PauseCircle } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { TaskTimeline } from "@/components/task-timeline";
import { Card, InfoItem, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { inviteByToken } from "@/lib/task-invites";
import { GUEST_STATUSES, TASK_PRIORITY, TASK_STATUS, dueInfo, isClosedStatus, isTaskPriority, isTaskStatus } from "@/lib/tasks";
import { cn, formatDate } from "@/lib/utils";
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
  await prisma.taskInvite.update({ where: { id: invite.id }, data: { lastSeenAt: new Date() } });
  const task = await prisma.task.findUnique({
    where: { id: invite.taskId },
    include: {
      assignees: { include: { employee: { select: { id: true, fullName: true, nameEn: true } } } },
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      comments: { orderBy: { createdAt: "asc" }, take: 300 },
    },
  });
  if (!task) notFound();
  const company = lang === "en" && invite.task.company.nameEn ? invite.task.company.nameEn : invite.task.company.name;
  const status = isTaskStatus(task.status) ? task.status : "TODO";
  const priority = isTaskPriority(task.priority) ? task.priority : "NORMAL";
  const due = dueInfo(task.dueDate, status, lang);
  const locked = Boolean(task.archivedAt) || isClosedStatus(status) || status === "ON_HOLD";
  const done = task.items.filter((item) => item.done).length;
  const percent = task.items.length ? Math.round((done / task.items.length) * 100) : 0;
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-5">
          <p className="text-sm font-semibold text-white/75">
            {t(`مهمة من «${company}»`, `A task from “${company}”`)}
            {invite.invitedByName ? ` · ${t(`دعاك ${invite.invitedByName}`, `invited by ${invite.invitedByName}`)}` : ""}
          </p>
          <h1 className="mt-2 break-words text-xl font-bold sm:text-2xl">{task.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white", TASK_STATUS[status].solid)}>{pick(TASK_STATUS[status].label, lang)}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white", TASK_PRIORITY[priority].solid)}>
              <Flag size={12} /> {pick(TASK_PRIORITY[priority].label, lang)}
            </span>
            {due ? <ToneBadge tone={due.tone}>{due.label}</ToneBadge> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        <Flash error={sp.error} message={sp.message} />

        {locked ? (
          <div className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-sm leading-6 text-slate-700 shadow-card ring-1 ring-slate-200">
            {task.archivedAt ? <Archive size={18} className="mt-0.5 shrink-0 text-slate-500" /> : <PauseCircle size={18} className="mt-0.5 shrink-0 text-fuchsia-700" />}
            <p className="min-w-0">
              {task.archivedAt
                ? t("أُرشفت هذه المهمة. يمكنك الاطلاع عليها فقط.", "This task has been archived. You can only view it.")
                : status === "ON_HOLD"
                  ? t("المهمة معلّقة حالياً؛ ستتمكن من تحديثها عند استئنافها.", "The task is on hold; you can update it once it resumes.")
                  : t("أُغلقت هذه المهمة. شكراً لمتابعتك.", "This task is closed. Thank you for following up.")}
              {task.statusNote ? <span className="mt-1 block whitespace-pre-line break-words text-slate-600">{task.statusNote}</span> : null}
            </p>
          </div>
        ) : (
          <Card>
            <SectionTitle hint={t("أبلغ من دعاك بما وصلت إليه", "Tell the person who invited you where things are")}>{t("حدّث الحالة", "Update the status")}</SectionTitle>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {GUEST_STATUSES.map((option) => (
                <form key={option} action={guestSetTaskStatus}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="status" value={option} />
                  <button
                    disabled={option === status}
                    aria-pressed={option === status}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition duration-200",
                      option === status ? `${TASK_STATUS[option].solid} text-white ring-transparent` : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", option === status ? "bg-white" : TASK_STATUS[option].dot)} />
                    {pick(TASK_STATUS[option].label, lang)}
                  </button>
                </form>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {task.description ? (
              <Card>
                <SectionTitle>{t("الوصف", "Description")}</SectionTitle>
                <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-700">{task.description}</p>
              </Card>
            ) : null}

            {task.items.length ? (
              <Card id="checklist" className="scroll-mt-6">
                <SectionTitle hint={t(`${done} من ${task.items.length} مكتملة`, `${done} of ${task.items.length} done`)}>
                  <span className="inline-flex items-center gap-2">
                    <ListChecks size={18} className="text-teal-700" />
                    {t("خطوات التنفيذ", "Checklist")}
                  </span>
                </SectionTitle>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <ul className="space-y-1">
                  {task.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 rounded-xl px-1 py-1.5">
                      {locked ? (
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", item.done ? "bg-teal-700 text-white ring-teal-700" : "ring-slate-300")}>
                          {item.done ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                      ) : (
                        <form action={guestToggleTaskItem}>
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            aria-label={item.done ? t("إلغاء الإنجاز", "Mark not done") : t("تم", "Mark done")}
                            className={cn(
                              "mt-0.5 flex size-5 items-center justify-center rounded-md ring-1 ring-inset transition",
                              item.done ? "bg-teal-700 text-white ring-teal-700" : "bg-surface ring-slate-300 hover:ring-teal-600",
                            )}
                          >
                            {item.done ? <Check size={13} strokeWidth={3} /> : null}
                          </button>
                        </form>
                      )}
                      <span className={cn("min-w-0 flex-1 break-words text-sm leading-6", item.done ? "text-slate-400 line-through" : "text-slate-800")}>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card id="comments" className="scroll-mt-6">
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <MessageSquare size={18} className="text-teal-700" />
                  {t("التعليقات والمتابعة", "Comments & updates")}
                </span>
              </SectionTitle>
              <TaskTimeline entries={task.comments} emptyText={t("لا توجد تعليقات بعد.", "No comments yet.")} />
              {locked ? null : (
                <form action={guestAddTaskComment} className="mt-4 space-y-2">
                  <input type="hidden" name="token" value={token} />
                  <textarea name="body" required maxLength={3000} placeholder={t("اكتب تحديثاً أو سؤالاً عن المهمة…", "Write an update or a question about the task…")} className={`${fieldClass} min-h-20 w-full`} />
                  <SubmitButton>{t("إرسال", "Send")}</SubmitButton>
                </form>
              )}
            </Card>
          </div>

          <aside className="min-w-0 space-y-4">
            <Card>
              <SectionTitle>{t("التفاصيل", "Details")}</SectionTitle>
              <dl className="grid gap-2">
                <InfoItem label={t("تاريخ البداية", "Start date")} value={formatDate(task.startDate)} />
                <InfoItem label={t("تاريخ الاستحقاق", "Due date")} value={formatDate(task.dueDate)} />
                <InfoItem label={t("المكلّفون", "Assigned to")} value={task.assignees.map(({ employee }) => nameOf(employee)).join("، ") || "—"} />
                <InfoItem label={t("أنت", "You")} value={invite.name ? `${invite.name} · ${invite.email}` : invite.email} />
              </dl>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
