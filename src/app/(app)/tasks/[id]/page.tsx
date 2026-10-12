import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Flag, ListChecks, MessageSquare, Pencil, Sparkles, X } from "lucide-react";
import { Flash } from "@/components/flash";
import { Modal } from "@/components/modal";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { TaskForm } from "@/components/task-form";
import { Card, InfoItem, SectionTitle, ToneBadge, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { employeeOptions } from "@/lib/task-data";
import { TASK_PRIORITY, TASK_STATUS, TASK_STATUSES, dueInfo, isTaskPriority, isTaskStatus } from "@/lib/tasks";
import { cn, formatDate, formatDateTime, toDateInput } from "@/lib/utils";
import {
  addTaskComment,
  addTaskItem,
  deleteTask,
  deleteTaskComment,
  deleteTaskItem,
  setTaskStatus,
  suggestTaskItems,
  toggleTaskItem,
  updateTask,
} from "@/server/task-actions";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("tasks.view");
  const { lang, t } = await getI18n();
  const task = await prisma.task.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      assignees: { include: { employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true, jobTitle: true, jobTitleEn: true } } } },
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) notFound();
  const allow = { edit: can(user, "tasks.edit"), remove: can(user, "tasks.delete") };
  const status = isTaskStatus(task.status) ? task.status : "TODO";
  const priority = isTaskPriority(task.priority) ? task.priority : "NORMAL";
  const due = dueInfo(task.dueDate, status, lang);
  const done = task.items.filter((item) => item.done).length;
  const percent = task.items.length ? Math.round((done / task.items.length) * 100) : 0;
  const base = `/tasks/${task.id}`;
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const employees = allow.edit ? await employeeOptions(user.companyId, lang) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل المهام", "All tasks")}
      </Link>

      <section className="animate-fade-up rounded-3xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ToneBadge tone={TASK_STATUS[status].tone}>{pick(TASK_STATUS[status].label, lang)}</ToneBadge>
              <ToneBadge tone={TASK_PRIORITY[priority].tone}>
                <Flag size={12} /> {pick(TASK_PRIORITY[priority].label, lang)}
              </ToneBadge>
              {due ? <ToneBadge tone={due.tone}>{due.label}</ToneBadge> : null}
            </div>
            <h1 className={cn("break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl", status === "DONE" && "text-slate-500 line-through")}>{task.title}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {allow.edit ? (
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
            {allow.remove ? (
              <DeleteButton
                action={deleteTask}
                fields={{ id: task.id, returnTo: "/tasks" }}
                variant="danger"
                label={t("حذف", "Delete")}
                confirm={t("حذف هذه المهمة مع خطواتها وتعليقاتها؟", "Delete this task with its checklist and comments?")}
              />
            ) : null}
          </div>
        </div>
        {allow.edit ? (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:flex sm:flex-wrap">
            {TASK_STATUSES.map((option) => (
              <form key={option} action={setTaskStatus}>
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="status" value={option} />
                <input type="hidden" name="returnTo" value={base} />
                <button
                  disabled={option === status}
                  aria-pressed={option === status}
                  className={cn(
                    "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition",
                    option === status ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span className={cn("size-2 rounded-full", option === status ? "bg-white" : TASK_STATUS[option].dot)} />
                  {pick(TASK_STATUS[option].label, lang)}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </section>

      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                allow.edit ? (
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
                  {allow.edit ? (
                    <form action={toggleTaskItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        aria-label={item.done ? t("إلغاء الإنجاز", "Mark not done") : t("تم", "Mark done")}
                        className={cn(
                          "mt-0.5 flex size-5 items-center justify-center rounded-md ring-1 ring-inset transition",
                          item.done ? "bg-teal-700 text-white ring-teal-700" : "bg-white ring-slate-300 hover:ring-teal-600",
                        )}
                      >
                        {item.done ? <Check size={13} strokeWidth={3} /> : null}
                      </button>
                    </form>
                  ) : (
                    <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-md ring-1 ring-inset", item.done ? "bg-teal-700 text-white ring-teal-700" : "ring-slate-300")}>
                      {item.done ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                  )}
                  <span className={cn("min-w-0 flex-1 break-words text-sm leading-6", item.done ? "text-slate-400 line-through" : "text-slate-800")}>{item.text}</span>
                  {allow.edit ? (
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
            {allow.edit ? (
              <form action={addTaskItem} className="mt-3 flex gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                <input name="text" required maxLength={200} placeholder={t("أضف خطوة…", "Add a step…")} className={`${fieldClass} min-w-0 flex-1`} />
                <SubmitButton variant="secondary">{t("إضافة", "Add")}</SubmitButton>
              </form>
            ) : null}
          </Card>

          <Card id="comments" className="scroll-mt-24">
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <MessageSquare size={18} className="text-teal-700" />
                {t("التعليقات والمتابعة", "Comments & updates")}
              </span>
            </SectionTitle>
            <ol className="space-y-3">
              {task.comments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{comment.authorName.trim().slice(0, 1)}</span>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{comment.authorName}</p>
                      <div className="flex items-center gap-3">
                        <time className="tabular text-xs text-slate-500">{formatDateTime(comment.createdAt)}</time>
                        {allow.edit && (comment.userId === user.id || allow.remove) ? (
                          <DeleteButton action={deleteTaskComment} fields={{ id: comment.id }} confirm={t("حذف هذا التعليق؟", "Delete this comment?")} />
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{comment.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {task.comments.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد تعليقات بعد.", "No comments yet.")}</p> : null}
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
          <Card>
            <SectionTitle>{t("المكلّفون", "Assigned to")}</SectionTitle>
            {task.assignees.length === 0 ? <p className="text-sm text-slate-500">{t("لم يُسند لأي موظف بعد.", "Not assigned yet.")}</p> : null}
            <ul className="space-y-2">
              {task.assignees.map(({ employee }) => (
                <li key={employee.id}>
                  <Link href={`/employees/${employee.id}?tab=tasks`} className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-slate-50">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{nameOf(employee).trim().slice(0, 1)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{nameOf(employee)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {employee.employeeNumber}
                        {employee.jobTitle ? ` · ${lang === "en" && employee.jobTitleEn ? employee.jobTitleEn : employee.jobTitle}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>{t("التفاصيل", "Details")}</SectionTitle>
            <dl className="grid gap-2">
              <InfoItem label={t("تاريخ البداية", "Start date")} value={formatDate(task.startDate)} />
              <InfoItem label={t("تاريخ الاستحقاق", "Due date")} value={formatDate(task.dueDate)} />
              {task.completedAt ? <InfoItem label={t("تاريخ الإنجاز", "Completed")} value={formatDate(task.completedAt)} /> : null}
              <InfoItem label={t("أنشأها", "Created by")} value={`${task.createdByName || "—"} · ${formatDate(task.createdAt)}`} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
