"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Brings the reader back to the section a form was sent from, repeating the flash beside it. */
export function SectionReturn({ text, isError }: { text: string; isError: boolean }) {
  const params = useSearchParams();
  const at = params.get("at");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = at ? document.getElementById(at) : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${at}`);
      setShown(true);
    });
    const timer = window.setTimeout(() => setShown(false), 6000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [at, params]);

  if (!shown) return null;
  return (
    <div
      aria-hidden
      onClick={() => setShown(false)}
      className={cn(
        "fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md animate-fade-up cursor-pointer rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg print:hidden",
        isError ? "border-red-200 bg-red-50 text-red-800" : "border-teal-200 bg-teal-50 text-teal-900",
      )}
    >
      <span className="break-words">{text}</span>
    </div>
  );
}
