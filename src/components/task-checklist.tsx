"use client";

import { AtSign, Check, MessageSquare, X } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { toast } from "./action-form";
import { Tr } from "./ai-translate";
import { CommentComposer, type Member } from "./comment-composer";
import { useLang } from "./lang-provider";
import { MentionText } from "./mention-text";
import { fieldClass, secondaryBtn } from "./ui";

type Item = { id: string; text: string; done: boolean };
type Action = (formData: FormData) => Promise<ActionResult>;
type Change = { type: "toggle" | "remove"; id: string } | { type: "add"; item: Item };

/** A comment on one step, already formatted on the server. */
export type StepComment = { id: string; authorName: string; body: string; when: string; names: string[]; mine: boolean };

const formOf = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

/** Steps tick, appear and disappear the moment they are clicked; the server catches up behind them. Each step has its own comments. */
export function TaskChecklist({
  items,
  fields,
  toggle,
  add,
  remove,
  emptyText,
  threads = {},
  discuss,
}: {
  items: Item[];
  /** Hidden fields every call carries: the task id for staff, the invite token for guests. */
  fields: Record<string, string>;
  toggle?: Action;
  add?: Action;
  remove?: Action;
  emptyText: string;
  threads?: Record<string, StepComment[]>;
  /** Commenting on a step; left out where comments can't be written. */
  discuss?: { action: Action; fields: Record<string, string>; members: Member[]; authorName: string };
}) {
  const { t } = useLang();
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, change] = useOptimistic(items, (current: Item[], next: Change) => {
    if (next.type === "add") return [...current, next.item];
    if (next.type === "remove") return current.filter((item) => item.id !== next.id);
    return current.map((item) => (item.id === next.id ? { ...item, done: !item.done } : item));
  });
  const run = (next: Change, action: Action, data: FormData) =>
    startTransition(async () => {
      change(next);
      toast(await action(data), { quiet: true });
    });
  const done = list.filter((item) => item.done).length;
  const percent = list.length ? Math.round((done / list.length) * 100) : 0;

  useEffect(() => {
    const follow = () => {
      const id = window.location.hash.startsWith("#step-") ? window.location.hash.slice(6) : "";
      if (id) setOpenId(id);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  return (
    <>
      {list.length ? (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-teal-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <span className="tabular shrink-0 text-xs font-semibold text-slate-500">
            {done}/{list.length}
          </span>
        </div>
      ) : null}
      <ul className="space-y-1">
        {list.map((item) => {
          const temporary = item.id.startsWith("tmp-");
          const comments = threads[item.id] || [];
          const open = openId === item.id;
          const canTalk = !temporary && (discuss || comments.length);
          return (
            <li key={item.id} id={`step-${item.id}`} className={cn("group scroll-mt-24 rounded-xl px-1 py-1.5", open ? "bg-slate-50" : "hover:bg-slate-50", temporary && "opacity-60")}>
              <div className="flex items-start gap-2">
                {toggle ? (
                  <button
                    type="button"
                    disabled={temporary}
                    onClick={() => run({ type: "toggle", id: item.id }, toggle, formOf({ ...fields, id: item.id }))}
                    aria-label={item.done ? t("إلغاء الإنجاز", "Mark not done") : t("تم", "Mark done")}
                    aria-pressed={item.done}
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition duration-150",
                      item.done ? "bg-teal-700 text-white ring-teal-700" : "bg-surface ring-slate-300 hover:ring-teal-600",
                    )}
                  >
                    {item.done ? <Check size={13} strokeWidth={3} /> : null}
                  </button>
                ) : (
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", item.done ? "bg-teal-700 text-white ring-teal-700" : "ring-slate-300")}>
                    {item.done ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 break-words text-sm leading-6 transition-colors duration-150", item.done ? "text-slate-400 line-through" : "text-slate-800")}>{temporary ? item.text : <Tr text={item.text} />}</span>
                {canTalk ? (
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                    aria-label={t(`تعليقات الخطوة (${comments.length})`, `Step comments (${comments.length})`)}
                    title={t("تعليقات على هذه الخطوة", "Comments on this step")}
                    className={cn(
                      "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold transition",
                      comments.length || open ? "text-teal-700 hover:bg-teal-50" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100",
                    )}
                  >
                    <MessageSquare size={14} />
                    {comments.length ? <span className="tabular">{comments.length}</span> : null}
                  </button>
                ) : null}
                {remove && !temporary ? (
                  <button
                    type="button"
                    onClick={() => run({ type: "remove", id: item.id }, remove, formOf({ ...fields, id: item.id }))}
                    aria-label={t("حذف الخطوة", "Delete step")}
                    className="flex size-6 items-center justify-center rounded-md text-slate-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
              {open ? (
                <div className="mt-2 space-y-2 ps-7">
                  {comments.map((comment) => (
                    <div key={comment.id} className={cn("rounded-xl px-3 py-2 ring-1 ring-inset", comment.mine ? "bg-teal-50 ring-teal-300" : "bg-surface ring-slate-200")}>
                      <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="min-w-0 break-words text-xs font-semibold text-slate-900">{comment.authorName}</span>
                        <span className="tabular text-[11px] text-slate-500">{comment.when}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line break-words text-[0.84rem] leading-6 text-slate-700">
                        <Tr text={comment.body}>
                          <MentionText text={comment.body} names={comment.names} />
                        </Tr>
                      </p>
                      {comment.names.length ? (
                        <p className={cn("mt-1 flex items-center gap-1 text-[11px]", comment.mine ? "font-semibold text-teal-800" : "text-slate-500")}>
                          <AtSign size={12} />
                          {comment.mine ? t("موجّه إليك", "Addressed to you") : t(`موجّه إلى ${comment.names.join("، ")}`, `Addressed to ${comment.names.join(", ")}`)} · {t("يراه الجميع", "visible to everyone")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {!comments.length && !discuss ? <p className="text-xs text-slate-500">{t("لا تعليقات على هذه الخطوة.", "No comments on this step.")}</p> : null}
                  {discuss ? (
                    <CommentComposer
                      action={discuss.action}
                      fields={{ ...discuss.fields, itemId: item.id }}
                      members={discuss.members}
                      authorName={discuss.authorName}
                      placeholder={t("علّق على هذه الخطوة… (@ لتوجيهه لشخص)", "Comment on this step… (@ to address someone)")}
                      submitLabel={t("تعليق", "Comment")}
                      compact
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? <p className="text-sm text-slate-500">{emptyText}</p> : null}
      {add ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.current?.value.trim().slice(0, 200) || "";
            if (!text) return;
            if (input.current) input.current.value = "";
            run({ type: "add", item: { id: `tmp-${Date.now()}`, text, done: false } }, add, formOf({ ...fields, text }));
          }}
        >
          <input ref={input} name="text" required maxLength={200} placeholder={t("أضف خطوة…", "Add a step…")} className={`${fieldClass} min-w-0 flex-1`} />
          <button className={secondaryBtn}>{t("إضافة", "Add")}</button>
        </form>
      ) : null}
    </>
  );
}
