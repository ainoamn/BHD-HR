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
}: {
  label: React.ReactNode;
  title: string;
  triggerClassName?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
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
        className="m-auto w-[min(56rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t("إغلاق", "Close")}>
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </dialog>
    </>
  );
}
