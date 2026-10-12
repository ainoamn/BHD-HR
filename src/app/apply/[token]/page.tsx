import type { Metadata } from "next";
import { BriefcaseBusiness, CircleCheck, MapPin, ShieldOff } from "lucide-react";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { Card, fieldClass } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { EMPLOYMENT_LABEL } from "@/lib/recruitment";
import { formatDate } from "@/lib/utils";
import { submitApplication } from "@/server/apply-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public application form for one vacancy, opened from the shared link; no sign-in. */
export default async function ApplyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const job = token.length >= 20 ? await prisma.jobOpening.findUnique({ where: { applyToken: token }, include: { company: true } }) : null;
  const closed = !job || job.status !== "OPEN" || (job.closesAt !== null && job.closesAt.getTime() + 86400000 < Date.now());
  if (!job || closed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
        <Card className="text-center">
          <ShieldOff size={32} className="mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t("التقديم على هذه الوظيفة مغلق", "Applications for this job are closed")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("ربما شُغلت الوظيفة أو انتهى موعد التقديم.", "The position may be filled or the closing date has passed.")}</p>
        </Card>
      </main>
    );
  }
  const company = job.company;
  const logo = await inlineLogo(company.logoUrl, company.id);
  const companyName = lang === "en" && company.nameEn ? company.nameEn : company.name;
  const title = lang === "en" && job.titleEn ? job.titleEn : job.title;
  const department = lang === "en" && job.departmentEn ? job.departmentEn : job.department;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-slate-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-2xl items-start justify-between gap-3 px-4 pb-7 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1" /> : null}
            <div className="min-w-0">
              <p className="truncate text-xs text-white/70">{companyName}</p>
              <h1 className="break-words text-xl font-bold leading-tight">{title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/75">
                <span className="inline-flex items-center gap-1">
                  <BriefcaseBusiness size={13} />
                  {[department, pick(EMPLOYMENT_LABEL[job.employmentType], lang)].filter(Boolean).join(" · ")}
                </span>
                {job.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} />
                    {job.location}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {sp.done ? (
          <Card className="text-center">
            <CircleCheck size={36} className="mx-auto text-emerald-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-900">{t("وصل طلبك، شكراً لك", "Your application was received — thank you")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(`سيتواصل معك فريق ${companyName} إن تناسبت خبرتك مع الوظيفة.`, `The ${companyName} team will contact you if your experience fits the role.`)}</p>
          </Card>
        ) : (
          <>
            <Flash error={sp.error} />
            {job.description ? (
              <Card>
                <h2 className="mb-2 font-bold text-slate-900">{t("عن الوظيفة", "About the job")}</h2>
                <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-700">{job.description}</p>
                {job.closesAt ? <p className="mt-3 text-xs text-slate-500">{t(`آخر موعد للتقديم ${formatDate(job.closesAt)}`, `Apply by ${formatDate(job.closesAt)}`)}</p> : null}
              </Card>
            ) : null}
            <Card>
              <h2 className="mb-3 font-bold text-slate-900">{t("قدّم الآن", "Apply now")}</h2>
              <form action={submitApplication} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="token" value={token} />
                <div className="hidden" aria-hidden="true">
                  <label>
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("الاسم الكامل", "Full name")}</span>
                  <input name="fullName" required minLength={3} maxLength={120} autoComplete="name" className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t("البريد الإلكتروني", "Email")}</span>
                  <input name="email" type="email" maxLength={120} autoComplete="email" dir="ltr" className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t("الهاتف", "Phone")}</span>
                  <input name="phone" type="tel" maxLength={30} autoComplete="tel" dir="ltr" placeholder="+968 9xxxxxxx" className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t("مسماك الحالي", "Current job title")}</span>
                  <input name="currentTitle" maxLength={120} className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t("سنوات الخبرة", "Years of experience")}</span>
                  <input name="experienceYears" type="number" min={0} max={60} step="0.5" className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("السيرة الذاتية (PDF أو صورة، حتى 4 ميغابايت)", "CV (PDF or image, up to 4 MB)")}</span>
                  <input name="cv" type="file" required accept="application/pdf,image/png,image/jpeg,image/webp" className={`${fieldClass} w-full`} />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("نبذة قصيرة (اختياري)", "A short note (optional)")}</span>
                  <textarea name="coverNote" rows={3} maxLength={1500} className={`${fieldClass} w-full`} />
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                    {t("إرسال الطلب", "Send application")}
                  </SubmitButton>
                </div>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                  {t(`تُرسل بياناتك إلى ${companyName} فقط لغرض هذه الوظيفة.`, `Your details go to ${companyName} only, for this job.`)}
                </p>
              </form>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
