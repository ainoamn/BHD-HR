import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenText, ExternalLink, Images, Lightbulb, ListChecks, PlayCircle, Sparkles } from "lucide-react";
import {
  HELP_GROUPS,
  helpVideo,
  shotSrc,
  shotsOf,
  topicsFor,
  videoPoster,
  videoSrc,
  type HelpAudience,
  type HelpTopic,
} from "@/lib/help";
import { normalizeSearch } from "@/lib/help-search";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, primaryBtn, secondaryBtn } from "../ui";
import { HelpAsk } from "./help-ask";
import { HelpIndex } from "./help-index";
import { HelpVideo } from "./help-video";

const SUGGESTIONS: Record<HelpAudience, { ar: string; en: string }[]> = {
  staff: [
    { ar: "كيف أصرف رواتب هذا الشهر؟", en: "How do I pay this month's salaries?" },
    { ar: "كيف أضيف موظفاً جديداً؟", en: "How do I add a new employee?" },
    { ar: "كيف أوافق على طلب إجازة؟", en: "How do I approve a leave request?" },
    { ar: "كيف أصدر شهادة راتب موقّعة؟", en: "How do I issue a signed salary certificate?" },
    { ar: "كيف أجعل موظفاً مدير فريق؟", en: "How do I make an employee a team manager?" },
  ],
  employee: [
    { ar: "كيف أطلب إجازة؟", en: "How do I ask for leave?" },
    { ar: "كيف أحصل على شهادة راتب؟", en: "How do I get a salary certificate?" },
    { ar: "كيف أطبع قسيمة راتبي؟", en: "How do I print my payslip?" },
    { ar: "كيف أكتب سيرتي الذاتية؟", en: "How do I write my CV?" },
  ],
  team: [
    { ar: "كيف أوافق على إجازة أحد أفراد فريقي؟", en: "How do I approve leave for someone in my team?" },
    { ar: "كيف أسجّل غياباً لعامل؟", en: "How do I record an absence for a worker?" },
    { ar: "أين أرى الوثائق التي تنتهي قريباً؟", en: "Where do I see documents expiring soon?" },
  ],
};

/** Where "Open this page" goes for the audience; null when the topic has no page they can open. */
export function topicOpenHref(topic: HelpTopic, audience: HelpAudience, token?: string) {
  if (audience === "staff") return topic.href ?? null;
  if (audience === "employee") return topic.portalHref !== undefined && token ? `/portal/${token}${topic.portalHref}` : null;
  return topic.teamHref ?? (topic.portalHref !== undefined ? "/me" : null);
}

export function HelpHome({ audience, lang, basePath, token }: { audience: HelpAudience; lang: Lang; basePath: string; token?: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const topics = topicsFor(audience);
  const featured = topics.find((topic) => helpVideo(topic.video));
  const video = featured ? helpVideo(featured.video) : null;
  const videos = topics.filter((topic) => helpVideo(topic.video)).length;
  const groups = HELP_GROUPS.filter((group) => topics.some((topic) => topic.group === group.key));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 ring-1 ring-slate-200">
          <BookOpenText size={14} className="text-teal-700" />
          {t(`${topics.length} شرحاً مكتوباً`, `${topics.length} written guides`)}
        </span>
        {videos ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 ring-1 ring-slate-200">
            <PlayCircle size={14} className="text-teal-700" />
            {t(`${videos} فيديو بشرح صوتي`, `${videos} narrated videos`)}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 ring-1 ring-slate-200">
          <Sparkles size={14} className="text-teal-700" />
          {t("إجابات فورية بالذكاء الاصطناعي", "Instant AI answers")}
        </span>
      </div>

      {featured && video ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-teal-700">{t("ابدأ من هنا", "Start here")}</p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">{featured.title[lang]}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{featured.summary[lang]}</p>
            </div>
            <Link href={`${basePath}/${featured.slug}`} className={secondaryBtn}>
              {t("الشرح المكتوب", "Written guide")}
            </Link>
          </div>
          <HelpVideo src={videoSrc(video.id)} poster={videoPoster(video.id)} video={video} title={featured.title[lang]} />
        </Card>
      ) : null}

      <HelpAsk audience={audience} token={token} basePath={basePath} suggestions={SUGGESTIONS[audience].map((item) => item[lang])} />

      <HelpIndex
        basePath={basePath}
        groups={groups.map((group) => ({ key: group.key, title: group.title[lang], hint: group.hint[lang] }))}
        topics={topics.map((topic, index) => ({
          slug: topic.slug,
          group: topic.group,
          number: index + 1,
          title: topic.title[lang],
          summary: topic.summary[lang],
          video: Boolean(helpVideo(topic.video)),
          shots: shotsOf(topic).length,
          search: normalizeSearch([topic.title.ar, topic.title.en, topic.summary.ar, topic.summary.en, topic.keywords ?? ""].join(" ")),
        }))}
      />
    </div>
  );
}

export function HelpTopicView({ topic, audience, lang, basePath, token }: { topic: HelpTopic; audience: HelpAudience; lang: Lang; basePath: string; token?: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const topics = topicsFor(audience);
  const index = topics.findIndex((item) => item.slug === topic.slug);
  const previous = index > 0 ? topics[index - 1] : null;
  const next = index >= 0 && index < topics.length - 1 ? topics[index + 1] : null;
  const group = HELP_GROUPS.find((item) => item.key === topic.group);
  const video = helpVideo(topic.video);
  const shots = shotsOf(topic);
  const open = topicOpenHref(topic, audience, token);
  const related = (topic.related ?? []).map((slug) => topics.find((item) => item.slug === slug)).filter((item): item is HelpTopic => Boolean(item));
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <article className="space-y-5">
      <header className="animate-fade-up">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500" aria-label={t("المسار", "Breadcrumb")}>
          <Link href={basePath} className="text-teal-700 hover:underline">
            {t("مركز المساعدة", "Help centre")}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{group?.title[lang]}</span>
        </nav>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="tabular flex size-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-base font-bold text-white">{index + 1}</span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem] sm:leading-tight">{topic.title[lang]}</h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-7 text-slate-500">{topic.summary[lang]}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            {open ? (
              <Link href={open} className={primaryBtn}>
                <ExternalLink size={16} />
                {t("افتح الصفحة", "Open the page")}
              </Link>
            ) : null}
            <Link href={basePath} className={secondaryBtn}>
              <Back size={16} />
              {t("كل الشروحات", "All guides")}
            </Link>
          </div>
        </div>
      </header>

      {video ? (
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
            <PlayCircle size={19} className="text-teal-700" />
            {t("شرح بالفيديو", "Video walkthrough")}
          </h2>
          <HelpVideo src={videoSrc(video.id)} poster={videoPoster(video.id)} video={video} title={topic.title[lang]} />
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
              <ListChecks size={19} className="text-teal-700" />
              {t("خطوة بخطوة", "Step by step")}
            </h2>
            <ol className="space-y-3">
              {topic.steps.map((step, number) => (
                <li key={number} className="flex gap-3">
                  <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800 ring-1 ring-inset ring-teal-100">{number + 1}</span>
                  <p className="min-w-0 pt-0.5 text-sm leading-7 text-slate-700">{step[lang]}</p>
                </li>
              ))}
            </ol>
          </Card>

          {(topic.sections ?? []).map((section) => (
            <Card key={section.title.en}>
              <h2 className="mb-3 font-bold text-slate-900">{section.title[lang]}</h2>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.en} className="flex gap-2.5 text-sm leading-7 text-slate-700">
                    <span className="mt-3 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />
                    <span className="min-w-0">{item[lang]}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {shots.length ? (
            <Card>
              <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
                <Images size={19} className="text-teal-700" />
                {t("صور من النظام", "Screenshots")}
              </h2>
              <div className="space-y-6">
                {shots.map((shot) => (
                  <figure key={shot.file} className={cn("mx-auto", shot.phone ? "max-w-[19rem]" : "w-full")}>
                    <a href={shotSrc(shot.file)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-teal-300">
                      <img src={shotSrc(shot.file)} alt={shot.caption[lang]} loading="lazy" decoding="async" className="h-auto w-full" />
                    </a>
                    <figcaption className="mt-2 text-center text-xs leading-5 text-slate-500">{shot.caption[lang]}</figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5">
          {topic.tips?.length ? (
            <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-100 sm:p-5">
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-amber-900">
                <Lightbulb size={17} />
                {t("نصائح", "Tips")}
              </h2>
              <ul className="space-y-2">
                {topic.tips.map((tip) => (
                  <li key={tip.en} className="text-sm leading-6 text-amber-900">
                    {tip[lang]}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {related.length ? (
            <Card className="p-4 sm:p-5">
              <h2 className="mb-2 text-sm font-bold text-slate-900">{t("شروحات مرتبطة", "Related guides")}</h2>
              <ul className="space-y-1">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`${basePath}/${item.slug}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-50">
                      <span className="min-w-0">{item.title[lang]}</span>
                      <Forward size={14} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Link href={basePath} className="flex items-start gap-3 rounded-2xl bg-teal-50 p-4 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-100/70">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-teal-700" />
            <span className="text-sm leading-6 text-teal-900">
              <strong className="block">{t("لم تجد ما تبحث عنه؟", "Didn't find it?")}</strong>
              {t("اسأل بالذكاء الاصطناعي من صفحة مركز المساعدة.", "Ask AI from the help centre page.")}
            </span>
          </Link>
        </aside>
      </div>

      <nav className="grid gap-3 sm:grid-cols-2" aria-label={t("التنقل بين الشروحات", "Guide navigation")}>
        {previous ? (
          <Link href={`${basePath}/${previous.slug}`} className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:border-teal-200">
            <Back size={18} className="shrink-0 text-teal-700" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">{t("السابق", "Previous")}</span>
              <span className="block font-semibold text-slate-900">{previous.title[lang]}</span>
            </span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link href={`${basePath}/${next.slug}`} className="flex items-center justify-end gap-3 rounded-2xl border border-slate-200/90 bg-surface p-4 text-end shadow-card transition hover:border-teal-200">
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">{t("التالي", "Next")}</span>
              <span className="block font-semibold text-slate-900">{next.title[lang]}</span>
            </span>
            <Forward size={18} className="shrink-0 text-teal-700" />
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
