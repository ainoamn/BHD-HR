"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/utils";
import { useLang } from "./lang-provider";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const ICON = { system: Monitor, light: Sun, dark: Moon };

/** Cycles device setting → day → night. */
export function ThemeToggle({ initial, className }: { initial: ThemeChoice; className?: string }) {
  const { t } = useLang();
  const [choice, setChoice] = useState(initial);
  const label = { system: t("المظهر: حسب الجهاز", "Theme: device setting"), light: t("المظهر: نهاري", "Theme: light"), dark: t("المظهر: ليلي", "Theme: dark") };
  const Icon = ICON[choice];
  return (
    <button
      type="button"
      className={
        className ||
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900"
      }
      aria-label={`${label[choice]} — ${t("اضغط للتغيير", "press to change")}`}
      title={label[choice]}
      onClick={() => {
        const next = NEXT[choice];
        document.cookie = next === "system" ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax` : `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.dataset.theme = next === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
        setChoice(next);
      }}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
