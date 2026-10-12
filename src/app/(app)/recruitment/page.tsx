import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, ChevronDown, Plus, UserCheck, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { JobForm } from "@/components/job-form";
import { Card, EmptyState, PageHeader, SectionTitle, Stat, ToneBadge } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHrCatalog } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STAGES, EMPLOYMENT_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE, STAGES, STAGE_LABEL } from "@/lib/recruitment";
import { muscatDateTime } from "@/lib/clock";
import { cn, formatDate } from "@/lib/utils";
import { saveJob } from "@/server/recruitment-actions";

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("recruitment.view");
  const { lang, t } = await getI18n();
  const filter = sp.status === "all" || sp.status === "CLOSED" ? sp.status : "active";
  const now = new Date();
  const [jobs, interviews, hired, catalog] = await Promise.all([
    prisma.jobOpening.findMany({
      where: { companyId: user.companyId, ...(filter === "active" ? { status: { not: "CLOSED" } } : filter === "CLOSED" ? { status: "CLOSED" } : {}) },
      include: { candidates: { select: { stage: true, aiScore: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.candidate.findMany({
      where: { companyId: user.companyId, stage: { in: [...ACTIVE_STAGES] }, interviewAt: { gte: new Date(now.getTime() - 3600000), lt: new Date(now.getTime() + 14 * 86400000) } },
      select: { id: true, fullName: true, interviewAt: true, job: { select: { title: true, titleEn: true } } },
      orderBy: { interviewAt: "asc" },
      take: 10,
    }),
    prisma.candidate.count({ where: { companyId: user.companyId, stage: "HIRED", updatedAt: { gte: new Date(now.getTime() - 90 * 86400000) } } }),
    can(user, "recruitment.create") ? getHrCatalog(user.companyId) : null,
  ]);
  const openJobs = jobs.filter((job) => job.status === "OPEN").length;
  const inPipeline = jobs.reduce((sum, job) => sum + job.candidates.filter((item) => ACTIVE_STAGES.includes(item.stage)).length, 0);
  const jobTitle = (job: { title: string; titleEn: string | null }) => (lang === "en" && job.titleEn ? job.titleEn : job.title);

  return (
    <div className="page-wide">
      <PageHeader
        icon={UserPlus}
        title={t("التوظيف", "Recruitment")}
        description={t(
          "الشواغر والمتقدمون من الإعلان حتى التعيين: رابط تقديم تشاركه، تقييم السير الذاتية بالذكاء الاصطناعي، المقابلات، ثم تحويل المرشح إلى موظف بضغطة.",
          "Vacancies and applicants from posting to hiring: a shareable apply link, AI CV screening, interviews, then turning the candidate into an employee in one step.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={BriefcaseBusiness} label={t("شواغر مفتوحة", "Open vacancies")} value={String(openJobs)} />
        <Stat icon={Users} tone="navy" label={t("مرشحون قيد الإجراء", "Candidates in progress")} value={String(inPipeline)} />
        <Stat icon={CalendarClock} tone="amber" label={t("مقابلات خلال أسبوعين", "Interviews in 2 weeks")} value={String(interviews.length)} />
        <Stat icon={UserCheck} tone="gold" label={t("عُيّنوا آخر 90 يوماً", "Hired in 90 days")} value={String(hired)} />
      </div>

      {catalog ? (
        <details open={jobs.length === 0} className="group mb-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-3 font-bold text-slate-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={18} />
              </span>
              {t("إضافة شاغر", "Add a vacancy")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-5">
            <JobForm action={saveJob} lang={lang} jobTitles={catalog.jobTitles} departments={catalog.departments} currency={user.company.currency} />
          </div>
        </details>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <nav className="segmented mb-3" aria-label={t("تصفية الشواغر", "Filter vacancies")}>
            {[
              { id: "active", label: t("الحالية", "Current") },
              { id: "CLOSED", label: t("المغلقة", "Closed") },
              { id: "all", label: t("الكل", "All") },
            ].map((item) => (
              <Link key={item.id} href={`/recruitment?status=${item.id}`} aria-current={item.id === filter ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          {jobs.length === 0 ? (
            <EmptyState icon={BriefcaseBusiness} title={t("لا شواغر هنا", "No vacancies here")} text={t("أضف شاغراً، ثم شارك رابط التقديم أو أضف المرشحين بنفسك.", "Add a vacancy, then share the apply link or add candidates yourself.")} />
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => {
                const counts = STAGES.map((stage) => ({ stage, count: job.candidates.filter((item) => item.stage === stage).length }));
                const department = lang === "en" && job.departmentEn ? job.departmentEn : job.department;
                return (
                  <li key={job.id}>
                    <Link
                      href={`/recruitment/${job.id}`}
                      className="block rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raised sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-base font-bold text-slate-900">{jobTitle(job)}</p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {[department, pick(EMPLOYMENT_LABEL[job.employmentType], lang), job.location, t(`${job.openings} مطلوب`, `${job.openings} opening(s)`)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <ToneBadge tone={JOB_STATUS_TONE[job.status] || "slate"}>{pick(JOB_STATUS_LABEL[job.status], lang, job.status)}</ToneBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                        {counts.map(({ stage, count }) => (
                          <div key={stage} className={cn("rounded-lg px-2 py-1.5 text-center ring-1 ring-inset", count ? "bg-teal-50/60 ring-teal-100" : "bg-slate-50 ring-slate-100")}>
                            <p className="tabular text-sm font-bold text-slate-900">{count}</p>
                            <p className="truncate text-xs text-slate-500">{pick(STAGE_LABEL[stage], lang)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {t("أُضيف", "Added")} {formatDate(job.createdAt)}
                        {job.closesAt ? ` · ${t("يغلق", "closes")} ${formatDate(job.closesAt)}` : ""}
                        {job.applyToken ? ` · ${t("رابط التقديم مفعّل", "apply link on")}` : ""}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Card className="h-fit">
          <SectionTitle>{t("المقابلات القادمة", "Upcoming interviews")}</SectionTitle>
          {interviews.length === 0 ? (
            <p className="text-sm text-slate-500">{t("لا مقابلات مجدولة خلال أسبوعين.", "No interviews in the next two weeks.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {interviews.map((item) => (
                <li key={item.id}>
                  <Link href={`/recruitment/candidates/${item.id}`} className="block py-2.5 transition hover:text-teal-800">
                    <p className="font-semibold text-slate-900">{item.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {jobTitle(item.job)} · <span className="tabular">{muscatDateTime(item.interviewAt)}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
