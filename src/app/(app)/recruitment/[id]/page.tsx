import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Link2, Pencil, Sparkles, Star, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { JobForm } from "@/components/job-form";
import { ShareLetter } from "@/components/share-letter";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { muscatDateTime } from "@/lib/clock";
import { getHrCatalog } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STAGES, EMPLOYMENT_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE, SOURCE_LABEL, STAGES, STAGE_LABEL, STAGE_TONE, applyUrl, scoreTone } from "@/lib/recruitment";
import { requestOrigin } from "@/lib/request-origin";
import { cn, formatDate, money } from "@/lib/utils";
import { addCandidate, deleteJob, moveCandidate, saveJob, screenJobCandidates, setApplyLink } from "@/server/recruitment-actions";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string; error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("recruitment.view");
  const { lang, t } = await getI18n();
  const job = await prisma.jobOpening.findFirst({
    where: { id, companyId: user.companyId },
    include: { candidates: { orderBy: [{ createdAt: "desc" }] } },
  });
  if (!job) notFound();
  const allow = { create: can(user, "recruitment.create"), edit: can(user, "recruitment.edit"), remove: can(user, "recruitment.delete") };
  const catalog = allow.edit ? await getHrCatalog(user.companyId) : null;
  const stage = (STAGES as readonly string[]).includes(sp.stage || "") ? sp.stage! : sp.stage === "all" ? "all" : "active";
  const shown = job.candidates
    .filter((item) => (stage === "all" ? true : stage === "active" ? ACTIVE_STAGES.includes(item.stage) : item.stage === stage))
    .sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1) || b.createdAt.getTime() - a.createdAt.getTime());
  const unscreened = job.candidates.filter((item) => !item.aiAt && item.cvUrl && ACTIVE_STAGES.includes(item.stage)).length;
  const title = lang === "en" && job.titleEn ? job.titleEn : job.title;
  const department = lang === "en" && job.departmentEn ? job.departmentEn : job.department;
  const link = job.applyToken ? applyUrl(await requestOrigin(), job.applyToken) : null;
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;
  const base = `/recruitment/${job.id}`;
  const filters = [
    { id: "active", label: t("قيد الإجراء", "In progress"), count: job.candidates.filter((item) => ACTIVE_STAGES.includes(item.stage)).length },
    ...STAGES.map((value) => ({ id: value, label: pick(STAGE_LABEL[value], lang), count: job.candidates.filter((item) => item.stage === value).length })),
    { id: "all", label: t("الكل", "All"), count: job.candidates.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل الشواغر", "All vacancies")}
      </Link>
      <div className="flex animate-fade-up flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[department, pick(EMPLOYMENT_LABEL[job.employmentType], lang), job.location, t(`${job.openings} مطلوب`, `${job.openings} opening(s)`)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ToneBadge tone={JOB_STATUS_TONE[job.status] || "slate"}>{pick(JOB_STATUS_LABEL[job.status], lang, job.status)}</ToneBadge>
      </div>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {allow.create ? (
            <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card" open={job.candidates.length === 0}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
                <span className="flex items-center gap-3 font-bold text-slate-900">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                    <UserPlus size={18} />
                  </span>
                  {t("إضافة مرشح", "Add a candidate")}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              <form action={addCandidate} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:grid-cols-2 sm:px-5">
                <input type="hidden" name="jobId" value={job.id} />
                <Field label={t("الاسم الكامل", "Full name")} hint={t("يُقرأ من السيرة إن تُرك فارغاً", "Read from the CV if left empty")}>
                  <input name="fullName" maxLength={120} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("السيرة الذاتية (PDF أو صورة، حتى 4 ميغابايت)", "CV (PDF or image, up to 4 MB)")}>
                  <input name="cv" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("البريد الإلكتروني", "Email")}>
                  <input name="email" type="email" maxLength={120} dir="ltr" className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("الهاتف", "Phone")}>
                  <input name="phone" type="tel" maxLength={30} dir="ltr" placeholder="+968 9xxxxxxx" className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("المسمى الحالي", "Current title")}>
                  <input name="currentTitle" maxLength={120} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("سنوات الخبرة", "Years of experience")}>
                  <input name="experienceYears" type="number" min={0} max={60} step="0.5" className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t(`الراتب المتوقع (${user.company.currency})`, `Expected salary (${user.company.currency})`)}>
                  <input name="expectedSalary" type="number" min={0} step="0.001" className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("ملاحظات", "Notes")}>
                  <input name="notes" maxLength={2000} className={`${fieldClass} w-full`} />
                </Field>
                {allow.edit ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                    <input type="checkbox" name="screen" value="1" defaultChecked className="size-4 accent-teal-700" />
                    {t("قيّم السيرة بالذكاء الاصطناعي فور الإضافة", "Screen the CV with AI right away")}
                  </label>
                ) : null}
                <div className="sm:col-span-2">
                  <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإضافة والتقييم...", "Adding and screening...")}>
                    {t("إضافة المرشح", "Add candidate")}
                  </SubmitButton>
                </div>
              </form>
            </details>
          ) : null}

          <Card>
            <SectionTitle
              hint={t("مرتبون حسب تقييم الذكاء الاصطناعي ثم الأحدث", "Sorted by AI match, then newest")}
              action={
                allow.edit && unscreened ? (
                  <form action={screenJobCandidates}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <SubmitButton variant="secondary" pendingLabel={t("جارٍ التقييم...", "Screening...")}>
                      <Sparkles size={16} className="text-gold-600" />
                      {t(`تقييم ${unscreened} سيرة بالذكاء الاصطناعي`, `Screen ${unscreened} CV(s) with AI`)}
                    </SubmitButton>
                  </form>
                ) : null
              }
            >
              {t("المرشحون", "Candidates")}
            </SectionTitle>
            <nav className="-mx-1 mb-4 overflow-x-auto px-1 pb-1" aria-label={t("مراحل التوظيف", "Hiring stages")}>
              <div className="segmented flex-nowrap">
                {filters.map((item) => (
                  <Link key={item.id} href={`${base}?stage=${item.id}`} aria-current={item.id === stage ? "page" : undefined}>
                    {item.label}
                    {item.count ? (
                      <span className={cn("tabular rounded-full px-1.5 text-xs leading-5", item.id === stage ? "bg-teal-50 text-teal-800" : "bg-white/70 text-slate-500")}>{item.count}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </nav>
            {shown.length === 0 ? (
              <EmptyState icon={Users} title={t("لا مرشحين هنا", "No candidates here")} text={t("أضف مرشحاً أو شارك رابط التقديم.", "Add a candidate or share the apply link.")} />
            ) : (
              <ul className="space-y-3">
                {shown.map((candidate) => (
                  <li key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/recruitment/candidates/${candidate.id}`} className="break-words font-bold text-slate-900 hover:text-teal-700">
                          {candidate.fullName}
                        </Link>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {[
                            candidate.currentTitle,
                            candidate.experienceYears !== null ? t(`${candidate.experienceYears} سنة خبرة`, `${candidate.experienceYears} yrs experience`) : null,
                            candidate.expectedSalary ? t(`يتوقع ${money(candidate.expectedSalary, user.company.currency)}`, `expects ${money(candidate.expectedSalary, user.company.currency)}`) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || pick(SOURCE_LABEL[candidate.source], lang, candidate.source)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {candidate.aiScore !== null ? (
                          <ToneBadge tone={scoreTone(candidate.aiScore)}>
                            <Sparkles size={12} /> {candidate.aiScore}%
                          </ToneBadge>
                        ) : null}
                        {candidate.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gold-700" aria-label={t(`تقييمك ${candidate.rating} من 5`, `Your rating ${candidate.rating} of 5`)}>
                            <Star size={13} className="fill-current" /> {candidate.rating}
                          </span>
                        ) : null}
                        <ToneBadge tone={STAGE_TONE[candidate.stage] || "slate"}>{pick(STAGE_LABEL[candidate.stage], lang, candidate.stage)}</ToneBadge>
                      </div>
                    </div>
                    {candidate.aiSummary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{candidate.aiSummary}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        {t("تقدّم", "Applied")} {formatDate(candidate.createdAt)}
                        {candidate.interviewAt ? ` · ${t("مقابلة", "interview")} ${muscatDateTime(candidate.interviewAt)}` : ""}
                      </p>
                      {allow.edit && candidate.stage !== "HIRED" ? (
                        <form action={moveCandidate} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={candidate.id} />
                          <input type="hidden" name="returnTo" value={`${base}?stage=${stage}`} />
                          <select name="stage" defaultValue={candidate.stage} aria-label={t("المرحلة", "Stage")} className={fieldClass}>
                            {STAGES.filter((value) => value !== "HIRED").map((value) => (
                              <option key={value} value={value}>
                                {pick(STAGE_LABEL[value], lang)}
                              </option>
                            ))}
                          </select>
                          <SubmitButton variant="secondary">{t("نقل", "Move")}</SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card id="share" className="scroll-mt-20">
            <SectionTitle hint={t("يفتح بلا تسجيل دخول؛ يرفع المتقدم سيرته ويظهر هنا مباشرة.", "Opens without signing in; the applicant uploads a CV and appears here.")}>
              <span className="inline-flex items-center gap-2">
                <Link2 size={17} className="text-teal-700" />
                {t("رابط التقديم", "Apply link")}
              </span>
            </SectionTitle>
            {link ? (
              <>
                <p className="mb-3 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-100" dir="ltr">
                  {link}
                </p>
                <ShareLetter
                  url={link}
                  phone={null}
                  email={null}
                  subject={t(`وظيفة شاغرة: ${job.title} — ${companyName}`, `Vacancy: ${title} — ${companyName}`)}
                  message={t(`${companyName} تعلن عن وظيفة شاغرة: ${job.title}. للتقديم: ${link}`, `${companyName} is hiring: ${title}. Apply here: ${link}`)}
                  openLabel={t("فتح الصفحة", "Open page")}
                />
                {job.status !== "OPEN" ? <p className="mt-2 text-xs font-semibold text-amber-700">{t("الشاغر ليس مفتوحاً، فالرابط لا يقبل طلبات الآن.", "The vacancy is not open, so the link takes no applications now.")}</p> : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">{t("لا يوجد رابط تقديم لهذا الشاغر.", "This vacancy has no apply link.")}</p>
            )}
            {allow.edit ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <form action={setApplyLink} className={link ? undefined : "col-span-2"}>
                  <input type="hidden" name="id" value={job.id} />
                  <input type="hidden" name="mode" value="renew" />
                  <SubmitButton variant="secondary" className="w-full" confirm={link ? t("إنشاء رابط جديد؟ سيتوقف الرابط الحالي.", "Create a new link? The current one will stop working.") : undefined}>
                    {link ? t("رابط جديد", "New link") : t("إنشاء رابط", "Create link")}
                  </SubmitButton>
                </form>
                {link ? (
                  <form action={setApplyLink}>
                    <input type="hidden" name="id" value={job.id} />
                    <input type="hidden" name="mode" value="off" />
                    <SubmitButton variant="danger" className="w-full">
                      {t("إيقاف الرابط", "Turn off")}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{t("الوصف والمتطلبات", "Description & requirements")}</SectionTitle>
            {job.description ? (
              <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-700">{job.description}</p>
            ) : (
              <p className="text-sm text-slate-500">{t("لم يُكتب وصف. أضفه ليفهم المتقدمون الوظيفة ويُقيَّموا بدقة.", "No description yet. Add one so applicants understand the job and screening is accurate.")}</p>
            )}
            <dl className="mt-3 space-y-1 text-xs text-slate-500">
              {job.salaryMin || job.salaryMax ? (
                <div>
                  {t("نطاق الراتب:", "Salary range:")} {job.salaryMin ? money(job.salaryMin, user.company.currency) : "—"} – {job.salaryMax ? money(job.salaryMax, user.company.currency) : "—"}
                </div>
              ) : null}
              {job.closesAt ? (
                <div>
                  {t("آخر موعد:", "Closes:")} {formatDate(job.closesAt)}
                </div>
              ) : null}
              <div>
                {t("أضافه", "Added by")} {job.createdByName || "—"} · {formatDate(job.createdAt)}
              </div>
            </dl>
          </Card>

          {catalog ? (
            <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-slate-900 transition hover:bg-slate-50/70">
                <span className="flex items-center gap-2">
                  <Pencil size={16} className="text-teal-700" />
                  {t("تعديل الشاغر", "Edit vacancy")}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-100 px-4 py-4">
                <JobForm action={saveJob} lang={lang} jobTitles={catalog.jobTitles} departments={catalog.departments} job={job} currency={user.company.currency} />
              </div>
            </details>
          ) : null}

          {allow.remove ? (
            <form action={deleteJob} className="px-1">
              <input type="hidden" name="id" value={job.id} />
              <SubmitButton variant="link" confirm={t("حذف الشاغر وكل مرشحيه وسيرهم الذاتية؟", "Delete this vacancy with all its candidates and CVs?")}>
                {t("حذف الشاغر", "Delete vacancy")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
