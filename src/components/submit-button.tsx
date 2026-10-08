"use client";

import { useFormStatus } from "react-dom";
import { useLang } from "./lang-provider";
import { dangerBtn, primaryBtn, secondaryBtn } from "./ui";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const { t } = useLang();
  const className = variant === "danger" ? dangerBtn : variant === "secondary" ? secondaryBtn : primaryBtn;
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel || t("جارٍ الحفظ...", "Saving...") : children}
    </button>
  );
}
