import { Archive, ArrowLeftRight, AtSign, CalendarClock, CircleDot, Flag, ListChecks, Mail, Star, UserPlus, type LucideIcon } from "lucide-react";
import { getI18n } from "@/lib/lang";
import { cn, formatDateTime } from "@/lib/utils";
import { Tr } from "./ai-translate";
import { MentionText } from "./mention-text";

export type TimelineEntry = {
  id: string;
  kind: string;
  authorName: string;
  body: string;
  createdAt: Date;
  userId: string | null;
  /** People the comment was addressed to with @; `mine` when that is the person viewing. */
  mentions?: { name: string; mine: boolean }[];
  /** The checklist step a comment is about. */
  step?: { id: string; text: string } | null;
  replies?: TimelineEntry[];
};

const EVENT_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  STATUS: { icon: CircleDot, tone: "bg-navy-50 text-navy-500 ring-navy-100" },
  PRIORITY: { icon: Flag, tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  ASSIGN: { icon: UserPlus, tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  TRANSFER: { icon: ArrowLeftRight, tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  INVITE: { icon: Mail, tone: "bg-gold-50 text-gold-700 ring-gold-200" },
  POSTPONE: { icon: CalendarClock, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  ARCHIVE: { icon: Archive, tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  LEAD: { icon: Star, tone: "bg-gold-50 text-gold-700 ring-gold-200" },
};

type Render = (entry: TimelineEntry) => React.ReactNode;

/**
 * Comments as bubbles (with their replies under them) and history entries (status, priority, people,
 * postponing…) as compact lines, oldest first. Comments addressed to the viewer stand out.
 */
export async function TaskTimeline({ entries, emptyText, action, reply }: { entries: TimelineEntry[]; emptyText: string; action?: Render; reply?: Render }) {
  const { t } = await getI18n();
  if (!entries.length) return <p className="text-sm text-slate-500">{emptyText}</p>;

  const bubble = (entry: TimelineEntry, small = false) => {
    const mentions = entry.mentions || [];
    const mine = mentions.some((mention) => mention.mine);
    const others = mentions.filter((mention) => !mention.mine).map((mention) => mention.name);
    const list = others.join(t("، ", ", "));
    return (
      <div className={cn("min-w-0 flex-1 rounded-2xl rounded-ss-md px-3.5 py-2.5 ring-1 ring-inset", mine ? "bg-teal-50 ring-teal-300" : "bg-slate-50 ring-slate-100")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{entry.authorName}</p>
          <div className="flex items-center gap-3">
            <time className="tabular text-xs text-slate-500">{formatDateTime(entry.createdAt)}</time>
            {action?.(entry)}
          </div>
        </div>
        {entry.step && !small ? (
          <a href={`#step-${entry.step.id}`} className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
            <ListChecks size={13} className="shrink-0" />
            <span className="truncate">
              {t("على الخطوة:", "On step:")} {entry.step.text}
            </span>
          </a>
        ) : null}
        <p className={cn("mt-1 whitespace-pre-line break-words leading-6 text-slate-700", small ? "text-[0.84rem]" : "text-sm")}>
          <Tr text={entry.body}>
            <MentionText text={entry.body} names={mentions.map((mention) => mention.name)} />
          </Tr>
        </p>
        {mentions.length ? (
          <p className={cn("mt-1.5 flex items-start gap-1 text-xs leading-5", mine ? "font-semibold text-teal-800" : "text-slate-500")}>
            <AtSign size={13} className="mt-0.5 shrink-0" />
            <span>
              {mine
                ? others.length
                  ? t(`موجّه إليك وإلى ${list}`, `Addressed to you and ${list}`)
                  : t("موجّه إليك", "Addressed to you")
                : t(`موجّه إلى ${list}`, `Addressed to ${list}`)}
              {" · "}
              {t("يراه الجميع", "visible to everyone")}
            </span>
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const event = entry.kind !== "COMMENT" ? EVENT_ICON[entry.kind] || EVENT_ICON.STATUS : null;
        if (event) {
          const Icon = event.icon;
          const [headline, ...details] = entry.body.split("\n");
          return (
            <li key={entry.id} id={`c-${entry.id}`} className="flex scroll-mt-24 gap-3">
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
        const replies = entry.replies || [];
        return (
          <li key={entry.id} id={`c-${entry.id}`} className="flex scroll-mt-24 gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{entry.authorName.trim().slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              {bubble(entry)}
              {replies.length ? (
                <ol className="mt-2 space-y-2 border-s-2 border-slate-100 ps-3">
                  {replies.map((item) => (
                    <li key={item.id} id={`c-${item.id}`} className="flex scroll-mt-24 gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">{item.authorName.trim().slice(0, 1)}</span>
                      {bubble(item, true)}
                    </li>
                  ))}
                </ol>
              ) : null}
              {reply ? <div className="ps-3">{reply(entry)}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
