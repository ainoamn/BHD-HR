import Link from "next/link";
import { Flag } from "lucide-react";
import { pick, type Lang } from "@/lib/i18n";
import { TASK_PRIORITY, TASK_STATUS, TASK_STATUSES } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Avatars, type BoardTask } from "./task-board";
import { ToneBadge } from "./ui";

/** Tasks grouped by status, one row each. */
export function TaskList({ tasks, lang, emptyText }: { tasks: BoardTask[]; lang: Lang; emptyText: string }) {
  const stepsWord = lang === "en" ? "steps" : "خطوات";
  if (!tasks.length) return <p className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6">{emptyText}</p>;
  return (
    <>
      {TASK_STATUSES.map((status) => {
        const rows = tasks.filter((task) => task.status === status);
        if (!rows.length) return null;
        return (
          <section key={status} className="border-b border-slate-100 last:border-b-0">
            <h2 className="flex items-center gap-2 bg-slate-50/80 px-4 py-2.5 text-sm font-bold text-slate-800 sm:px-6">
              <span className={cn("size-2.5 rounded-full", TASK_STATUS[status].dot)} />
              {pick(TASK_STATUS[status].label, lang)}
              <span className="tabular text-xs font-semibold text-slate-500">({rows.length})</span>
            </h2>
            <ul className="divide-y divide-slate-100">
              {rows.map((task) => (
                <li key={task.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Flag size={14} className={cn("mt-1 shrink-0", TASK_PRIORITY[task.priority].flag)} />
                    <Link href={`/tasks/${task.id}`} className={cn("min-w-0 break-words font-semibold text-slate-900 hover:text-teal-800", status === "DONE" && "text-slate-500 line-through")}>
                      {task.title}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 ps-6 text-xs text-slate-500 sm:ps-0">
                    <ToneBadge tone={TASK_PRIORITY[task.priority].tone}>{pick(TASK_PRIORITY[task.priority].label, lang)}</ToneBadge>
                    {task.due ? <ToneBadge tone={task.due.tone}>{task.due.label}</ToneBadge> : null}
                    {task.items.total ? (
                      <span className="tabular">
                        {task.items.done}/{task.items.total} {stepsWord}
                      </span>
                    ) : null}
                    <Avatars people={task.assignees} max={4} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
