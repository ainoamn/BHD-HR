import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "min-h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-[inset_0_1px_1px_rgb(9_45_36/0.03)] outline-none transition duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 sm:min-h-10 sm:text-sm";

const btnBase =
  "inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:min-h-10";

export const primaryBtn = `${btnBase} bg-teal-700 text-white shadow-[0_1px_2px_rgb(9_45_36/0.2),inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-teal-800`;

export const secondaryBtn = `${btnBase} border border-slate-200 bg-white text-slate-700 shadow-card hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`;

export const dangerBtn = `${btnBase} border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50`;

export const ghostBtn = `${btnBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;

/** Inline text action inside rows and cards. */
export const linkAction = "inline-flex items-center gap-1 text-sm font-semibold text-teal-700 transition hover:text-teal-900 hover:underline underline-offset-4";

const tones: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-200/70",
  orange: "bg-orange-50 text-orange-700 ring-orange-200/70",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/70",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  sky: "bg-navy-50 text-navy-500 ring-navy-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200/70",
  teal: "bg-teal-50 text-teal-800 ring-teal-200/70",
  gold: "bg-gold-50 text-gold-700 ring-gold-200/70",
};

export function ToneBadge({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ring-1 ring-inset",
        tones[tone] || tones.slate,
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />
      <span className="truncate [&_svg]:inline [&_svg]:align-[-2px]">{children}</span>
    </span>
  );
}

export function Card({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-6", className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex animate-fade-up flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="mt-0.5 hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-card ring-1 ring-slate-200 sm:flex">
            <Icon size={22} strokeWidth={1.8} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem] sm:leading-tight">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-7 text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action, hint }: { children: React.ReactNode; action?: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900">{children}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

const statTones = {
  teal: "bg-teal-50 text-teal-700 ring-teal-100",
  gold: "bg-gold-50 text-gold-600 ring-gold-100",
  aqua: "bg-aqua-50 text-aqua-700 ring-aqua-100",
  navy: "bg-navy-50 text-navy-500 ring-navy-100",
  red: "bg-red-50 text-red-600 ring-red-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
} as const;

export type StatTone = keyof typeof statTones;

export function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "teal",
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Highlights the value (e.g. something needs attention). */
  emphasis?: "red" | "amber";
}) {
  const inner = (
    <div
      className={cn(
        "group relative h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card transition duration-200 ease-out sm:p-5",
        href && "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raised",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[0.8rem] font-medium leading-5 text-slate-500 sm:text-sm">{label}</p>
        {Icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", statTones[tone])}>
            <Icon size={18} strokeWidth={1.9} />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "tabular mt-2 truncate text-xl font-bold tracking-tight sm:text-[1.65rem]",
          emphasis === "red" ? "text-red-700" : emphasis === "amber" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function EmptyState({ title, text, icon: Icon = Inbox, children }: { title: string; text: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
        <Icon size={26} strokeWidth={1.7} />
      </span>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-500">{text}</p>
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Filter / search bar above lists. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-card sm:p-3.5", className)}>{children}</div>;
}

/** Label / value pair in detail grids. */
export function InfoItem({ label, value, wide, dir }: { label: string; value: React.ReactNode; wide?: boolean; dir?: "ltr" | "rtl" }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-100", wide && "sm:col-span-2")}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900" dir={dir}>
        {value}
      </dd>
    </div>
  );
}
