import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  Check,
  CircleSlash,
  Copy,
  Eye,
  Flag,
  ListChecks,
  Mail,
  MessageSquare,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
  Send,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { Flash } from "@/components/flash";
import { InviteLink } from "@/components/invite-link";
import { Modal } from "@/components/modal";
import { DeleteButton } from "@/components/row-forms";
import { SearchSelect } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import { TaskForm } from "@/components/task-form";
import { TaskTimeline } from "@/components/task-timeline";
import { Card, Field, InfoItem, SectionTitle, ToneBadge, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { employeeOptions } from "@/lib/task-data";
import { taskInviteMessage, taskInviteSubject, taskInviteUrl } from "@/lib/task-invites";
import { TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, dueInfo, isClosedStatus, isTaskPriority, isTaskStatus, type TaskStatus } from "@/lib/tasks";
import { cn, formatDate, formatDateTime, toDateInput } from "@/lib/utils";
import {
  addTaskAssignee,
  addTaskComment,
  addTaskItem,
  archiveTask,
  deleteTask,
  deleteTaskComment,
  deleteTaskItem,
  duplicateTask,
  inviteToTask,
  postponeTask,
  removeTaskAssignee,
  resendTaskInvite,
  revokeTaskInvite,
  setTaskPriority,
  setTaskStatus,
  suggestTaskItems,
  toggleTaskItem,
  transferTask,
  updateTask,
} from "@/server/task-actions";

const QUICK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const POSTPONE_DAYS = [1, 3, 7, 14];

const pill = (selected: boolean, solid: string) =>
  cn(
    "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition duration-200 lg:w-auto",
    selected ? `${solid} text-white shadow-card ring-transparent` : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300",
  );

const INVITE_STATE: Record<string, { tone: string; label: { ar: string; en: string } }> = {
  SENT: { tone: "green", label: { ar: "أُرسل بالبريد", en: "Emailed" } },
  PENDING: { tone: "amber", label: { ar: "بانتظار إرسال الرابط", en: "Link to send" } },
  FAILED: { tone: "red", label: { ar: "تعذّر الإرسال", en: "Sending failed" } },
};

const TIMELINE_RECENT = 40;

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string; log?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("tasks.view");
  const { lang, t } = await getI18n();
  const task = await prisma.task.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      company: { select: { name: true, nameEn: true } },
      assignees: { include: { employee: { select: { id: true, fullName: true, nameEn: true, photoUrl: true, employeeNumber: true, jobTitle: true, jobTitleEn: true, email: true } } } },
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      comments: { orderBy: { createdAt: "asc" } },
      invites: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) notFound();
  const allow = { edit: can(user, "tasks.edit"), create: can(user, "tasks.create"), remove: can(user, "tasks.delete") };
  const archived = Boolean(task.archivedAt);
  const canAct = allow.edit && !archived;
  const status = isTaskStatus(task.status) ? task.status : "TODO";
  const priority = isTaskPriority(task.priority) ? task.priority : "NORMAL";
  const closed = isClosedStatus(status);
  const due = dueInfo(task.dueDate, status, lang);
  const done = task.items.filter((item) => item.done).length;
  const percent = task.items.length ? Math.round((done / task.items.length) * 100) : 0;
  const base = `/tasks/${task.id}`;
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const employees = allow.edit ? await employeeOptions(user.companyId, lang) : [];
  const assignedIds = new Set(task.assignees.map((row) => row.employeeId));
  const others = employees.filter((option) => !assignedIds.has(option.value));
  const origin = task.invites.length ? await requestOrigin() : "";
  const company = lang === "en" && task.company.nameEn ? task.company.nameEn : task.company.name;
  const emailReady = channelReady("EMAIL");
  const statusSolid = TASK_STATUS[status].solid;
  const hiddenEntries = sp.log === "all" ? 0 : Math.max(0, task.comments.length - TIMELINE_RECENT);

  const statusForm = (option: TaskStatus) => (
    <form key={option} action={setTaskStatus} className="min-w-0">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="status" value={option} />
      <input type="hidden" name="returnTo" value={base} />
      <button disabled={option === status} aria-pressed={option === status} className={pill(option === status, TASK_STATUS[option].solid)}>
        <span className={cn("size-2 rounded-full", option === status ? "bg-white" : TASK_STATUS[option].dot)} />
        {pick(TASK_STATUS[option].label, lang)}
      </button>
    </form>
  );

  const reasonModal = (option: "ON_HOLD" | "CANCELLED", trigger: string) =>
    option === status ? (
      <button key={option} disabled aria-pressed className={pill(true, TASK_STATUS[option].solid)}>
        <span className="size-2 rounded-full bg-white" />
        {pick(TASK_STATUS[option].label, lang)}
      </button>
    ) : (
      <Modal
        key={option}
        size="sm"
        title={option === "ON_HOLD" ? t("تعليق المهمة", "Put the task on hold") : t("إغلاق المهمة دون إنجاز", "Close without completion")}
        triggerClassName={trigger}
        label={
          <>
            <span className={cn("size-2 rounded-full", TASK_STATUS[option].dot)} />
            {option === "ON_HOLD" ? t("تعليق", "Hold") : t("إغلاق", "Close")}
          </>
        }
      >
        <form action={setTaskStatus} className="space-y-4 text-start">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="status" value={option} />
          <input type="hidden" name="returnTo" value={base} />
          <p className="text-sm leading-6 text-slate-600">
            {option === "ON_HOLD"
              ? t("تتوقف المهمة مؤقتاً: لا تُحتسب متأخرة ولا تظهر في التنبيهات، وتعود عند الاستئناف إلى حالتها السابقة.", "The task pauses: it is not counted as overdue or alerted, and resuming returns it to its previous status.")
              : t("للمهام التي لن تُنجز (أُلغيت أو لم تعد مطلوبة). تبقى في السجل ويمكن إعادة فتحها.", "For tasks that won't be done (cancelled or no longer needed). They stay on record and can be reopened.")}
          </p>
          <Field label={option === "ON_HOLD" ? t("سبب التعليق (اختياري)", "Reason (optional)") : t("سبب الإغلاق *", "Reason *")}>
            <textarea name="note" required={option === "CANCELLED"} maxLength={500} className={`${fieldClass} min-h-20 w-full`} />
          </Field>
          <SubmitButton variant={option === "CANCELLED" ? "danger" : "primary"}>
            {option === "ON_HOLD" ? <PauseCircle size={16} /> : <CircleSlash size={16} />}
            {option === "ON_HOLD" ? t("تعليق المهمة", "Put on hold") : t("إغلاق المهمة", "Close the task")}
          </SubmitButton>
        </form>
      </Modal>
    );

  return (
    <div className="page-wide space-y-5">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل المهام", "All tasks")}
      </Link>

      {archived ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
            <Archive size={18} className="mt-0.5 shrink-0 text-slate-500" />
            {t(
              `مؤرشفة منذ ${formatDate(task.archivedAt)}. لا تظهر في اللوحة ولا التنبيهات، ولا يمكن تعديلها حتى تستعيدها.`,
              `Archived since ${formatDate(task.archivedAt)}. It is off the board and alerts, and can't be changed until restored.`,
            )}
          </p>
          {allow.edit ? (
            <form action={archiveTask} className="shrink-0">
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="restore" value="1" />
              <SubmitButton pendingLabel={t("جارٍ الاستعادة...", "Restoring...")}>
                <ArchiveRestore size={16} />
                {t("استعادة المهمة", "Restore task")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      <section className="animate-fade-up overflow-hidden rounded-3xl border border-slate-200/90 bg-surface shadow-card">
        <div className={cn("h-1.5", statusSolid)} aria-hidden="true" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white", statusSolid)}>{pick(TASK_STATUS[status].label, lang)}</span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white", TASK_PRIORITY[priority].solid)}>
                  <Flag size={12} /> {pick(TASK_PRIORITY[priority].label, lang)}
                </span>
                {due ? <ToneBadge tone={due.tone}>{due.label}</ToneBadge> : null}
                {task.postponeCount ? (
                  <ToneBadge tone="amber">
                    <CalendarClock size={12} /> {t(`أُجّلت ${task.postponeCount}×`, `Postponed ${task.postponeCount}×`)}
                  </ToneBadge>
                ) : null}
                {archived ? <ToneBadge tone="slate">{t("مؤرشفة", "Archived")}</ToneBadge> : null}
              </div>
              <h1 className={cn("break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl", closed && "text-slate-500 line-through")}>{task.title}</h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canAct ? (
                <Modal
                  title={t("تعديل المهمة", "Edit task")}
                  triggerClassName={secondaryBtn}
                  label={
                    <>
                      <Pencil size={16} />
                      {t("تعديل", "Edit")}
                    </>
                  }
                >
                  <TaskForm
                    action={updateTask}
                    employees={employees}
                    returnTo={base}
                    submitLabel={t("حفظ التعديلات", "Save changes")}
                    task={{
                      id: task.id,
                      title: task.title,
                      description: task.description,
                      status,
                      priority,
                      startDate: toDateInput(task.startDate),
                      dueDate: toDateInput(task.dueDate),
                      assigneeIds: task.assignees.map((item) => item.employeeId),
                    }}
                  />
                </Modal>
              ) : null}
              {canAct && !closed ? (
                <Modal
                  size="sm"
                  title={t("تأجيل المهمة", "Postpone the task")}
                  triggerClassName={secondaryBtn}
                  label={
                    <>
                      <CalendarClock size={16} />
                      {t("تأجيل", "Postpone")}
                    </>
                  }
                >
                  <form action={postponeTask} className="space-y-4 text-start">
                    <input type="hidden" name="id" value={task.id} />
                    <p className="text-sm leading-6 text-slate-600">
                      {task.dueDate
                        ? t(`الاستحقاق الحالي ${formatDate(task.dueDate)}. تُحسب المدة من الاستحقاق أو من اليوم إن كان قد مضى.`, `Currently due ${formatDate(task.dueDate)}. The period counts from the due date, or from today if it has passed.`)
                        : t("لا يوجد تاريخ استحقاق؛ تُحسب المدة من اليوم.", "There is no due date yet; the period counts from today.")}
                    </p>
                    <Field label={t("سبب التأجيل (اختياري)", "Reason (optional)")}>
                      <textarea name="reason" maxLength={500} className={`${fieldClass} min-h-16 w-full`} />
                    </Field>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">{t("أجّل لمدة", "Postpone by")}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {POSTPONE_DAYS.map((days) => (
                          <SubmitButton key={days} variant="secondary" name="days" value={String(days)} className="w-full">
                            {days === 1 ? t("يوم", "1 day") : days === 7 ? t("أسبوع", "1 week") : days === 14 ? t("أسبوعان", "2 weeks") : t(`${days} أيام`, `${days} days`)}
                          </SubmitButton>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <Field label={t("أو إلى تاريخ محدد", "Or to a date")}>
                          <input type="date" name="dueDate" min={toDateInput(new Date())} className={`${fieldClass} w-full`} />
                        </Field>
                      </div>
                      <SubmitButton>
                        <CalendarClock size={16} />
                        {t("تأجيل", "Postpone")}
                      </SubmitButton>
                    </div>
                  </form>
                </Modal>
              ) : null}
              {canAct && status === "ON_HOLD" ? (
                <form action={setTaskStatus}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value="RESUME" />
                  <input type="hidden" name="returnTo" value={base} />
                  <SubmitButton pendingLabel={t("جارٍ الاستئناف...", "Resuming...")}>
                    <PlayCircle size={16} />
                    {t("استئناف", "Resume")}
                  </SubmitButton>
                </form>
              ) : null}
              {canAct && closed ? (
                <form action={setTaskStatus}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value="TODO" />
                  <input type="hidden" name="returnTo" value={base} />
                  <SubmitButton variant="secondary" pendingLabel={t("جارٍ الفتح...", "Reopening...")}>
                    <RotateCcw size={16} />
                    {t("إعادة فتح", "Reopen")}
                  </SubmitButton>
                </form>
              ) : null}
              {allow.create ? (
                <form action={duplicateTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <SubmitButton variant="secondary" pendingLabel={t("جارٍ النسخ...", "Copying...")}>
                    <Copy size={16} />
                    {t("نسخ", "Duplicate")}
                  </SubmitButton>
                </form>
              ) : null}
              {canAct ? (
                <form action={archiveTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <SubmitButton
                    variant="secondary"
                    confirm={t("أرشفة المهمة؟ تختفي من اللوحة والقوائم والتنبيهات، ويمكن استعادتها من فلتر «المؤرشفة».", "Archive this task? It leaves the board, lists and alerts; restore it any time from the “Archived” filter.")}
                    pendingLabel={t("جارٍ الأرشفة...", "Archiving...")}
                  >
                    <Archive size={16} />
                    {t("أرشفة", "Archive")}
                  </SubmitButton>
                </form>
              ) : null}
              {allow.remove ? (
                <DeleteButton
                  action={deleteTask}
                  fields={{ id: task.id, returnTo: "/tasks" }}
                  variant="danger"
                  label={t("حذف", "Delete")}
                  confirm={t("حذف هذه المهمة نهائياً مع خطواتها وتعليقاتها؟ للإخفاء دون حذف استخدم «أرشفة».", "Delete this task for good, with its checklist and comments? To hide it without deleting, use “Archive”.")}
                />
              ) : null}
            </div>
          </div>

          {task.statusNote && (status === "ON_HOLD" || closed) ? (
            <div className={cn("mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ring-1 ring-inset", status === "ON_HOLD" ? "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200" : "bg-slate-50 text-slate-700 ring-slate-200")}>
              <span className="font-semibold">{status === "ON_HOLD" ? t("سبب التعليق: ", "On hold because: ") : t("ملاحظة الإغلاق: ", "Closing note: ")}</span>
              <span className="whitespace-pre-line break-words">{task.statusNote}</span>
            </div>
          ) : null}

          {canAct ? (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
                {QUICK_STATUSES.map(statusForm)}
                {reasonModal("ON_HOLD", pill(false, ""))}
                {reasonModal("CANCELLED", pill(false, ""))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="me-1 text-xs font-semibold text-slate-500">{t("الأولوية", "Priority")}</span>
                {TASK_PRIORITIES.map((option) => (
                  <form key={option} action={setTaskPriority}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="priority" value={option} />
                    <input type="hidden" name="returnTo" value={base} />
                    <button
                      disabled={option === priority}
                      aria-pressed={option === priority}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ring-1 ring-inset transition duration-200",
                        option === priority ? `${TASK_PRIORITY[option].solid} text-white ring-transparent` : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <Flag size={13} className={option === priority ? "text-white" : TASK_PRIORITY[option].flag} />
                      {pick(TASK_PRIORITY[option].label, lang)}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {task.description ? (
            <Card>
              <SectionTitle>{t("الوصف", "Description")}</SectionTitle>
              <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-700">{task.description}</p>
            </Card>
          ) : null}

          <Card id="checklist" className="scroll-mt-24">
            <SectionTitle
              hint={task.items.length ? t(`${done} من ${task.items.length} مكتملة`, `${done} of ${task.items.length} done`) : undefined}
              action={
                canAct ? (
                  <form action={suggestTaskItems}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <SubmitButton variant="secondary" pendingLabel={t("جارٍ الاقتراح...", "Suggesting...")}>
                      <Sparkles size={15} className="text-gold-600" />
                      {t("اقترح خطوات بالذكاء الاصطناعي", "Suggest steps with AI")}
                    </SubmitButton>
                  </form>
                ) : null
              }
            >
              <span className="inline-flex items-center gap-2">
                <ListChecks size={18} className="text-teal-700" />
                {t("خطوات التنفيذ", "Checklist")}
              </span>
            </SectionTitle>
            {task.items.length ? (
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${percent}%` }} />
              </div>
            ) : null}
            <ul className="space-y-1">
              {task.items.map((item) => (
                <li key={item.id} className="group flex items-start gap-2 rounded-xl px-1 py-1.5 hover:bg-slate-50">
                  {canAct ? (
                    <form action={toggleTaskItem}>
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
                  ) : (
                    <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", item.done ? "bg-teal-700 text-white ring-teal-700" : "ring-slate-300")}>
                      {item.done ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                  )}
                  <span className={cn("min-w-0 flex-1 break-words text-sm leading-6", item.done ? "text-slate-400 line-through" : "text-slate-800")}>{item.text}</span>
                  {canAct ? (
                    <form action={deleteTaskItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button aria-label={t("حذف الخطوة", "Delete step")} className="flex size-6 items-center justify-center rounded-md text-slate-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                        <X size={14} />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {task.items.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد خطوات بعد.", "No steps yet.")}</p> : null}
            {canAct ? (
              <form action={addTaskItem} className="mt-3 flex gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                <input name="text" required maxLength={200} placeholder={t("أضف خطوة…", "Add a step…")} className={`${fieldClass} min-w-0 flex-1`} />
                <SubmitButton variant="secondary">{t("إضافة", "Add")}</SubmitButton>
              </form>
            ) : null}
          </Card>

          <Card id="comments" className="scroll-mt-24">
            <SectionTitle hint={t("التعليقات وكل تغيير في الحالة والأولوية والأشخاص والمواعيد", "Comments and every change to status, priority, people and dates")}>
              <span className="inline-flex items-center gap-2">
                <MessageSquare size={18} className="text-teal-700" />
                {t("السجل والتعليقات", "History & comments")}
              </span>
            </SectionTitle>
            {hiddenEntries ? (
              <Link href={`${base}?log=all#comments`} className={`${linkAction} mb-3`}>
                {t(`عرض السجل كاملاً (${hiddenEntries} أقدم)`, `Show full history (${hiddenEntries} older)`)}
              </Link>
            ) : null}
            <TaskTimeline
              entries={hiddenEntries ? task.comments.slice(hiddenEntries) : task.comments}
              emptyText={t("لا توجد تعليقات بعد.", "No comments yet.")}
              action={(entry) =>
                allow.edit && entry.kind === "COMMENT" && (entry.userId === user.id || allow.remove) ? (
                  <DeleteButton action={deleteTaskComment} fields={{ id: entry.id }} confirm={t("حذف هذا التعليق؟", "Delete this comment?")} />
                ) : null
              }
            />
            {allow.edit ? (
              <form action={addTaskComment} className="mt-4 space-y-2">
                <input type="hidden" name="taskId" value={task.id} />
                <textarea name="body" required maxLength={3000} placeholder={t("اكتب تعليقاً أو تحديثاً عن سير المهمة…", "Write a comment or progress update…")} className={`${fieldClass} min-h-20 w-full`} />
                <SubmitButton>{t("إضافة تعليق", "Add comment")}</SubmitButton>
              </form>
            ) : null}
          </Card>
        </div>

        <aside className="min-w-0 space-y-4">
          <Card id="people" className="scroll-mt-24">
            <SectionTitle hint={t("المكلّفون ومن دُعي بالبريد لمتابعة المهمة", "Assignees and people invited by email")}>
              <span className="inline-flex items-center gap-2">
                <Users size={18} className="text-teal-700" />
                {t("الأشخاص", "People")}
              </span>
            </SectionTitle>
            {task.assignees.length === 0 ? <p className="mb-2 text-sm text-slate-500">{t("لم يُسند لأي موظف بعد.", "Not assigned yet.")}</p> : null}
            <ul className="space-y-1.5">
              {task.assignees.map(({ employee }) => (
                <li key={employee.id} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50">
                  <Link href={`/employees/${employee.id}?tab=tasks`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <EmployeeAvatar name={nameOf(employee)} photo={employee.photoUrl} className="size-8 rounded-full bg-teal-700 text-sm text-white" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{nameOf(employee)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {employee.employeeNumber}
                        {employee.jobTitle ? ` · ${lang === "en" && employee.jobTitleEn ? employee.jobTitleEn : employee.jobTitle}` : ""}
                      </span>
                    </span>
                  </Link>
                  {canAct ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {closed ? null : (
                        <Modal
                          size="sm"
                          title={t(`تحويل المهمة من ${nameOf(employee)}`, `Transfer the task from ${nameOf(employee)}`)}
                          triggerClassName="flex size-9 items-center justify-center rounded-xl text-teal-700 transition hover:bg-teal-50"
                          label={<ArrowLeftRight size={16} aria-label={t("تحويل", "Transfer")} />}
                        >
                          <form action={transferTask} className="min-h-96 space-y-4 text-start">
                            <input type="hidden" name="id" value={task.id} />
                            <input type="hidden" name="fromId" value={employee.id} />
                            <p className="text-sm leading-6 text-slate-600">
                              {t(`تنتقل المهمة من «${nameOf(employee)}» إلى الموظف الذي تختاره، ويُسجَّل التحويل في سجل المهمة.`, `The task moves from “${nameOf(employee)}” to the employee you choose, and the transfer is recorded in the task history.`)}
                            </p>
                            <div className="min-w-0 space-y-1.5">
                              <span className="block text-sm font-medium text-slate-700">{t("حوّل إلى *", "Transfer to *")}</span>
                              <SearchSelect name="toId" options={others} placeholder={t("ابحث عن موظف…", "Search for an employee…")} ariaLabel={t("حوّل إلى", "Transfer to")} />
                            </div>
                            <Field label={t("ملاحظة للتسليم (اختياري)", "Handover note (optional)")}>
                              <textarea name="note" maxLength={500} className={`${fieldClass} min-h-16 w-full`} />
                            </Field>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input type="checkbox" name="notify" value="1" defaultChecked className="size-4 accent-teal-700" />
                              {t("أرسل له رابط المهمة على بريده", "Send them the task link by email")}
                            </label>
                            <SubmitButton pendingLabel={t("جارٍ التحويل...", "Transferring...")}>
                              <ArrowLeftRight size={16} />
                              {t("تحويل المهمة", "Transfer task")}
                            </SubmitButton>
                          </form>
                        </Modal>
                      )}
                      <form action={removeTaskAssignee}>
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <SubmitButton
                          variant="link"
                          className="flex size-9 items-center justify-center rounded-xl hover:bg-red-50"
                          confirm={t(`إزالة ${nameOf(employee)} من المهمة؟`, `Remove ${nameOf(employee)} from the task?`)}
                          pendingLabel="…"
                        >
                          <X size={16} aria-label={t("إزالة", "Remove")} />
                        </SubmitButton>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {canAct ? (
              <div className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                <Modal
                  size="sm"
                  title={t("إضافة موظف إلى المهمة", "Add an employee to the task")}
                  triggerClassName={`${secondaryBtn} w-full`}
                  label={
                    <>
                      <UserPlus size={16} />
                      {t("إضافة موظف", "Add employee")}
                    </>
                  }
                >
                  <form action={addTaskAssignee} className="flex min-h-80 flex-col gap-4 text-start">
                    <input type="hidden" name="id" value={task.id} />
                    <div className="min-w-0 space-y-1.5">
                      <span className="block text-sm font-medium text-slate-700">{t("الموظف *", "Employee *")}</span>
                      <SearchSelect name="employeeId" options={others} placeholder={t("ابحث عن موظف…", "Search for an employee…")} ariaLabel={t("الموظف", "Employee")} />
                    </div>
                    <label className="mt-auto flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="notify" value="1" defaultChecked className="size-4 accent-teal-700" />
                      {t("أرسل له رابط المهمة على بريده", "Send them the task link by email")}
                    </label>
                    <SubmitButton className="self-start" pendingLabel={t("جارٍ الإضافة...", "Adding...")}>
                      <UserPlus size={16} />
                      {t("إضافة", "Add")}
                    </SubmitButton>
                  </form>
                </Modal>
                <Modal
                  size="sm"
                  title={t("دعوة شخص بالبريد الإلكتروني", "Invite someone by email")}
                  triggerClassName={`${primaryBtn} w-full`}
                  label={
                    <>
                      <Mail size={16} />
                      {t("دعوة بالبريد", "Invite by email")}
                    </>
                  }
                >
                  <form action={inviteToTask} className="space-y-4 text-start">
                    <input type="hidden" name="id" value={task.id} />
                    <p className="text-sm leading-6 text-slate-600">
                      {t(
                        "موظف أو أي شخص من خارج النظام. يصله رابط يفتح المهمة دون حساب: يرى التفاصيل، ويحدّث الحالة، ويؤشّر الخطوات، ويعلّق. إن كان البريد لموظف في الشركة يُضاف مكلّفاً.",
                        "An employee or anyone outside the system. They get a link that opens the task with no account: they can view it, update the status, tick steps and comment. An employee's email also assigns them.",
                      )}
                    </p>
                    <Field label={t("البريد الإلكتروني *", "Email *")}>
                      <input type="email" name="email" required maxLength={160} dir="ltr" className={`${fieldClass} w-full`} placeholder="name@example.com" />
                    </Field>
                    <Field label={t("الاسم (اختياري)", "Name (optional)")}>
                      <input name="name" maxLength={120} className={`${fieldClass} w-full`} />
                    </Field>
                    <Field label={t("رسالة مع الدعوة (اختياري)", "Message (optional)")}>
                      <textarea name="note" maxLength={500} className={`${fieldClass} min-h-16 w-full`} />
                    </Field>
                    {emailReady ? null : (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-inset ring-amber-200">
                        {t("الإرسال الآلي بالبريد غير مفعّل بعد؛ بعد الدعوة أرسل الرابط من قائمة «المدعوّون بالبريد» ببريدك أو واتساب.", "Automatic email isn't set up yet; after inviting, send the link from “Invited by email” with your own mail or WhatsApp.")}
                      </p>
                    )}
                    <SubmitButton pendingLabel={t("جارٍ الدعوة...", "Inviting...")}>
                      <Send size={16} />
                      {t("إرسال الدعوة", "Send invite")}
                    </SubmitButton>
                  </form>
                </Modal>
              </div>
            ) : null}

            {task.invites.length ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-sm font-bold text-slate-900">{t("المدعوّون بالبريد", "Invited by email")}</h3>
                <ul className="space-y-2">
                  {task.invites.map((invite) => {
                    const state = INVITE_STATE[invite.emailStatus] || INVITE_STATE.PENDING;
                    const url = taskInviteUrl(origin, invite.token);
                    return (
                      <li key={invite.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            {invite.name ? <p className="truncate text-sm font-semibold text-slate-900">{invite.name}</p> : null}
                            <p className="truncate text-xs text-slate-600" dir="ltr">
                              {invite.email}
                            </p>
                          </div>
                          <ToneBadge tone={state.tone}>{pick(state.label, lang)}</ToneBadge>
                        </div>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Eye size={13} />
                          {invite.lastSeenAt ? t(`فتح الرابط ${formatDateTime(invite.lastSeenAt)}`, `Opened ${formatDateTime(invite.lastSeenAt)}`) : t("لم يفتح الرابط بعد", "Hasn't opened the link yet")}
                        </p>
                        {canAct ? (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <details className="group w-full">
                              <summary className={`${linkAction} cursor-pointer list-none`}>{t("مشاركة الرابط", "Share the link")}</summary>
                              <div className="mt-2">
                                <InviteLink
                                  url={url}
                                  email={invite.email}
                                  company={company}
                                  subject={taskInviteSubject(task.title)}
                                  message={taskInviteMessage({ name: invite.name, inviterName: invite.invitedByName || user.name, companyName: company, title: task.title, priority: task.priority, dueDate: task.dueDate, url })}
                                />
                              </div>
                            </details>
                            {emailReady ? (
                              <form action={resendTaskInvite}>
                                <input type="hidden" name="id" value={invite.id} />
                                <button className={linkAction}>{t("إعادة الإرسال", "Resend")}</button>
                              </form>
                            ) : null}
                            <DeleteButton action={revokeTaskInvite} fields={{ id: invite.id }} label={t("إلغاء الدعوة", "Revoke")} confirm={t(`إلغاء دعوة ${invite.email}؟ يتوقف رابطه عن العمل فوراً.`, `Revoke ${invite.email}'s invite? Their link stops working at once.`)} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{t("التفاصيل", "Details")}</SectionTitle>
            <dl className="grid gap-2">
              <InfoItem label={t("تاريخ البداية", "Start date")} value={formatDate(task.startDate)} />
              <InfoItem label={t("تاريخ الاستحقاق", "Due date")} value={formatDate(task.dueDate)} />
              {task.postponeCount ? <InfoItem label={t("مرات التأجيل", "Times postponed")} value={task.postponeCount} /> : null}
              {task.completedAt ? <InfoItem label={status === "CANCELLED" ? t("تاريخ الإغلاق", "Closed") : t("تاريخ الإنجاز", "Completed")} value={formatDate(task.completedAt)} /> : null}
              {task.archivedAt ? <InfoItem label={t("تاريخ الأرشفة", "Archived")} value={formatDate(task.archivedAt)} /> : null}
              <InfoItem label={t("أنشأها", "Created by")} value={`${task.createdByName || "—"} · ${formatDate(task.createdAt)}`} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
