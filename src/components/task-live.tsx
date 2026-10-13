"use client";

import { CircleSlash, Flag, PauseCircle } from "lucide-react";
import { createContext, useContext, useOptimistic, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { pick } from "@/lib/i18n";
import { TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, isClosedStatus, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { ActionForm, toast } from "./action-form";
import { useLang } from "./lang-provider";
import { Modal } from "./modal";
import { SubmitButton } from "./submit-button";
import { Field, ToneBadge, fieldClass } from "./ui";

type Action = (formData: FormData) => Promise<ActionResult>;
type State = { status: TaskStatus; priority: TaskPriority };
type Patch = Partial<State>;
type Live = State & {
  /** What the server last rendered; notes and dates that depend on it hide while a change is in flight. */
  saved: State;
  /** Where Resume goes: the status the task was paused from, known even before the hold is saved. */
  resumeTo: TaskStatus;
  set: (patch: Patch, run: () => Promise<ActionResult>) => void;
  setNow: (patch: Patch) => void;
};

const LiveContext = createContext<Live | null>(null);

function useLive() {
  const live = useContext(LiveContext);
  if (!live) throw new Error("TaskLive is missing");
  return live;
}

const formOf = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

/**
 * Status and priority shown optimistically: every badge, button and the colour strip switch the moment
 * they are clicked, and the server action refreshes the page in place behind them.
 */
export function TaskLive({ status, priority, resumeTo, children }: State & { resumeTo: TaskStatus; children: React.ReactNode }) {
  const saved = { status, priority };
  const [state, apply] = useOptimistic({ ...saved, resumeTo }, (current: State & { resumeTo: TaskStatus }, patch: Patch) => ({
    ...current,
    ...patch,
    resumeTo: patch.status === "ON_HOLD" && current.status !== "ON_HOLD" ? current.status : current.resumeTo,
  }));
  const [, startTransition] = useTransition();
  const live: Live = {
    ...state,
    saved,
    setNow: apply,
    set: (patch, run) =>
      startTransition(async () => {
        apply(patch);
        toast(await run(), { quiet: true });
      }),
  };
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

export function LiveStrip() {
  const { status } = useLive();
  return <div className={cn("h-1.5 transition-colors duration-200", TASK_STATUS[status].solid)} aria-hidden="true" />;
}

export function LiveBadges({ due, plainDue }: { due: { tone: string; label: string } | null; plainDue: string | null }) {
  const { status, priority } = useLive();
  const { lang } = useLang();
  const paused = isClosedStatus(status) || status === "ON_HOLD";
  const dueBadge = paused ? (plainDue ? { tone: "slate", label: plainDue } : null) : due;
  return (
    <>
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white transition-colors duration-200", TASK_STATUS[status].solid)}>
        {pick(TASK_STATUS[status].label, lang)}
      </span>
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white transition-colors duration-200", TASK_PRIORITY[priority].solid)}>
        <Flag size={12} /> {pick(TASK_PRIORITY[priority].label, lang)}
      </span>
      {dueBadge ? <ToneBadge tone={dueBadge.tone}>{dueBadge.label}</ToneBadge> : null}
    </>
  );
}

export function LiveTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const { status } = useLive();
  return <h1 className={cn(className, "transition-colors duration-200", isClosedStatus(status) && "text-slate-500 line-through")}>{children}</h1>;
}

/** Renders its children only while the (optimistic) status matches; `saved` also requires the server to agree. */
export function WhenStatus({ is, not, saved, children }: { is?: TaskStatus[]; not?: TaskStatus[]; saved?: boolean; children: React.ReactNode }) {
  const live = useLive();
  if (is && !is.includes(live.status)) return null;
  if (not && not.includes(live.status)) return null;
  if (saved && live.status !== live.saved.status) return null;
  return <>{children}</>;
}

const pill = (selected: boolean, solid: string) =>
  cn(
    "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition duration-200 lg:w-auto",
    selected ? `${solid} text-white shadow-card ring-transparent` : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300",
  );

/** One-click statuses, plus Hold and Close (with a reason) when `reasons` is set. */
export function StatusButtons({ action, fields, quick, reasons }: { action: Action; fields: Record<string, string>; quick: readonly TaskStatus[]; reasons?: boolean }) {
  const live = useLive();
  const { lang, t } = useLang();
  const choose = (status: TaskStatus) => {
    if (status === live.status) return;
    live.set({ status }, () => action(formOf({ ...fields, status })));
  };
  const reasonModal = (option: "ON_HOLD" | "CANCELLED") =>
    option === live.status ? (
      <button key={option} type="button" disabled aria-pressed className={pill(true, TASK_STATUS[option].solid)}>
        <span className="size-2 rounded-full bg-white" />
        {pick(TASK_STATUS[option].label, lang)}
      </button>
    ) : (
      <Modal
        key={option}
        size="sm"
        title={option === "ON_HOLD" ? t("تعليق المهمة", "Put the task on hold") : t("إغلاق المهمة دون إنجاز", "Close without completion")}
        triggerClassName={pill(false, "")}
        label={
          <>
            <span className={cn("size-2 rounded-full", TASK_STATUS[option].dot)} />
            {option === "ON_HOLD" ? t("تعليق", "Hold") : t("إغلاق", "Close")}
          </>
        }
      >
        <ActionForm action={action} quiet onSubmit={() => live.setNow({ status: option })} className="space-y-4 text-start">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="status" value={option} />
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
        </ActionForm>
      </Modal>
    );
  return (
    <>
      {quick.map((option) => (
        <button key={option} type="button" onClick={() => choose(option)} aria-pressed={option === live.status} className={pill(option === live.status, TASK_STATUS[option].solid)}>
          <span className={cn("size-2 rounded-full", option === live.status ? "bg-white" : TASK_STATUS[option].dot)} />
          {pick(TASK_STATUS[option].label, lang)}
        </button>
      ))}
      {reasons ? (
        <>
          {reasonModal("ON_HOLD")}
          {reasonModal("CANCELLED")}
        </>
      ) : null}
    </>
  );
}

export function PriorityChips({ action, fields }: { action: Action; fields: Record<string, string> }) {
  const live = useLive();
  const { lang } = useLang();
  return (
    <>
      {TASK_PRIORITIES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === live.priority}
          onClick={() => option !== live.priority && live.set({ priority: option }, () => action(formOf({ ...fields, priority: option })))}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ring-1 ring-inset transition duration-200",
            option === live.priority ? `${TASK_PRIORITY[option].solid} text-white ring-transparent` : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
          )}
        >
          <Flag size={13} className={option === live.priority ? "text-white" : TASK_PRIORITY[option].flag} />
          {pick(TASK_PRIORITY[option].label, lang)}
        </button>
      ))}
    </>
  );
}

/** Resume / Reopen: a status change from the toolbar. RESUME goes back to where the task was paused. */
export function StatusActionButton({ action, fields, status, className, children }: { action: Action; fields: Record<string, string>; status: TaskStatus | "RESUME"; className: string; children: React.ReactNode }) {
  const live = useLive();
  return (
    <button type="button" className={className} onClick={() => live.set({ status: status === "RESUME" ? live.resumeTo : status }, () => action(formOf({ ...fields, status })))}>
      {children}
    </button>
  );
}
