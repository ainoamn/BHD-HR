"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { useLang } from "./lang-provider";

/** Native <dialog> so focus trapping, Esc and the backdrop come from the browser. */
export function Modal({
  label,
  title,
  triggerClassName,
  children,
  defaultOpen = false,
  size = "lg",
}: {
  label: React.ReactNode;
  title: string;
  triggerClassName?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  size?: "lg" | "sm";
}) {
  const { t } = useLang();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={(node) => {
          ref.current = node;
          if (node && defaultOpen && !node.open) node.showModal();
        }}
        className={`m-auto ${size === "sm" ? "w-[min(32rem,calc(100vw-1.5rem))]" : "w-[min(56rem,calc(100vw-1.5rem))]"} rounded-3xl border border-slate-200 bg-surface p-0 text-slate-900 shadow-float backdrop:bg-ink-950/45 backdrop:backdrop-blur-[2px] open:animate-fade-up`}
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("إغلاق", "Close")}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[80dvh] overflow-y-auto p-5 sm:p-6">{children}</div>
      </dialog>
    </>
  );
}
