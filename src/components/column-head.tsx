"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "@/components/lang-provider";

/** Column title with a small search lens and up/down sort arrows. Keeps the rest of the query string. */
export function ColumnHead({ column, label, className }: { column: string; label: string; className?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = `f${column}`;
  const current = params.get(key) ?? "";
  const [open, setOpen] = useState(Boolean(current));
  const [value, setValue] = useState(current);
  const sort = params.get("sort") || "";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";

  useEffect(() => setValue(current), [current]);

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [name, item] of Object.entries(patch)) {
      if (item) next.set(name, item);
      else next.delete(name);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (value.trim() === current.trim()) return;
    const timer = window.setTimeout(() => go({ [key]: value.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // go reads the latest params when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const upOn = sort === column && dir === "asc";
  const downOn = sort === column && dir === "desc";

  return (
    <th className={`px-3 py-2 text-start align-bottom ${className || ""}`}>
      <span className="flex flex-wrap items-center gap-1">
        <span className="font-semibold">{label}</span>
        <button
          type="button"
          className={`rounded p-0.5 ${current || open ? "text-teal-700" : "text-slate-400 hover:text-slate-700"}`}
          aria-label={t(`بحث في ${label}`, `Search ${label}`)}
          aria-expanded={open}
          onClick={() => setOpen((item) => !item)}
        >
          <Search size={13} />
        </button>
        <button
          type="button"
          className={`rounded p-0.5 ${upOn ? "text-teal-700" : "text-slate-400 hover:text-slate-700"}`}
          aria-label={t(`فرز ${label} تصاعدياً`, `Sort ${label} ascending`)}
          aria-pressed={upOn}
          onClick={() => go({ sort: column, dir: "asc" })}
        >
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          className={`rounded p-0.5 ${downOn ? "text-teal-700" : "text-slate-400 hover:text-slate-700"}`}
          aria-label={t(`فرز ${label} تنازلياً`, `Sort ${label} descending`)}
          aria-pressed={downOn}
          onClick={() => go({ sort: column, dir: "desc" })}
        >
          <ArrowDown size={13} />
        </button>
      </span>
      {open ? (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={t(`بحث في ${label}`, `Search ${label}`)}
          className="mt-1 h-7 w-full min-w-24 rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-teal-500"
        />
      ) : null}
    </th>
  );
}
