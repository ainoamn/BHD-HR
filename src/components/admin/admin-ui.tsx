import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { secondaryBtn } from "@/components/ui";
import type { MonthPoint } from "@/lib/admin-data";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Monthly columns; the tallest is full height, the latest month is emphasised. */
export function ColumnChart({ points, lang, format = String, tone = "teal" }: { points: MonthPoint[]; lang: Lang; format?: (value: number) => string; tone?: "teal" | "gold" }) {
  const max = Math.max(...points.map((point) => point.value), 0);
  const bar = tone === "gold" ? "bg-gold-400" : "bg-teal-600";
  return (
    <figure className="min-w-0">
      <div className="flex h-40 items-end gap-1 border-b border-slate-200 sm:gap-1.5" role="img" aria-label={points.map((point) => `${point.label[lang]}: ${format(point.value)}`).join("، ")}>
        {points.map((point, index) => {
          const height = max ? Math.max(point.value ? 4 : 0, Math.round((point.value / max) * 100)) : 0;
          const last = index === points.length - 1;
          return (
            <div key={point.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${point.label[lang]}: ${format(point.value)}`}>
              <div className="relative h-full w-full rounded-t-md bg-slate-100/40">
                <div className={cn("absolute inset-x-0 bottom-0 rounded-t-md transition-[height]", bar, last ? "opacity-100" : "opacity-60 group-hover:opacity-90")} style={{ height: `${height}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5" aria-hidden="true">
        {points.map((point, index) => (
          <span key={point.key} className={cn("min-w-0 flex-1 truncate text-center text-[0.65rem] leading-4", index === points.length - 1 ? "font-bold text-slate-700" : "text-slate-400", index % 2 && index !== points.length - 1 ? "max-sm:invisible" : "")}>
            {point.label[lang]}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Used against a limit: amber from 80%, red at the limit; no limit shows the count only. */
export function Meter({ value, max, label }: { value: number; max: number | null; label?: string }) {
  const share = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tone = !max ? "bg-teal-500" : value >= max ? "bg-red-500" : share >= 80 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div className="min-w-0">
      {label ? (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-slate-500">{label}</span>
          <span className="tabular shrink-0 font-semibold text-slate-800">
            {value}
            <span className="font-normal text-slate-400"> / {max ?? "∞"}</span>
          </span>
        </div>
      ) : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: max ? `${Math.max(value ? 3 : 0, share)}%` : value ? "100%" : "0%" }} />
      </div>
    </div>
  );
}

export type Chip = { href: string; label: string; count?: number; active: boolean; tone?: "amber" | "red" };

/** Filter links with their counts. */
export function FilterChips({ items, label }: { items: Chip[]; label: string }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition",
            item.active ? "bg-ink-900 text-white ring-ink-900" : "bg-surface text-slate-600 ring-slate-200 hover:text-slate-900 hover:ring-slate-300",
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-[0.7rem] leading-5",
                item.active ? "bg-white/15 text-white" : item.tone === "red" && item.count ? "bg-red-50 text-red-700" : item.tone === "amber" && item.count ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500",
              )}
            >
              {item.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, pages, href, lang }: { page: number; pages: number; href: (page: number) => string; lang: Lang }) {
  if (pages <= 1) return null;
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={secondaryBtn}>
          <ChevronRight size={16} className="ltr:rotate-180" />
          {t("السابق", "Previous")}
        </Link>
      ) : null}
      <span className="tabular px-2 text-slate-500">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={secondaryBtn}>
          {t("التالي", "Next")}
          <ChevronLeft size={16} className="ltr:rotate-180" />
        </Link>
      ) : null}
    </div>
  );
}

/** First letter of a name in a rounded square, coloured from the name so it stays the same. */
export function Monogram({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const palette = ["bg-teal-50 text-teal-800 ring-teal-200/70", "bg-gold-50 text-gold-700 ring-gold-200/70", "bg-navy-50 text-navy-500 ring-navy-100", "bg-aqua-50 text-aqua-700 ring-aqua-100"];
  const index = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-xl font-bold ring-1 ring-inset", palette[index], size === "lg" ? "size-14 text-xl" : "size-10 text-sm")}
      aria-hidden="true"
    >
      {name.trim().charAt(0) || "؟"}
    </span>
  );
}

/** A list whose rows become a table on wide screens; `head` holds the column titles shown from `lg`. */
export function RowList({ head, columns, children }: { head: string[]; columns: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
      <div className={cn("hidden gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500 lg:grid", columns)}>
        {head.map((title) => (
          <span key={title} className="min-w-0 truncate">
            {title}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}

/** One row of a RowList: stacked on phones, columns from `lg`. */
export function Row({ columns, children, className }: { columns: string; children: React.ReactNode; className?: string }) {
  return <li className={cn("grid min-w-0 gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-slate-50/60 sm:px-5 lg:items-center", columns, className)}>{children}</li>;
}

/** Small label shown before a value on phones only, where there is no column header. */
export function CellLabel({ children }: { children: React.ReactNode }) {
  return <span className="me-1 text-xs text-slate-400 lg:hidden">{children}</span>;
}
