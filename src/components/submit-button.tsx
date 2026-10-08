"use client";

import { useFormStatus } from "react-dom";
import { useLang } from "./lang-provider";
import { dangerBtn, primaryBtn, secondaryBtn } from "./ui";

const linkStyle = "text-xs font-semibold text-red-700 hover:underline disabled:opacity-60";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  confirm,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "link";
  /** Asks before submitting; used for deletes. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useLang();
  const className = variant === "danger" ? dangerBtn : variant === "secondary" ? secondaryBtn : variant === "link" ? linkStyle : primaryBtn;
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel || t("جارٍ الحفظ...", "Saving...") : children}
    </button>
  );
}
