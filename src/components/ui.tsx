import Link from "next/link";
import { cn } from "@/lib/utils";

export const fieldClass =
  "min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100 sm:text-sm";

export const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

export const dangerBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

const tones: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
};

export function ToneBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", tones[tone] || tones.slate)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}>{children}</section>;
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className="h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 sm:p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
