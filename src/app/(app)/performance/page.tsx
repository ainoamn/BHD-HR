import Link from "next/link";
import { ChevronDown, ClipboardCheck, Plus, Star, Target, TrendingUp } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, PageHeader, Stat, ToneBadge, fieldClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHrCatalog } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { CYCLE_STATUS_LABEL, DEFAULT_CRITERIA } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { currentPeriod, formatDate } from "@/lib/utils";
import { createCycle } from "@/server/performance-actions";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("performance.view");
  const { lang, t } = await getI18n();
  const canCreate = can(user, "performance.create");
  const [cycles, catalog] = await Promise.all([
    prisma.reviewCycle.findMany({
      where: { companyId: user.companyId },
      include: { reviews: { select: { status: true, overall: true } } },
      orderBy: [{ status: "desc" }, { periodEnd: "desc" }],
    }),
    canCreate ? getHrCatalog(user.companyId) : null,
  ]);
  const open = cycles.filter((cycle) => cycle.status === "OPEN");
  const openReviews = open.flatMap((cycle) => cycle.reviews);
  const done = openReviews.filter((review) => review.status === "DONE").length;
  const scored = cycles.flatMap((cycle) => cycle.reviews).filter((review) => review.status === "DONE" && review.overall !== null);
  const average = scored.length ? Math.round((scored.reduce((sum, review) => sum + review.overall!, 0) / scored.length) * 10) / 10 : null;
  const { year, month } = currentPeriod();
  const half = month <= 6 ? 1 : 2;
  const defaultName = t(`تقييم ${half === 1 ? "النصف الأول" : "النصف الثاني"} ${year}`, `${half === 1 ? "H1" : "H2"} ${year} review`);
  const defaultStart = `${year}-${half === 1 ? "01" : "07"}-01`;
  const defaultEnd = `${year}-${half === 1 ? "06-30" : "12-31"}`;

  return (
    <div className="page-wide">
      <PageHeader
        icon={Target}
        title={t("تقييم الأداء", "Performance reviews")}
        description={t(
          "جولات تقييم دورية بمعايير من 1 إلى 5، مع ملخص من ملف الموظف (الحضور والمهام والملاحظات والخطابات) وصياغة بالذكاء الاصطناعي، وأهداف للفترة القادمة تُشارك مع الموظف في بوابته.",
          "Regular review rounds scored 1–5 per criterion, with facts from the employee's file (attendance, tasks, notes, letters), AI-drafted wording, and goals for the next period shared in the employee portal.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat icon={ClipboardCheck} label={t("جولات مفتوحة", "Open rounds")} value={String(open.length)} />
        <Stat icon={TrendingUp} tone="navy" label={t("مكتمل في الجولات المفتوحة", "Completed in open rounds")} value={`${done} / ${openReviews.length}`} />
        <div className="col-span-2 sm:col-span-1">
          <Stat icon={Star} tone="gold" label={t("متوسط التقييمات المعتمدة", "Average of completed reviews")} value={average !== null ? `${average} / 5` : "—"} />
        </div>
      </div>

      {catalog ? (
        <details open={cycles.length === 0} className="group mb-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-3 font-bold text-slate-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={18} />
              </span>
              {t("بدء جولة تقييم", "Start a review round")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <form action={createCycle} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:grid-cols-2 sm:px-5">
            <Field label={t("اسم الجولة", "Round name")}>
              <input name="name" required maxLength={120} defaultValue={defaultName} className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("الموظفون", "Employees")}>
              <select name="departmentId" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">{t("كل الموظفين النشطين", "All active employees")}</option>
                {catalog.departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t("قسم", "Department")}: {lang === "en" && item.nameEn ? item.nameEn : item.nameAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("بداية الفترة", "Period start")}>
              <input name="periodStart" type="date" required defaultValue={defaultStart} className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("نهاية الفترة", "Period end")}>
              <input name="periodEnd" type="date" required defaultValue={defaultEnd} className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("آخر موعد لإنهاء التقييمات", "Due date")}>
              <input name="dueDate" type="date" className={`${fieldClass} w-full`} />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-700">{t("المعايير (كل معيار من 1 إلى 5)", "Criteria (each scored 1–5)")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEFAULT_CRITERIA.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-200">
                    <input type="checkbox" name="criteria" value={item.key} defaultChecked className="size-4 accent-teal-700" />
                    {lang === "en" ? item.en : item.ar}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Field label={t("معايير إضافية (سطر لكل معيار، حتى 5)", "Extra criteria (one per line, up to 5)")}>
                <textarea name="extraCriteria" rows={2} maxLength={500} className={`${fieldClass} w-full`} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton className="w-full sm:w-auto">{t("بدء الجولة", "Start round")}</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      {cycles.length === 0 ? (
        <EmptyState icon={Target} title={t("لا توجد جولات تقييم بعد", "No review rounds yet")} text={t("ابدأ جولة لنصف السنة أو السنة، ويُضاف لها الموظفون النشطون تلقائياً.", "Start a half-year or annual round; active employees are added automatically.")} />
      ) : (
        <ul className="space-y-3">
          {cycles.map((cycle) => {
            const total = cycle.reviews.length;
            const finished = cycle.reviews.filter((review) => review.status === "DONE");
            const percent = total ? Math.round((finished.length / total) * 100) : 0;
            const avg = finished.filter((review) => review.overall !== null);
            const mean = avg.length ? Math.round((avg.reduce((sum, review) => sum + review.overall!, 0) / avg.length) * 10) / 10 : null;
            return (
              <li key={cycle.id}>
                <Link href={`/performance/${cycle.id}`} className="block rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raised sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-900">{cycle.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)}
                        {cycle.dueDate ? ` · ${t("الموعد", "due")} ${formatDate(cycle.dueDate)}` : ""}
                      </p>
                    </div>
                    <ToneBadge tone={cycle.status === "OPEN" ? "green" : "slate"}>{pick(CYCLE_STATUS_LABEL[cycle.status], lang, cycle.status)}</ToneBadge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-teal-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="tabular shrink-0 text-xs font-semibold text-slate-600">
                      {finished.length}/{total}
                      {mean !== null ? ` · ${t("المتوسط", "avg")} ${mean}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {cycles.length ? <Card className="mt-5 text-xs leading-6 text-slate-500">{t("الدرجات: 1 ضعيف · 2 يحتاج تحسين · 3 يلبي التوقعات · 4 يفوق التوقعات · 5 متميز.", "Scale: 1 poor · 2 needs improvement · 3 meets expectations · 4 exceeds expectations · 5 outstanding.")}</Card> : null}
    </div>
  );
}
