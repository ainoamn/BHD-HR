"use client";

import { useEffect } from "react";

const MAX_PER_PAGE = 5;
const sent = new Set<string>();

/** Sends one browser error to /api/errors; repeats and anything past a handful per page are dropped. */
export function reportClientError(error: unknown, digest?: string) {
  const failure = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown browser error");
  const signature = `${failure.message}|${digest || ""}`;
  if (sent.has(signature) || sent.size >= MAX_PER_PAGE) return;
  sent.add(signature);
  const body = JSON.stringify({ message: failure.message, stack: failure.stack?.slice(0, 2000), path: window.location.pathname, digest });
  try {
    if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/errors", { method: "POST", body, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // reporting must never add a second failure
  }
}

/** Uncaught browser errors and rejected promises anywhere in the app. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!event.error && /^Script error\.?$/.test(event.message)) return;
      reportClientError(event.error || event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
