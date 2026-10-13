"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, CalendarPlus, Check, ListTodo, LoaderCircle, NotebookPen, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import type { AssistantLink, AssistantProposal } from "@/lib/assistant";
import { NOTE_KINDS, TASK_PRIORITY } from "@/lib/tasks";
import { cn, formatDate } from "@/lib/utils";
import { askAssistant, confirmAssistantProposal } from "@/server/assistant-actions";
import { useLang } from "./lang-provider";

type ProposalState = { status: "idle" | "busy" | "done" | "dismissed"; error?: string; message?: string; href?: string };
type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; links?: AssistantLink[]; proposals?: (AssistantProposal & { state: ProposalState })[]; failed?: boolean };

const STORAGE_KEY = "bhd-hr-assistant";

export function AssistantChat({ suggestions }: { suggestions: string[] }) {
  const { t, lang } = useLang();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const next: Message[] = [...messages, { role: "user", text: question }];
    setMessages(next);
    setDraft("");
    startTransition(async () => {
      const history = next.filter((message) => !(message.role === "assistant" && message.failed)).map((message) => ({ role: message.role, text: message.text }));
      const reply = await askAssistant(history).catch(() => ({ error: t("تعذر الاتصال. حاول مجدداً.", "Connection failed. Try again.") }));
      setMessages((current) => [
        ...current,
        "error" in reply
          ? { role: "assistant", text: reply.error, failed: true }
          : { role: "assistant", text: reply.text, links: reply.links, proposals: reply.proposals.map((proposal) => ({ ...proposal, state: { status: "idle" } })) },
      ]);
      inputRef.current?.focus();
    });
  };

  const updateProposal = (messageIndex: number, proposalIndex: number, state: ProposalState) =>
    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex && message.role === "assistant" && message.proposals
          ? { ...message, proposals: message.proposals.map((proposal, inner) => (inner === proposalIndex ? { ...proposal, state } : proposal)) }
          : message,
      ),
    );

  const confirm = async (messageIndex: number, proposalIndex: number, proposal: AssistantProposal) => {
    updateProposal(messageIndex, proposalIndex, { status: "busy" });
    const result = await confirmAssistantProposal(proposal).catch(() => ({ error: t("تعذر الحفظ. حاول مجدداً.", "Couldn't save. Try again.") }));
    updateProposal(messageIndex, proposalIndex, "error" in result ? { status: "idle", error: result.error } : { status: "done", message: result.message, href: result.href });
  };

  return (
    <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card lg:h-[calc(100dvh-14rem)]">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
              <Sparkles size={26} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{t("اسألني عن موظفيك وأعمالك", "Ask me about your people and work")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t(
                "أقرأ بيانات النظام حسب صلاحياتك فقط، ولا أغيّر شيئاً قبل أن تؤكد بنفسك.",
                "I read the system's data within your permissions only, and change nothing until you confirm.",
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-slate-200 bg-surface px-3.5 py-2 text-sm text-slate-700 transition duration-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, messageIndex) =>
          message.role === "user" ? (
            <div key={messageIndex} className="flex justify-start">
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ss-md bg-teal-800 px-4 py-2.5 text-sm leading-6 text-white">{message.text}</p>
            </div>
          ) : (
            <div key={messageIndex} className="flex justify-end">
              <div className="w-full max-w-[92%] space-y-2.5 sm:max-w-[85%]">
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl rounded-se-md px-4 py-3 text-sm leading-7",
                    message.failed ? "bg-red-50 text-red-800 ring-1 ring-inset ring-red-100" : "bg-slate-50 text-slate-800 ring-1 ring-inset ring-slate-100",
                  )}
                >
                  {message.text}
                </div>
                {message.links?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {message.links.map((item) => (
                      <Link key={item.href} href={item.href} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-slate-200 transition hover:bg-teal-50">
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {message.proposals?.map((proposal, proposalIndex) => (
                  <ProposalCard
                    key={proposalIndex}
                    proposal={proposal}
                    lang={lang}
                    onConfirm={() => confirm(messageIndex, proposalIndex, proposal)}
                    onDismiss={() => updateProposal(messageIndex, proposalIndex, { status: "dismissed" })}
                  />
                ))}
              </div>
            </div>
          ),
        )}

        {pending ? (
          <div className="flex justify-end">
            <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-inset ring-slate-100">
              <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
              {t("أراجع البيانات...", "Checking the data...")}
            </p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-slate-100 bg-surface p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            data-ai="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(draft);
              }
            }}
            rows={Math.min(4, Math.max(1, draft.split("\n").length))}
            maxLength={2000}
            placeholder={t("اكتب سؤالك أو ما تريد إنجازه...", "Ask a question or say what you need...")}
            aria-label={t("رسالتك", "Your message")}
            className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label={t("إرسال", "Send")}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white transition duration-200 hover:bg-teal-800 disabled:opacity-50"
          >
            <SendHorizontal size={18} className="rtl:-scale-x-100" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>{t("قد يخطئ المساعد؛ راجع الأرقام المهمة في صفحاتها.", "The assistant can make mistakes; check important figures on their pages.")}</span>
          {messages.length ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="flex shrink-0 items-center gap-1 font-semibold text-slate-500 transition hover:text-teal-700"
            >
              <RotateCcw size={13} />
              {t("محادثة جديدة", "New chat")}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function ProposalCard({
  proposal,
  lang,
  onConfirm,
  onDismiss,
}: {
  proposal: AssistantProposal & { state: ProposalState };
  lang: "ar" | "en";
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLang();
  const { state } = proposal;
  if (state.status === "dismissed") return <p className="text-xs text-slate-400">{t("تم تجاهل الاقتراح.", "Suggestion dismissed.")}</p>;
  const Icon = proposal.kind === "task" ? ListTodo : proposal.kind === "note" ? NotebookPen : CalendarPlus;
  const heading = proposal.kind === "task" ? t("مهمة جديدة", "New task") : proposal.kind === "note" ? t("ملاحظة في ملف الموظف", "Note on the employee's file") : t("تذكير في التقويم", "Calendar reminder");
  return (
    <div className="rounded-2xl border border-teal-200 bg-surface p-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-xs font-semibold text-teal-700">{heading}</p>
          {proposal.kind === "task" ? (
            <>
              <p className="mt-0.5 font-bold text-slate-900">{proposal.title}</p>
              {proposal.description ? <p className="mt-1 whitespace-pre-wrap text-slate-600">{proposal.description}</p> : null}
              <p className="mt-1.5 text-xs text-slate-500">
                {[
                  proposal.employeeNames.length ? `${t("لـ", "For")} ${proposal.employeeNames.join("، ")}` : t("بدون إسناد", "Unassigned"),
                  proposal.dueDate ? `${t("الاستحقاق", "Due")} ${formatDate(proposal.dueDate)}` : null,
                  TASK_PRIORITY[proposal.priority]?.label[lang],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : proposal.kind === "note" ? (
            <>
              <p className="mt-0.5 font-bold text-slate-900">
                {proposal.employeeName} · {NOTE_KINDS[proposal.noteKind]?.label[lang]}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{proposal.body}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 font-bold text-slate-900">{proposal.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                <Bell size={12} className="me-1 inline align-[-1px]" />
                {formatDate(proposal.date)}
                {proposal.employeeName ? ` · ${proposal.employeeName}` : ""}
              </p>
            </>
          )}
        </div>
      </div>
      {state.status === "done" ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check size={16} />
          {state.message}
          {state.href ? (
            <Link href={state.href} className="underline underline-offset-2">
              {t("فتح", "Open")}
            </Link>
          ) : null}
        </p>
      ) : (
        <>
          {state.error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={state.status === "busy"}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white transition duration-200 hover:bg-teal-800 disabled:opacity-60"
            >
              {state.status === "busy" ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> : <Check size={15} />}
              {t("تأكيد وحفظ", "Confirm and save")}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={state.status === "busy"}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-surface px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <X size={15} />
              {t("تجاهل", "Dismiss")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
