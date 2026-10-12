"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { dangerBtn, primaryBtn, secondaryBtn } from "./ui";

const linkStyle = "text-sm font-semibold text-red-700 underline-offset-4 transition hover:text-red-800 hover:underline disabled:opacity-60";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  confirm,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "link";
  /** Asks before submitting; used for deletes. */
  confirm?: string;
  className?: string;
  /** Sent with the form when this button submits it, so one form can have several outcomes. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useLang();
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const base = variant === "danger" ? dangerBtn : variant === "secondary" ? secondaryBtn : variant === "link" ? linkStyle : primaryBtn;
  const destructive = variant === "danger" || variant === "link";

  function carrySubmitter(form: HTMLFormElement | null) {
    if (!name || value === undefined || !form) return;
    // Server-action forms don't reliably send the clicked button's name/value, so carry it in a hidden field.
    let field = form.querySelector<HTMLInputElement>(`input[type="hidden"][data-submitter="${name}"]`);
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.dataset.submitter = name;
      form.appendChild(field);
    }
    field.value = value;
  }

  function proceed() {
    dialog.current?.close();
    const form = button.current?.form;
    if (!form) return;
    carrySubmitter(form);
    form.requestSubmit(button.current);
  }

  return (
    <>
      <button
        ref={button}
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(base, className)}
        onClick={(event) => {
          if (confirm) {
            // An in-page dialog instead of window.confirm, which freezes the page while it is open.
            event.preventDefault();
            dialog.current?.showModal();
            return;
          }
          carrySubmitter(event.currentTarget.form);
        }}
      >
        {pending ? (
          <>
            {variant === "link" ? null : <LoaderCircle size={16} className="animate-spin" />}
            {pendingLabel || t("جارٍ الحفظ...", "Saving...")}
          </>
        ) : (
          children
        )}
      </button>
      {confirm ? (
        <dialog
          ref={dialog}
          className="m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-3xl border border-slate-200 bg-surface p-0 text-start text-slate-900 shadow-float backdrop:bg-ink-950/45 backdrop:backdrop-blur-[2px] open:animate-fade-up"
          onClick={(event) => {
            if (event.target === dialog.current) dialog.current?.close();
          }}
        >
          <div className="flex items-start gap-3 p-5 sm:p-6">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                destructive ? "bg-red-50 text-red-700 ring-red-100" : "bg-teal-50 text-teal-700 ring-teal-100",
              )}
            >
              <AlertTriangle size={18} />
            </span>
            <p className="min-w-0 pt-1.5 text-sm leading-6 font-semibold text-slate-900">{confirm}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
            <button type="button" className={secondaryBtn} onClick={() => dialog.current?.close()}>
              {t("إلغاء", "Cancel")}
            </button>
            <button type="button" className={destructive ? dangerBtn : primaryBtn} onClick={proceed}>
              {t("تأكيد", "Confirm")}
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
