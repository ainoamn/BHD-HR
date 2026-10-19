"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/** A GET search/filter form. A field named `q` updates the results while typing; selects in that form apply at once. */
export function GetForm({ action, className, role, children }: { action?: string; className?: string; role?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const stable = new URLSearchParams(query);
  stable.delete("q");
  const key = stable.toString();
  const timer = useRef<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const field = formRef.current?.querySelector<HTMLInputElement>('input[name="q"]:not([type="hidden"])');
    if (!field || document.activeElement === field) return;
    const next = params.get("q") ?? "";
    if (field.value !== next) field.value = next;
  }, [query, params]);

  return (
    <Form
      ref={formRef}
      key={key}
      action={action ?? pathname}
      className={className ? `no-print ${className}` : "no-print"}
      role={role}
      onInput={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.name !== "q" || target.type === "hidden") return;
        const form = target.form;
        if (!form) return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          const current = new URLSearchParams(window.location.search).get("q") ?? "";
          if (target.value.trim() === current.trim()) return;
          form.requestSubmit();
        }, 300);
      }}
      onChange={(event) => {
        const target = event.target;
        const form = target instanceof HTMLElement ? target.form : null;
        if (!form?.querySelector('input[name="q"]')) return;
        const live = target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && (target.type === "date" || target.type === "checkbox"));
        if (!live) return;
        window.clearTimeout(timer.current);
        form.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
