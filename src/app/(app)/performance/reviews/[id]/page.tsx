import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileSearch, Share2, Sparkles } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { termText } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { REVIEW_STATUS_LABEL, SCORE_LABEL, criterionName, overallBand, overallTone, parseCriteria, parseScores, reviewFacts } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { draftReview, saveReview, shareReview } from "@/server/performance-actions";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("performance.view");
  const { lang, t } = await getI18n();
  const review = await prisma.performanceReview.findFirst({
    where: { id, companyId: user.companyId },
    include: { cycle: true, employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true, jobTitle: true, jobTitleEn: true, department: true, departmentEn: true } } },
  });
  if (!review) notFound();
  const criteria = parseCriteria(review.cycle.criteria);
  const scores = parseScores(review.scores);
  const editable = can(user, "performance.edit") && review.cycle.status === "OPEN" && review.status !== "DONE";
  const canReopen = can(user, "performance.edit") && review.cycle.status === "OPEN" && review.status === "DONE";
  const facts = await reviewFacts(review.employeeId, user.companyId, review.cycle.periodStart, review.cycle.periodEnd, lang);
  const name = lang === "en" && review.employee.nameEn ? review.employee.nameEn : review.employee.fullName;
  const band = overallBand(review.overall);
  const textBlock = (label: string, value: string | null) => (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-500">{label}</p>
      <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-800">{value || "—"}</p>
    </div>
  );

  return (
    <div className="page-wide space-y-5">
      <Link href={`/performance/${review.cycleId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {review.cycle.name}
      </Link>
      <div className="flex animate-fade-up flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900">
            <Link href={`/employees/${review.employee.id}`} className="hover:text-teal-700">
              {name}
            </Link>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {[termText(review.employee.jobTitle, review.employee.jobTitleEn, lang), termText(review.employee.department, review.employee.departmentEn, lang), `${formatDate(review.cycle.periodStart)} – ${formatDate(review.cycle.periodEnd)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.overall !== null ? (
            <ToneBadge tone={overallTone(review.overall)}>
              <span className="tabular">{review.overall} / 5</span>
              {band ? ` · ${pick(SCORE_LABEL[band], lang)}` : ""}
            </ToneBadge>
          ) : null}
          <ToneBadge tone={review.status === "DONE" ? "green" : "amber"}>{pick(REVIEW_STATUS_LABEL[review.status], lang, review.status)}</ToneBadge>
        </div>
      </div>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {editable ? (
            <Card>
              <form action={saveReview} className="space-y-5">
                <input type="hidden" name="id" value={review.id} />
                <div className="space-y-3">
                  {criteria.map((item) => (
                    <fieldset key={item.key} className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                      <legend className="px-1 text-sm font-bold text-slate-900">{criterionName(item, lang)}</legend>
                      <div className="mt-1 grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <label
                            key={score}
                            title={pick(SCORE_LABEL[score], lang)}
                            className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 has-[:checked]:bg-teal-700 has-[:checked]:text-white has-[:checked]:ring-teal-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600"
                          >
                            <input type="radio" name={`score_${item.key}`} value={score} defaultChecked={scores[item.key] === score} className="sr-only" />
                            <span className="tabular text-base font-bold leading-5">{score}</span>
                            <span className="hidden text-xs leading-4 opacity-80 sm:block">{pick(SCORE_LABEL[score], lang)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                <Field label={t("نقاط القوة والإنجازات", "Strengths and achievements")}>
                  <textarea name="strengths" rows={4} maxLength={2000} defaultValue={review.strengths || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("مجالات التحسين", "Areas to improve")}>
                  <textarea name="improvements" rows={3} maxLength={2000} defaultValue={review.improvements || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("أهداف الفترة القادمة", "Goals for the next period")}>
                  <textarea name="goals" rows={3} maxLength={2000} defaultValue={review.goals || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("تعليق إضافي (داخلي)", "Additional comment (internal)")} hint={t("لا يظهر للموظف في البوابة.", "Not shown to the employee in the portal.")}>
                  <textarea name="comment" rows={2} maxLength={2000} defaultValue={review.comment || ""} className={`${fieldClass} w-full`} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="draft" variant="secondary">
                    {t("حفظ مسودة", "Save draft")}
                  </SubmitButton>
                  <SubmitButton name="decision" value="finish" confirm={t("اعتماد التقييم؟", "Complete this review?")}>
                    {t("اعتماد التقييم", "Complete review")}
                  </SubmitButton>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="space-y-4">
              <ul className="grid gap-2 sm:grid-cols-2">
                {criteria.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-100">
                    <span className="min-w-0 text-slate-700">{criterionName(item, lang)}</span>
                    <span className="tabular shrink-0 font-bold text-slate-900">{scores[item.key] ? `${scores[item.key]} / 5` : "—"}</span>
                  </li>
                ))}
              </ul>
              {textBlock(t("نقاط القوة والإنجازات", "Strengths and achievements"), review.strengths)}
              {textBlock(t("مجالات التحسين", "Areas to improve"), review.improvements)}
              {textBlock(t("أهداف الفترة القادمة", "Goals for the next period"), review.goals)}
              {review.comment ? textBlock(t("تعليق داخلي", "Internal comment"), review.comment) : null}
              <p className="text-xs text-slate-400">
                {review.reviewerName ? `${t("المقيّم", "Reviewer")}: ${review.reviewerName}` : ""}
                {review.completedAt ? ` · ${t("اعتُمد", "completed")} ${formatDate(review.completedAt)}` : ""}
              </p>
              {canReopen ? (
                <form action={saveReview}>
                  <input type="hidden" name="id" value={review.id} />
                  {criteria.map((item) => (scores[item.key] ? <input key={item.key} type="hidden" name={`score_${item.key}`} value={scores[item.key]} /> : null))}
                  <input type="hidden" name="strengths" value={review.strengths || ""} />
                  <input type="hidden" name="improvements" value={review.improvements || ""} />
                  <input type="hidden" name="goals" value={review.goals || ""} />
                  <input type="hidden" name="comment" value={review.comment || ""} />
                  <SubmitButton name="decision" value="draft" variant="secondary" confirm={t("إعادة التقييم إلى المسودة للتعديل؟ سيُخفى من البوابة.", "Move back to draft to edit? It will be hidden from the portal.")}>
                    {t("تعديل التقييم", "Edit review")}
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {editable ? (
            <Card>
              <SectionTitle hint={t("يكتب نقاط القوة والتحسين والأهداف من ملف الموظف في الحقول الفارغة فقط.", "Writes strengths, improvements and goals from the employee's file into empty fields only.")}>
                {t("صياغة بالذكاء الاصطناعي", "Draft with AI")}
              </SectionTitle>
              <form action={draftReview}>
                <input type="hidden" name="id" value={review.id} />
                <SubmitButton variant="secondary" className="w-full" pendingLabel={t("جارٍ الصياغة...", "Drafting...")}>
                  <Sparkles size={16} className="text-gold-600" />
                  {t("اكتب مسودة", "Write a draft")}
                </SubmitButton>
              </form>
            </Card>
          ) : null}
          {review.status === "DONE" && can(user, "performance.edit") ? (
            <Card>
              <SectionTitle hint={t("يرى الموظف الدرجات ونقاط القوة والتحسين والأهداف في بوابته، دون التعليق الداخلي.", "The employee sees scores, strengths, improvements and goals in the portal, not the internal comment.")}>
                {t("المشاركة مع الموظف", "Share with the employee")}
              </SectionTitle>
              <form action={shareReview}>
                <input type="hidden" name="id" value={review.id} />
                <SubmitButton variant={review.sharedAt ? "danger" : "primary"} className="w-full">
                  <Share2 size={16} />
                  {review.sharedAt ? t("إخفاء من البوابة", "Hide from portal") : t("إظهار في بوابة الموظف", "Show in employee portal")}
                </SubmitButton>
              </form>
              {review.sharedAt ? <p className="mt-2 text-xs text-slate-500">{t(`مُشارك منذ ${formatDate(review.sharedAt)}`, `Shared since ${formatDate(review.sharedAt)}`)}</p> : null}
            </Card>
          ) : null}
          <Card>
            <SectionTitle hint={t("من ملف الموظف خلال فترة التقييم", "From the employee's file in the review period")}>
              <span className="inline-flex items-center gap-2">
                <FileSearch size={17} className="text-teal-700" />
                {t("حقائق الفترة", "Period facts")}
              </span>
            </SectionTitle>
            <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
              {facts.map((fact, index) => (
                <li key={index} className="break-words">
                  • {fact}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
