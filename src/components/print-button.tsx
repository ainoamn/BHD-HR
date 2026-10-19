"use client";

import { Printer } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { cn } from "@/lib/utils";

/** window.print() blocks the main thread while the dialog is open; opening it after the next paint keeps the click responsive (INP). */
export function printAfterPaint() {
  requestAnimationFrame(() => setTimeout(() => window.print(), 0));
}

const btnBase =
  "inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:min-h-10";
const primaryClass = `${btnBase} bg-teal-700 text-white shadow-[0_1px_2px_rgb(9_45_36/0.2),inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-teal-800`;
const secondaryClass = `${btnBase} border border-slate-200 bg-surface text-slate-700 shadow-card hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`;
const iconClass =
  "relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900";

/** Browser print for the current page (nav and chrome are hidden via `.no-print`). */
export function PrintButton({
  label,
  variant = "primary",
  compact = false,
  className,
}: {
  label?: string;
  variant?: "primary" | "secondary";
  /** Icon-only control for the app header. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const text = label ?? t("طباعة", "Print");

  if (compact) {
    return (
      <button type="button" onClick={printAfterPaint} aria-label={text} title={text} className={cn(iconClass, className)}>
        <Printer size={18} />
      </button>
    );
  }

  return (
    <button type="button" onClick={printAfterPaint} className={cn(variant === "secondary" ? secondaryClass : primaryClass, className)}>
      <Printer size={16} />
      {text}
    </button>
  );
}
