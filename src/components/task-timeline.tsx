import { Archive, ArrowLeftRight, CalendarClock, CircleDot, Flag, Mail, UserPlus, type LucideIcon } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { Tr } from "./ai-translate";

export type TimelineEntry = { id: string; kind: string; authorName: string; body: string; createdAt: Date; userId: string | null };

const EVENT_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  STATUS: { icon: CircleDot, tone: "bg-navy-50 text-navy-500 ring-navy-100" },
  PRIORITY: { icon: Flag, tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  ASSIGN: { icon: UserPlus, tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  TRANSFER: { icon: ArrowLeftRight, tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  INVITE: { icon: Mail, tone: "bg-gold-50 text-gold-700 ring-gold-200" },
  POSTPONE: { icon: CalendarClock, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  ARCHIVE: { icon: Archive, tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** Comments as bubbles and history entries (status, priority, people, postponing…) as compact lines, oldest first. */
export function TaskTimeline({ entries, emptyText, action }: { entries: TimelineEntry[]; emptyText: string; action?: (entry: TimelineEntry) => React.ReactNode }) {
  if (!entries.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const event = entry.kind !== "COMMENT" ? EVENT_ICON[entry.kind] || EVENT_ICON.STATUS : null;
        if (event) {
          const Icon = event.icon;
          const [headline, ...details] = entry.body.split("\n");
          return (
            <li key={entry.id} className="flex gap-3">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${event.tone}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="break-words text-sm leading-6 text-slate-700">
                  <span className="font-semibold text-slate-900">{entry.authorName}</span> <Tr text={headline} />
                </p>
                {details.length ? (
                  <p className="mt-0.5 whitespace-pre-line break-words rounded-xl bg-slate-50 px-3 py-1.5 text-sm leading-6 text-slate-600 ring-1 ring-inset ring-slate-100">
                    <Tr text={details.join("\n")} />
                  </p>
                ) : null}
                <time className="tabular text-xs text-slate-500">{formatDateTime(entry.createdAt)}</time>
              </div>
            </li>
          );
        }
        return (
          <li key={entry.id} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{entry.authorName.trim().slice(0, 1)}</span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-ss-md bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{entry.authorName}</p>
                <div className="flex items-center gap-3">
                  <time className="tabular text-xs text-slate-500">{formatDateTime(entry.createdAt)}</time>
                  {action?.(entry)}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">
                <Tr text={entry.body} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
