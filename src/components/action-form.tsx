"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";

type Toast = { id: number; error: boolean; text: string };
const listeners = new Set<(toast: Toast) => void>();
/** Toasts raised before the page's <Toaster /> has mounted (e.g. a redirect's flash on first paint). */
const waiting: Toast[] = [];
let sequence = 0;

/** Shows the action's message or error in the page's <Toaster />; successes can be muted. */
export function toast(result: ActionResult | void | undefined, options: { quiet?: boolean } = {}) {
  if (!result) return;
  if (!result.error && (options.quiet || !result.message)) return;
  const item = { id: ++sequence, error: Boolean(result.error), text: result.error || result.message || "" };
  if (listeners.size) listeners.forEach((listener) => listener(item));
  else waiting.push(item);
}

/** Floating notices: they never push the page content, so nothing jumps when an action finishes. */
export function Toaster() {
  const { t } = useLang();
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (item: Toast) => {
      setItems((current) => [...current.slice(-2), item]);
      window.setTimeout(() => setItems((current) => current.filter((entry) => entry.id !== item.id)), item.error ? 6500 : 3200);
    };
    listeners.add(add);
    waiting.splice(0).forEach(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-3 lg:bottom-6">
      {items.map((item) => {
        const Icon = item.error ? CircleAlert : CircleCheck;
        return (
          <div
            key={item.id}
            role={item.error ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm leading-6 shadow-float",
              item.error ? "border-red-200 bg-red-50 text-red-800" : "border-teal-200 bg-teal-50 text-teal-900",
            )}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{item.text}</span>
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              className="-me-1 flex size-6 shrink-0 items-center justify-center rounded-lg opacity-70 transition hover:opacity-100"
              aria-label={t("إغلاق", "Close")}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Shows a redirect's ?message / ?error as a toast once, instead of a banner that shifts the page. */
export function FlashToast({ error, message }: { error?: string; message?: string }) {
  const shown = useRef("");
  useEffect(() => {
    const key = `${error}|${message}`;
    if ((!error && !message) || shown.current === key) return;
    shown.current = key;
    toast({ error, message });
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url);
  }, [error, message]);
  return null;
}

/**
 * A form for an in-page server action: no redirect, the page refreshes in place. Shows the result as a
 * toast and, on success, closes the dialog it sits in. `onSubmit` runs first, for optimistic updates.
 */
export function ActionForm({
  action,
  children,
  className,
  onSubmit,
  quiet,
  keepOpen,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  onSubmit?: (formData: FormData) => void;
  /** Toast errors only. */
  quiet?: boolean;
  keepOpen?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className={className}
      action={async (formData) => {
        onSubmit?.(formData);
        const result = await action(formData);
        toast(result, { quiet });
        if (!result?.error && !keepOpen) form.current?.closest("dialog")?.close();
      }}
    >
      {children}
    </form>
  );
}
