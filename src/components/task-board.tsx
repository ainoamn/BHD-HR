"use client";

import Link from "next/link";
import { Flag, ListChecks, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { pick } from "@/lib/i18n";
import { TASK_PRIORITY, TASK_STATUS, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { moveTask } from "@/server/task-actions";
import { useLang } from "./lang-provider";

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: { label: string; tone: string } | null;
  assignees: { id: string; name: string }[];
  items: { done: number; total: number };
  comments: number;
};

const AVATAR_TONES = ["bg-teal-700", "bg-navy-500", "bg-gold-600", "bg-aqua-700", "bg-ink-700", "bg-emerald-600"];

export function Avatars({ people, max = 3 }: { people: { id: string; name: string }[]; max?: number }) {
  if (!people.length) return null;
  const tone = (id: string) => AVATAR_TONES[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className="flex -space-x-1.5 rtl:space-x-reverse">
      {people.slice(0, max).map((person) => (
        <span
          key={person.id}
          title={person.name}
          className={cn("flex size-6 items-center justify-center rounded-full text-[0.68rem] font-bold text-white ring-2 ring-surface", tone(person.id))}
        >
          {person.name.trim().slice(0, 1)}
        </span>
      ))}
      {people.length > max ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-200 text-[0.65rem] font-bold text-slate-700 ring-2 ring-surface">+{people.length - max}</span>
      ) : null}
    </span>
  );
}

const dueTone: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function TaskBoard({ tasks, canEdit }: { tasks: BoardTask[]; canEdit: boolean }) {
  const { lang, t } = useLang();
  const [board, setBoard] = useState(tasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const columns = useRef<Partial<Record<TaskStatus, HTMLDivElement | null>>>({});

  useEffect(() => setBoard(tasks), [tasks]);

  const move = (id: string, status: TaskStatus, index: number) => {
    const before = board;
    const task = board.find((item) => item.id === id);
    if (!task) return;
    const rest = board.filter((item) => item.id !== id);
    const column = rest.filter((item) => item.status === status);
    const clamped = Math.max(0, Math.min(index, column.length));
    const nextColumn = [...column.slice(0, clamped), { ...task, status }, ...column.slice(clamped)];
    const next = [...rest.filter((item) => item.status !== status), ...nextColumn];
    if (task.status === status && before.filter((item) => item.status === status).findIndex((item) => item.id === id) === clamped) return;
    setBoard(next);
    setError(null);
    startTransition(async () => {
      const result = await moveTask(
        id,
        status,
        nextColumn.map((item) => item.id),
      );
      if (result.error) {
        setBoard(before);
        setError(result.error);
      }
    });
  };

  const indexAt = (status: TaskStatus, clientY: number) => {
    const cards = [...(columns.current[status]?.querySelectorAll<HTMLElement>("[data-card]") || [])].filter((card) => card.dataset.card !== dragging);
    const found = cards.findIndex((card) => {
      const box = card.getBoundingClientRect();
      return clientY < box.top + box.height / 2;
    });
    return found === -1 ? cards.length : found;
  };

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <div className="thin-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {TASK_STATUSES.map((status) => {
          const meta = TASK_STATUS[status];
          const items = board.filter((task) => task.status === status);
          return (
            <section
              key={status}
              aria-label={pick(meta.label, lang)}
              className={cn(
                "flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl p-2.5 ring-1 ring-inset ring-slate-200/70 transition sm:w-72 lg:w-auto lg:max-w-none",
                meta.column,
                over?.status === status && dragging && "ring-2 ring-teal-500/60",
              )}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const index = indexAt(status, event.clientY);
                if (over?.status !== status || over.index !== index) setOver({ status, index });
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) move(dragging, status, indexAt(status, event.clientY));
                setDragging(null);
                setOver(null);
              }}
            >
              <header className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <span className={cn("size-2.5 rounded-full", meta.dot)} />
                  {pick(meta.label, lang)}
                </h2>
                <span className="tabular rounded-full bg-surface/80 px-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-200">{items.length}</span>
              </header>
              <div ref={(node) => void (columns.current[status] = node)} className="flex min-h-24 flex-1 flex-col gap-2">
                {items.map((task, index) => (
                  <div key={task.id}>
                    {over?.status === status && over.index === index && dragging && dragging !== task.id ? <div className="mb-2 h-1 rounded-full bg-teal-500" /> : null}
                    <article
                      data-card={task.id}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", task.id);
                        setDragging(task.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className={cn(
                        "group rounded-xl border border-slate-200/90 bg-surface p-3 shadow-card transition hover:border-slate-300 hover:shadow-raised",
                        canEdit && "cursor-grab active:cursor-grabbing",
                        dragging === task.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Flag size={14} className={cn("mt-0.5 shrink-0", TASK_PRIORITY[task.priority].flag)} aria-label={pick(TASK_PRIORITY[task.priority].label, lang)} />
                        <Link
                          href={`/tasks/${task.id}`}
                          draggable={false}
                          className={cn("line-clamp-3 min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-900 hover:text-teal-800", task.status === "DONE" && "text-slate-500 line-through")}
                        >
                          {task.title}
                        </Link>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {task.due ? <span className={cn("rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset", dueTone[task.due.tone] || dueTone.slate)}>{task.due.label}</span> : null}
                          {task.items.total ? (
                            <span className={cn("inline-flex items-center gap-1", task.items.done === task.items.total && "text-emerald-700")}>
                              <ListChecks size={13} />
                              <span className="tabular">
                                {task.items.done}/{task.items.total}
                              </span>
                            </span>
                          ) : null}
                          {task.comments ? (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare size={13} />
                              <span className="tabular">{task.comments}</span>
                            </span>
                          ) : null}
                        </div>
                        <Avatars people={task.assignees} />
                      </div>
                      {canEdit ? (
                        <select
                          aria-label={t("نقل إلى", "Move to")}
                          className="mt-2.5 hidden w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700 pointer-coarse:block"
                          value={task.status}
                          onChange={(event) => move(task.id, event.target.value as TaskStatus, 0)}
                        >
                          {TASK_STATUSES.map((option) => (
                            <option key={option} value={option}>
                              {t("نقل إلى: ", "Move to: ")}
                              {pick(TASK_STATUS[option].label, lang)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </article>
                  </div>
                ))}
                {over?.status === status && over.index >= items.filter((task) => task.id !== dragging).length && dragging ? <div className="h-1 rounded-full bg-teal-500" /> : null}
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">{canEdit ? t("اسحب مهمة إلى هنا", "Drag a task here") : t("لا توجد مهام", "No tasks")}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
