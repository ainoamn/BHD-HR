"use client";

import { AtSign } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { toast } from "./action-form";
import { useLang } from "./lang-provider";
import { MentionText } from "./mention-text";
import { fieldClass, linkAction, primaryBtn } from "./ui";

/** Someone on the task who can be named with @ (see lib/task-members). */
export type Member = { key: string; name: string; hint: string };

type Pending = { id: number; body: string };

const fold = (text: string) => text.toLowerCase().replace(/[\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

/**
 * The comment shows in the timeline the moment it is sent, while the server saves it. Typing @ lists the
 * people on the task; whoever is named gets a notice, and the comment stays visible to everyone.
 * With `toggle`, the box opens from a small link (replies, step comments) and folds away once sent.
 */
export function CommentComposer({
  action,
  fields,
  authorName,
  placeholder,
  submitLabel,
  members = [],
  toggle,
  compact = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  authorName: string;
  placeholder: string;
  submitLabel: string;
  members?: Member[];
  toggle?: string;
  compact?: boolean;
}) {
  const { t } = useLang();
  const [, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const [pending, add] = useOptimistic<Pending[], Pending>([], (current, next) => [...current, next]);
  const [open, setOpen] = useState(!toggle);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [text, setText] = useState("");

  useEffect(() => {
    if (open && toggle) box.current?.focus();
  }, [open, toggle]);

  const matches = query === null ? [] : members.filter((member) => fold(member.name).includes(fold(query.trim()))).slice(0, 6);
  const addressed = members.filter((member) => text.includes(`@${member.name}`));
  const names = members.map((member) => member.name);

  const detect = () => {
    const field = box.current;
    if (!field || !members.length) return;
    setText(field.value);
    const found = field.value.slice(0, field.selectionStart).match(/(?:^|[\s(])@([^@\n]{0,30})$/);
    const next = found ? found[1] : null;
    if (next !== null && next.split(" ").length > 3) return setQuery(null);
    setQuery(next);
    setActive(0);
  };

  const pick = (member: Member) => {
    const field = box.current;
    if (!field) return;
    const caret = field.selectionStart;
    const at = field.value.slice(0, caret).lastIndexOf("@");
    if (at < 0) return;
    const insert = `@${member.name} `;
    field.value = `${field.value.slice(0, at)}${insert}${field.value.slice(caret)}`;
    field.focus();
    field.setSelectionRange(at + insert.length, at + insert.length);
    setText(field.value);
    setQuery(null);
  };

  const startMention = () => {
    const field = box.current;
    if (!field) return;
    const caret = field.selectionStart;
    const before = field.value.slice(0, caret);
    const insert = before && !/\s$/.test(before) ? " @" : "@";
    field.value = `${before}${insert}${field.value.slice(caret)}`;
    field.focus();
    field.setSelectionRange(caret + insert.length, caret + insert.length);
    detect();
  };

  const avatar = compact ? "size-7 text-xs" : "size-8 text-sm";

  return (
    <>
      {pending.length ? (
        <ol className={cn("space-y-3", compact ? "mt-2" : "mt-3")}>
          {pending.map((entry) => (
            <li key={entry.id} className="flex gap-3 opacity-70">
              <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-teal-700 font-bold text-white", avatar)}>{authorName.trim().slice(0, 1)}</span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{authorName}</p>
                  <span className="text-xs text-slate-500">{t("جارٍ الإرسال…", "Sending…")}</span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">
                  <MentionText text={entry.body} names={names} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {toggle && !open ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(linkAction, "mt-1.5 text-xs")}>
          {toggle}
        </button>
      ) : (
        <form
          className={cn("space-y-2", compact ? "mt-2" : "mt-4")}
          onSubmit={(event) => {
            event.preventDefault();
            const body = box.current?.value.trim().slice(0, 3000) || "";
            if (!body) return;
            if (box.current) box.current.value = "";
            setText("");
            setQuery(null);
            if (toggle) setOpen(false);
            const data = new FormData();
            for (const [name, value] of Object.entries(fields)) data.set(name, value);
            data.set("body", body);
            startTransition(async () => {
              add({ id: Date.now(), body });
              const result = await action(data);
              toast(result, { quiet: !result?.message });
              if (result?.error) {
                setOpen(true);
                requestAnimationFrame(() => {
                  if (box.current && !box.current.value) box.current.value = body;
                });
              }
            });
          }}
        >
          <div className="relative">
            {matches.length ? (
              <ul role="listbox" aria-label={t("الأشخاص في المهمة", "People on the task")} className="absolute inset-x-0 bottom-full z-30 mb-1.5 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-1 shadow-float">
                {matches.map((member, index) => (
                  <li key={member.key} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(member)}
                      className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition", index === active ? "bg-teal-50" : "hover:bg-slate-50")}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{member.name.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{member.name}</span>
                        <span className="block truncate text-xs text-slate-500">{member.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <textarea
              ref={box}
              name="body"
              required
              maxLength={3000}
              placeholder={placeholder}
              onInput={detect}
              onClick={detect}
              onKeyUp={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") detect();
              }}
              onBlur={() => setQuery(null)}
              onKeyDown={(event) => {
                if (!matches.length) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) => (value + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                } else if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  pick(matches[active] || matches[0]);
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setQuery(null);
                }
              }}
              className={cn(fieldClass, "w-full", compact ? "min-h-16" : "min-h-20")}
            />
          </div>
          {addressed.length ? (
            <p className="flex items-start gap-1.5 text-xs leading-5 text-teal-800">
              <AtSign size={13} className="mt-0.5 shrink-0" />
              {t(`سيصل تنبيه إلى ${addressed.map((member) => member.name).join("، ")}، ويبقى التعليق ظاهراً للجميع.`, `${addressed.map((member) => member.name).join(", ")} will be notified; everyone can still see the comment.`)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button className={primaryBtn}>{submitLabel}</button>
            {members.length ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={startMention}
                title={t("وجّه التعليق إلى شخص؛ يصله تنبيه ويراه الجميع", "Address someone; they are notified and everyone still sees it")}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-teal-700 ring-1 ring-inset ring-teal-200 transition hover:bg-teal-50 sm:min-h-10"
              >
                <AtSign size={15} />
                {t("إشارة", "Mention")}
              </button>
            ) : null}
            {toggle ? (
              <button type="button" onClick={() => setOpen(false)} className={cn(linkAction, "text-xs")}>
                {t("إلغاء", "Cancel")}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </>
  );
}
