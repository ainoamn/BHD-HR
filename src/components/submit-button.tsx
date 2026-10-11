"use client";

import { LoaderCircle } from "lucide-react";
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
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "link";
  /** Asks before submitting; used for deletes. */
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useLang();
  const base = variant === "danger" ? dangerBtn : variant === "secondary" ? secondaryBtn : variant === "link" ? linkStyle : primaryBtn;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(base, className)}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
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
  );
}
