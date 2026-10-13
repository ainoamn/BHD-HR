"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Images, PlayCircle, Search, X } from "lucide-react";
import { normalizeSearch as normalize } from "@/lib/help-search";
import { cn } from "@/lib/utils";
import { useLang } from "../lang-provider";
import { fieldClass } from "../ui";

export type HelpIndexTopic = { slug: string; group: string; number: number; title: string; summary: string; video: boolean; shots: number; search: string };
export type HelpIndexGroup = { key: string; title: string; hint: string };

export function HelpIndex({ topics, groups, basePath }: { topics: HelpIndexTopic[]; groups: HelpIndexGroup[]; basePath: string }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return words.length ? topics.filter((topic) => words.every((word) => topic.search.includes(word))) : topics;
  }, [topics, query]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          className={cn(fieldClass, "w-full ps-10")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("ابحث في الشروحات: رواتب، إجازة، خطاب، سيرة...", "Search the guide: payroll, leave, letter, CV...")}
          aria-label={t("بحث في الشروحات", "Search the guide")}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("مسح البحث", "Clear search")}>
            <X size={16} />
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          {t("لا يوجد شرح بهذه الكلمات. جرّب كلمة أخرى أو اسأل في المربع أعلاه.", "Nothing matches. Try another word or ask in the box above.")}
        </p>
      ) : null}

      {groups.map((group) => {
        const items = shown.filter((topic) => topic.group === group.key);
        if (!items.length) return null;
        return (
          <section key={group.key} aria-labelledby={`help-group-${group.key}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`help-group-${group.key}`} className="text-base font-bold text-slate-900">
                {group.title}
              </h2>
              <p className="text-xs text-slate-500">{group.hint}</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((topic) => (
                <li key={topic.slug} className="min-w-0">
                  <Link
                    href={`${basePath}/${topic.slug}`}
                    className="group flex h-full gap-3 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-raised motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span className="tabular flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-sm font-bold text-teal-800 ring-1 ring-inset ring-teal-100">{topic.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-6 text-slate-900 group-hover:text-teal-800">{topic.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{topic.summary}</span>
                      {topic.video || topic.shots ? (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {topic.video ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              <PlayCircle size={13} />
                              {t("فيديو", "Video")}
                            </span>
                          ) : null}
                          {topic.shots ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                              <Images size={13} />
                              {t(`${topic.shots} صور`, `${topic.shots} images`)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}