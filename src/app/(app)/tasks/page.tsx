import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlarmClock, Archive, CheckCircle2, Flag, KanbanSquare, List, ListTodo, Plus, Search } from "lucide-react";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { Modal } from "@/components/modal";
import { TaskBoard } from "@/components/task-board";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { Card, EmptyState, PageHeader, Stat, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { employeeOptions, loadBoardTasks } from "@/lib/task-data";
import { ACTIVE_STATUSES, CLOSED_STATUSES, TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, TASK_STATUSES, isTaskPriority, isTaskStatus } from "@/lib/tasks";
import { createTask } from "@/server/task-actions";

const DONE_WINDOW_DAYS = 30;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; employeeId?: string; priority?: string; status?: string; due?: string; done?: string; archived?: string; new?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("tasks.view");
  const { lang, t } = await getI18n();
  const allow = { create: can(user, "tasks.create"), edit: can(user, "tasks.edit") };
  const archived = sp.archived === "1";
  const status = isTaskStatus(sp.status || "") ? sp.status! : "";
  const view = sp.view === "list" || archived || status === "CANCELLED" ? "list" : "board";
  const q = (sp.q || "").trim().slice(0, 100);
  const priority = isTaskPriority(sp.priority || "") ? sp.priority! : "";
  const due = ["overdue", "today", "week", "none"].includes(sp.due || "") ? sp.due! : "";
  const allDone = sp.done === "all";

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const tomorrow = new Date(today.getTime() + 86400000);
  const weekEnd = new Date(today.getTime() + 8 * 86400000);
  const doneSince = new Date(now.getTime() - DONE_WINDOW_DAYS * 86400000);

  const filters: Prisma.TaskWhereInput[] = [{ companyId: user.companyId, archivedAt: archived ? { not: null } : null }];
  if (q) filters.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  if (sp.employeeId) filters.push({ assignees: { some: { employeeId: sp.employeeId } } });
  if (priority) filters.push({ priority });
  if (status) filters.push({ status });
  if (due === "overdue") filters.push({ dueDate: { lt: today }, status: { in: ACTIVE_STATUSES } });
  if (due === "today") filters.push({ dueDate: { gte: today, lt: tomorrow } });
  if (due === "week") filters.push({ dueDate: { gte: today, lt: weekEnd } });
  if (due === "none") filters.push({ dueDate: null });
  if (!allDone && !archived) filters.push({ OR: [{ status: { notIn: CLOSED_STATUSES } }, { completedAt: { gte: doneSince } }, { completedAt: null }] });

  const [tasks, employees, counts] = await Promise.all([
    loadBoardTasks({ AND: filters }, lang),
    employeeOptions(user.companyId, lang),
    Promise.all([
      prisma.task.count({ where: { companyId: user.companyId, archivedAt: null, status: { notIn: CLOSED_STATUSES } } }),
      prisma.task.count({ where: { companyId: user.companyId, archivedAt: null, status: { in: ACTIVE_STATUSES }, dueDate: { lt: today } } }),
      prisma.task.count({ where: { companyId: user.companyId, archivedAt: null, status: { in: ACTIVE_STATUSES }, dueDate: { gte: today, lt: weekEnd } } }),
      prisma.task.count({ where: { companyId: user.companyId, status: "DONE", completedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
      prisma.task.count({ where: { companyId: user.companyId, archivedAt: { not: null } } }),
    ]),
  ]);
  const [openCount, overdueCount, weekCount, doneMonth, archivedCount] = counts;
  const boardTasks = tasks.map(({ dueDate: _dueDate, createdAt: _createdAt, ...task }) => task);
  const hasAny = openCount > 0 || doneMonth > 0 || archivedCount > 0 || tasks.length > 0;
  const filtered = Boolean(q || sp.employeeId || priority || status || due);

  const params = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const base: Record<string, string> = { view, q, employeeId: sp.employeeId || "", priority, status, due, done: allDone ? "all" : "", archived: archived ? "1" : "" };
    for (const [key, value] of Object.entries({ ...base, ...patch })) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/tasks?${query}` : "/tasks";
  };
  const returnTo = params({});

  return (
    <div className="page-wide">
      <PageHeader
        icon={ListTodo}
        title={t("المهام", "Tasks")}
        description={t(
          "أسند المهام للموظفين وتابعها من «للتنفيذ» حتى «مكتملة».",
          "Assign tasks to employees and track them from To do to Done.",
        )}
      >
        {allow.create ? (
          <Modal
            title={t("مهمة جديدة", "New task")}
            triggerClassName={primaryBtn}
            defaultOpen={sp.new === "1"}
            label={
              <>
                <Plus size={17} />
                {t("مهمة جديدة", "New task")}
              </>
            }
          >
            <TaskForm action={createTask} employees={employees} returnTo={returnTo} submitLabel={t("إضافة المهمة", "Add task")} />
          </Modal>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={ListTodo} tone="teal" label={t("مهام مفتوحة", "Open tasks")} value={String(openCount)} href={params({ due: null, priority: null })} />
        <Stat
          icon={AlarmClock}
          tone="red"
          label={t("متأخرة", "Overdue")}
          value={String(overdueCount)}
          emphasis={overdueCount ? "red" : undefined}
          href={params({ due: "overdue" })}
        />
        <Stat icon={Flag} tone="amber" label={t("تستحق خلال أسبوع", "Due this week")} value={String(weekCount)} href={params({ due: "week" })} />
        <Stat icon={CheckCircle2} tone="aqua" label={t("أُنجزت هذا الشهر", "Done this month")} value={String(doneMonth)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <GetForm className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <input type="hidden" name="view" value={view} />
          {allDone ? <input type="hidden" name="done" value="all" /> : null}
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          <label className="col-span-2 min-w-0 space-y-1.5 text-xs font-medium text-slate-500 sm:w-56">
            {t("بحث", "Search")}
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input name="q" defaultValue={q} placeholder={t("عنوان أو وصف المهمة", "Task title or description")} className={`${fieldClass} block w-full ps-9`} />
            </span>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الموظف", "Employee")}
            <select name="employeeId" defaultValue={sp.employeeId || ""} className={`${fieldClass} block w-full sm:w-48`}>
              <option value="">{t("الكل", "All")}</option>
              {employees.map((employee) => (
                <option key={employee.value} value={employee.value}>
                  {employee.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الأولوية", "Priority")}
            <select name="priority" defaultValue={priority} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("الكل", "All")}</option>
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {pick(TASK_PRIORITY[value].label, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الحالة", "Status")}
            <select name="status" defaultValue={status} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("الكل", "All")}</option>
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {pick(TASK_STATUS[value].label, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الاستحقاق", "Due")}
            <select name="due" defaultValue={due} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("أي وقت", "Any time")}</option>
              <option value="overdue">{t("متأخرة", "Overdue")}</option>
              <option value="today">{t("اليوم", "Today")}</option>
              <option value="week">{t("خلال أسبوع", "Within a week")}</option>
              <option value="none">{t("بلا تاريخ", "No date")}</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className={secondaryBtn}>{t("تطبيق", "Apply")}</button>
            {filtered ? (
              <Link href={params({ q: null, employeeId: null, priority: null, status: null, due: null })} className="self-center text-sm font-semibold text-slate-500 hover:text-teal-800">
                {t("مسح", "Clear")}
              </Link>
            ) : null}
          </div>
        </GetForm>
        <nav className="segmented self-start lg:self-end" aria-label={t("طريقة العرض", "View")}>
          <Link href={params({ view: "board", archived: null, status: status === "CANCELLED" ? null : status })} aria-current={view === "board" ? "page" : undefined}>
            <KanbanSquare size={16} />
            {t("لوحة", "Board")}
          </Link>
          <Link href={params({ view: "list" })} aria-current={view === "list" ? "page" : undefined}>
            <List size={16} />
            {t("قائمة", "List")}
          </Link>
        </nav>
      </div>

      {!hasAny ? (
        <EmptyState
          icon={ListTodo}
          title={t("لا توجد مهام بعد", "No tasks yet")}
          text={t("أنشئ أول مهمة وأسندها لموظف أو أكثر، ثم تابع تقدّمها على اللوحة.", "Create the first task, assign it to one or more employees and follow it on the board.")}
        >
          {allow.create ? (
            <Link href="/tasks?new=1" className={primaryBtn}>
              <Plus size={17} />
              {t("مهمة جديدة", "New task")}
            </Link>
          ) : null}
        </EmptyState>
      ) : view === "board" ? (
        <TaskBoard tasks={boardTasks} canEdit={allow.edit} />
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TaskList tasks={boardTasks} lang={lang} emptyText={t("لا توجد مهام تطابق البحث.", "No tasks match the filters.")} />
        </Card>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        {archived ? (
          <Link href={params({ archived: null })} className="inline-flex items-center gap-1.5 font-semibold text-teal-800 hover:underline">
            <Archive size={14} />
            {t("رجوع إلى المهام الحالية", "Back to current tasks")}
          </Link>
        ) : archivedCount ? (
          <Link href={params({ archived: "1", view: "list" })} className="inline-flex items-center gap-1.5 font-semibold text-teal-800 hover:underline">
            <Archive size={14} />
            {t(`المؤرشفة (${archivedCount})`, `Archived (${archivedCount})`)}
          </Link>
        ) : null}
        {archived ? null : allDone ? (
          <Link href={params({ done: null })} className="font-semibold text-teal-800 hover:underline">
            {t(`إخفاء المهام المكتملة قبل أكثر من ${DONE_WINDOW_DAYS} يوماً`, `Hide tasks completed more than ${DONE_WINDOW_DAYS} days ago`)}
          </Link>
        ) : (
          <span>
            {t(`تظهر المهام المكتملة والمغلقة خلال آخر ${DONE_WINDOW_DAYS} يوماً. `, `Showing tasks completed or closed in the last ${DONE_WINDOW_DAYS} days. `)}
            <Link href={params({ done: "all" })} className="font-semibold text-teal-800 hover:underline">
              {t("عرض الكل", "Show all")}
            </Link>
          </span>
        )}
      </p>
    </div>
  );
}
