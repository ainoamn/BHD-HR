"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLang } from "./lang-provider";

const EVERY = 5_000;
const SLOW = 30_000;

const TYPING = "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select";

/** Something the person has typed or picked and not saved yet, or a dialog they have open. */
function inTheMiddleOfSomething() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && (active.isContentEditable || active.matches(TYPING))) return true;
  if (document.querySelector("dialog[open]")) return true;
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
    if (field instanceof HTMLSelectElement) {
      const defaults = [...field.options].map((option) => option.defaultSelected);
      if (!field.multiple && !defaults.some(Boolean)) defaults[0] = true;
      if ([...field.options].some((option, index) => option.selected !== Boolean(defaults[index]))) return true;
    } else if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      if (field.checked !== field.defaultChecked) return true;
    } else if (field instanceof HTMLInputElement && field.type === "file") {
      if (field.files?.length) return true;
    } else if (field.type !== "hidden" && field.value !== field.defaultValue) {
      return true;
    }
  }
  return false;
}

/**
 * Keeps the page current: every few seconds while the page is on screen it asks whether anything it shows
 * has changed (app/api/live), and if so reloads the page's data in place — no full reload, scroll and
 * typing kept. While the person is typing or has a dialog open it waits and offers a button instead.
 * Not a session heartbeat: the check reads nothing about the session and sets no cookie, and nothing
 * happens on tab focus or visibility events (BHD-SESSION-POLICY).
 */
export function LiveUpdates({ source }: { source?: { portal: string } | { task: string } }) {
  const router = useRouter();
  const { t } = useLang();
  const [waiting, setWaiting] = useState(false);
  const [, startTransition] = useTransition();
  const url = source ? `/api/live?${"portal" in source ? `portal=${encodeURIComponent(source.portal)}` : `task=${encodeURIComponent(source.task)}`}` : "/api/live";
  const refreshRef = useRef(() => {});

  useEffect(() => {
    let seen: number | null = null;
    let due = false;
    let stopped = false;
    let timer = 0;
    const recent: number[] = [];

    const refresh = () => {
      due = false;
      setWaiting(false);
      recent.push(Date.now());
      startTransition(() => router.refresh());
    };
    refreshRef.current = refresh;

    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
          const { v } = (await response.json()) as { v: number | null };
          if (v === null) {
            stopped = true;
            return;
          }
          if (seen !== null && v > seen) due = true;
          seen = Math.max(seen ?? 0, v);
        } catch {
          // offline or a deploy in progress: try again next round
        }
        if (due) {
          if (inTheMiddleOfSomething()) setWaiting(true);
          else {
            // Another tab may have rebound the shared hr_session cookie. If this
            // window's identity Bearer disagrees, skip soft refresh and let BhdSilentSso
            // restore this tab — otherwise the UI jumps to the other account.
            try {
              const [idRes, localRes] = await Promise.all([
                fetch("https://id.bhd-om.com/api/auth/me", {
                  cache: "no-store",
                  credentials: "include",
                  headers: (() => {
                    const h: Record<string, string> = { Accept: "application/json" };
                    const token = sessionStorage.getItem("bhd_window_token");
                    if (token) h.Authorization = `Bearer ${token}`;
                    return h;
                  })(),
                }),
                fetch("/api/auth/me", { cache: "no-store", credentials: "include" }),
              ]);
              const idBody = (await idRes.json().catch(() => ({}))) as { user?: { id?: string } | null };
              const localBody = (await localRes.json().catch(() => ({}))) as { user?: { id?: string } | null };
              if (idBody.user?.id && localBody.user?.id && idBody.user.id !== localBody.user.id) {
                due = false;
                return;
              }
            } catch {
              /* offline — refresh as usual */
            }
            refresh();
          }
        }
      }
      while (recent.length && Date.now() - recent[0] > 60_000) recent.shift();
      timer = window.setTimeout(tick, recent.length > 4 ? SLOW : EVERY);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [router, url]);

  if (!waiting) return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <button
        type="button"
        onClick={() => refreshRef.current()}
        className="inline-flex max-w-full items-center gap-2 rounded-full bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-float transition hover:bg-teal-800"
      >
        <RefreshCw size={16} className="shrink-0" />
        <span className="truncate">{t("وصلت تحديثات جديدة — اضغط للعرض", "New updates — tap to show")}</span>
      </button>
    </div>
  );
}
