"use client";

import { useEffect, useRef, useState } from "react";

/** Shows the panel of the letter kind picked in the surrounding form (radio `letterKind`), so only its inputs are required. */
export function LetterNeedsSwitch({ panels }: { panels: Record<string, React.ReactNode> }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [kind, setKind] = useState<string | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const read = () => setKind(form.querySelector<HTMLInputElement>('input[name="letterKind"]:checked')?.value ?? null);
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {kind && panels[kind] ? <div className="min-w-0 sm:col-span-2">{panels[kind]}</div> : null}
    </>
  );
}
