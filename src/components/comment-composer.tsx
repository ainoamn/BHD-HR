"use client";

import { useOptimistic, useRef, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { toast } from "./action-form";
import { useLang } from "./lang-provider";
import { fieldClass, primaryBtn } from "./ui";

type Pending = { id: number; body: string };

/** The comment shows in the timeline the moment it is sent, while the server saves it. */
export function CommentComposer({
  action,
  fields,
  authorName,
  placeholder,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  authorName: string;
  placeholder: string;
  submitLabel: string;
}) {
  const { t } = useLang();
  const [, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const [pending, add] = useOptimistic<Pending[], Pending>([], (current, next) => [...current, next]);

  return (
    <>
      {pending.length ? (
        <ol className="mt-3 space-y-3">
          {pending.map((entry) => (
            <li key={entry.id} className="flex gap-3 opacity-70">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{authorName.trim().slice(0, 1)}</span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{authorName}</p>
                  <span className="text-xs text-slate-500">{t("جارٍ الإرسال…", "Sending…")}</span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{entry.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <form
        className="mt-4 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const body = box.current?.value.trim().slice(0, 3000) || "";
          if (!body) return;
          if (box.current) box.current.value = "";
          const data = new FormData();
          for (const [name, value] of Object.entries(fields)) data.set(name, value);
          data.set("body", body);
          startTransition(async () => {
            add({ id: Date.now(), body });
            const result = await action(data);
            toast(result, { quiet: true });
            if (result?.error && box.current && !box.current.value) box.current.value = body;
          });
        }}
      >
        <textarea ref={box} name="body" required maxLength={3000} placeholder={placeholder} className={`${fieldClass} min-h-20 w-full`} />
        <button className={primaryBtn}>{submitLabel}</button>
      </form>
    </>
  );
}
