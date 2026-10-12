import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, SectionTitle, ToneBadge } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { termText } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { CYCLE_STATUS_LABEL, REVIEW_STATUS_LABEL, SCORE_LABEL, criterionName, overallBand, overallTone, parseCriteria } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { cn, formatDate } from "@/lib/utils";
import { addMissingEmployees, deleteCycle, setCycleStatus } from "@/server/performance-actions";

export default async function CyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string; error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("performance.view");
  const { lang, t } = await getI18n();
  const cycle = await prisma.reviewCycle.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      reviews: {
        include: { employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true, department: true, departmentEn: true, jobTitle: true, jobTitleEn: true } } },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });
  if (!cycle) notFound();
  const allow = { create: can(user, "performance.create"), edit: can(user, "performance.edit"), remove: can(user, "performance.delete") };
  const criteria = parseCriteria(cycle.criteria);
  const show = sp.show === "DONE" || sp.show === "DRAFT" ? sp.show : "all";
  const rows = cycle.reviews.filter((review) => show === "all" || review.status === show);
  const done = cycle.reviews.filter((review) => review.status === "DONE");
  const bands = [5, 4, 3, 2, 1].map((band) => ({ band, count: done.filter((review) => overallBand(review.overall) === band).length }));
  const maxBand = Math.max(1, ...bands.map((item) => item.count));
  const name = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

  return (
    <div className="page-wide space-y-5">
      <Link href="/performance" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل الجولات", "All rounds")}
      </Link>
      <div className="flex animate-fade-up flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900">{cycle.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)}
            {cycle.dueDate ? ` · ${t("الموعد", "due")} ${formatDate(cycle.dueDate)}` : ""} · {criteria.map((item) => criterionName(item, lang)).join("، ")}
          </p>
        </div>
        <ToneBadge tone={cycle.status === "OPEN" ? "green" : "slate"}>{pick(CYCLE_STATUS_LABEL[cycle.status], lang, cycle.status)}</ToneBadge>
      </div>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <SectionTitle hint={t(`${done.length} من ${cycle.reviews.length} مكتمل`, `${done.length} of ${cycle.reviews.length} completed`)}>{t("الموظفون", "Employees")}</SectionTitle>
          <nav className="segmented mb-4" aria-label={t("تصفية", "Filter")}>
            {[
              { id: "all", label: t("الكل", "All") },
              { id: "DRAFT", label: pick(REVIEW_STATUS_LABEL.DRAFT, lang) },
              { id: "DONE", label: pick(REVIEW_STATUS_LABEL.DONE, lang) },
            ].map((item) => (
              <Link key={item.id} href={`/performance/${cycle.id}?show=${item.id}`} aria-current={item.id === show ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="table-shell">
            <table className="table-stack w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-start text-xs text-slate-500">
                  <th className="px-3 py-2 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="hidden px-3 py-2 text-start font-medium xl:table-cell">{t("القسم", "Department")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("النتيجة", "Score")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((review) => (
                  <tr key={review.id}>
                    <td className="cell-title px-3 py-2.5" data-label={t("الموظف", "Employee")}>
                      <span className="font-semibold text-slate-900">{name(review.employee)}</span>
                      <span className="block text-xs text-slate-500">{termText(review.employee.jobTitle, review.employee.jobTitleEn, lang) || review.employee.employeeNumber}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-600 xl:table-cell" data-label={t("القسم", "Department")}>
                      {termText(review.employee.department, review.employee.departmentEn, lang) || "—"}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الحالة", "Status")}>
                      <ToneBadge tone={review.status === "DONE" ? "green" : "amber"}>{pick(REVIEW_STATUS_LABEL[review.status], lang, review.status)}</ToneBadge>
                      {review.sharedAt ? <span className="ms-1.5 text-xs text-slate-400">{t("مُشارك", "shared")}</span> : null}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("النتيجة", "Score")}>
                      {review.overall !== null ? (
                        <ToneBadge tone={overallTone(review.overall)}>
                          <span className="tabular">{review.overall}</span> · {pick(SCORE_LABEL[overallBand(review.overall)!], lang)}
                        </ToneBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cell-actions px-3 py-2.5 text-end">
                      <Link href={`/performance/reviews/${review.id}`} className="text-sm font-semibold text-teal-800 hover:underline">
                        {allow.edit && cycle.status === "OPEN" && review.status !== "DONE" ? t("تقييم", "Review") : t("عرض", "View")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle>{t("توزيع النتائج", "Score distribution")}</SectionTitle>
            <ul className="space-y-2">
              {bands.map((item) => (
                <li key={item.band} className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-slate-600">{pick(SCORE_LABEL[item.band], lang)}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <span className={cn("block h-full rounded-full", item.band >= 4 ? "bg-emerald-500" : item.band === 3 ? "bg-teal-500" : item.band === 2 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${(item.count / maxBand) * 100}%` }} />
                  </span>
                  <span className="tabular text-end font-semibold text-slate-800">{item.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          {allow.edit || allow.create || allow.remove ? (
            <Card className="space-y-2">
              {allow.create && cycle.status === "OPEN" ? (
                <form action={addMissingEmployees}>
                  <input type="hidden" name="id" value={cycle.id} />
                  <SubmitButton variant="secondary" className="w-full">
                    {t("إضافة الموظفين الجدد", "Add new employees")}
                  </SubmitButton>
                </form>
              ) : null}
              {allow.edit ? (
                <form action={setCycleStatus}>
                  <input type="hidden" name="id" value={cycle.id} />
                  <SubmitButton variant="secondary" className="w-full" confirm={cycle.status === "OPEN" ? t("إغلاق الجولة؟ لن تُعدّل التقييمات بعدها.", "Close this round? Reviews can no longer be edited.") : undefined}>
                    {cycle.status === "OPEN" ? t("إغلاق الجولة", "Close round") : t("إعادة فتح الجولة", "Reopen round")}
                  </SubmitButton>
                </form>
              ) : null}
              {allow.remove ? (
                <form action={deleteCycle} className="pt-1">
                  <input type="hidden" name="id" value={cycle.id} />
                  <SubmitButton variant="link" confirm={t("حذف الجولة وكل تقييماتها نهائياً؟", "Delete this round and all its reviews for good?")}>
                    {t("حذف الجولة", "Delete round")}
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
