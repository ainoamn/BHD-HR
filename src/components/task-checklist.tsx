"use client";

import { Check, X } from "lucide-react";
import { useOptimistic, useRef, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { toast } from "./action-form";
import { Tr } from "./ai-translate";
import { useLang } from "./lang-provider";
import { fieldClass, secondaryBtn } from "./ui";

type Item = { id: string; text: string; done: boolean };
type Action = (formData: FormData) => Promise<ActionResult>;
type Change = { type: "toggle" | "remove"; id: string } | { type: "add"; item: Item };

const formOf = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

/** Steps tick, appear and disappear the moment they are clicked; the server catches up behind them. */
export function TaskChecklist({
  items,
  fields,
  toggle,
  add,
  remove,
  emptyText,
}: {
  items: Item[];
  /** Hidden fields every call carries: the task id for staff, the invite token for guests. */
  fields: Record<string, string>;
  toggle?: Action;
  add?: Action;
  remove?: Action;
  emptyText: string;
}) {
  const { t } = useLang();
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
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
          return (
            <li key={item.id} className={cn("group flex items-start gap-2 rounded-xl px-1 py-1.5 hover:bg-slate-50", temporary && "opacity-60")}>
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
