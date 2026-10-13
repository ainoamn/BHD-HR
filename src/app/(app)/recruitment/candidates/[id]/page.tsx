import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, FileText, Mail, MessageCircle, Pencil, Phone, Sparkles, UserCheck } from "lucide-react";
import { Tr } from "@/components/ai-translate";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, InfoItem, SectionTitle, ToneBadge, fieldClass, linkAction } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { muscatDateTime, muscatInputValue } from "@/lib/clock";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { formatPhone, phoneHref } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { SOURCE_LABEL, STAGES, STAGE_LABEL, STAGE_TONE, scoreTone } from "@/lib/recruitment";
import { formatDate, money, todayInputValue } from "@/lib/utils";
import { deleteCandidate, hireCandidate, moveCandidate, screenCandidate, updateCandidate } from "@/server/recruitment-actions";

export default async function CandidatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("recruitment.view");
  const { lang, t } = await getI18n();
  const candidate = await prisma.candidate.findFirst({
    where: { id, companyId: user.companyId },
    include: { job: true, employee: { select: { id: true, fullName: true, employeeNumber: true } } },
  });
  if (!candidate) notFound();
  const allow = { edit: can(user, "recruitment.edit"), remove: can(user, "recruitment.delete"), hire: can(user, "recruitment.edit") && can(user, "employees.create"), salary: can(user, "salaries.edit") };
  const currency = user.company.currency;
  const job = candidate.job;
  const jobTitle = lang === "en" && job.titleEn ? job.titleEn : job.title;
  const open = candidate.stage !== "HIRED" && candidate.stage !== "REJECTED";
  const whatsapp = candidate.phone ? `https://wa.me/${candidate.phone.replace(/\D/g, "")}` : null;

  return (
    <div className="page-wide space-y-5">
      <Link href={`/recruitment/${job.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {jobTitle}
      </Link>
      <div className="flex animate-fade-up flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900">{candidate.fullName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[candidate.currentTitle, pick(SOURCE_LABEL[candidate.source], lang, candidate.source), `${t("تقدّم", "applied")} ${formatDate(candidate.createdAt)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ToneBadge tone={STAGE_TONE[candidate.stage] || "slate"}>{pick(STAGE_LABEL[candidate.stage], lang, candidate.stage)}</ToneBadge>
      </div>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle
              hint={t("رأي مساعد يقارن السيرة بمتطلبات الشاغر — القرار لك.", "Advice that compares the CV with the vacancy — the decision is yours.")}
              action={
                allow.edit ? (
                  <form action={screenCandidate}>
                    <input type="hidden" name="id" value={candidate.id} />
                    <SubmitButton variant="secondary" pendingLabel={t("جارٍ القراءة والتقييم...", "Reading and rating...")}>
                      <Sparkles size={16} className="text-gold-600" />
                      {candidate.aiAt ? t("إعادة التقييم", "Re-screen") : t("تقييم بالذكاء الاصطناعي", "Screen with AI")}
                    </SubmitButton>
                  </form>
                ) : null
              }
            >
              {t("تقييم الذكاء الاصطناعي", "AI screening")}
            </SectionTitle>
            {candidate.aiAt && candidate.aiScore !== null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl ring-1 ring-inset ${
                      scoreTone(candidate.aiScore) === "green" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : scoreTone(candidate.aiScore) === "amber" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"
                    }`}
                  >
                    <span className="tabular text-2xl font-bold">{candidate.aiScore}%</span>
                    <span className="text-xs font-semibold">{t("تطابق", "match")}</span>
                  </div>
                  <p className="min-w-0 text-sm leading-7 text-slate-700">{candidate.aiSummary}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-emerald-50/60 p-3 ring-1 ring-inset ring-emerald-100">
                    <p className="mb-1.5 text-xs font-bold text-emerald-800">{t("نقاط القوة", "Strengths")}</p>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {candidate.aiStrengths.length ? candidate.aiStrengths.map((item) => <li key={item}>• {item}</li>) : <li>—</li>}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-amber-50/60 p-3 ring-1 ring-inset ring-amber-100">
                    <p className="mb-1.5 text-xs font-bold text-amber-800">{t("نقاط تحتاج تحقق", "Gaps to check")}</p>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {candidate.aiGaps.length ? candidate.aiGaps.map((item) => <li key={item}>• {item}</li>) : <li>—</li>}
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {t("قُيّم", "Screened")} {muscatDateTime(candidate.aiAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {candidate.cvUrl
                  ? t("لم تُقيَّم السيرة بعد. اضغط «تقييم بالذكاء الاصطناعي».", "Not screened yet. Press “Screen with AI”.")
                  : t("أرفق السيرة الذاتية من «تعديل البيانات» ليُقيّمها الذكاء الاصطناعي.", "Attach the CV under “Edit details” so AI can screen it.")}
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>{t("البيانات", "Details")}</SectionTitle>
            <dl className="grid gap-2 sm:grid-cols-2">
              <InfoItem
                label={t("البريد", "Email")}
                value={
                  candidate.email ? (
                    <a href={`mailto:${candidate.email}`} className="break-all text-teal-800 hover:underline" dir="ltr">
                      {candidate.email}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoItem
                label={t("الهاتف", "Phone")}
                value={
                  candidate.phone ? (
                    <a href={phoneHref(candidate.phone)} className="text-teal-800 hover:underline" dir="ltr">
                      {formatPhone(candidate.phone)}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoItem label={t("سنوات الخبرة", "Experience")} value={candidate.experienceYears !== null ? t(`${candidate.experienceYears} سنة`, `${candidate.experienceYears} years`) : "—"} />
              <InfoItem label={t("الراتب المتوقع", "Expected salary")} value={candidate.expectedSalary ? money(candidate.expectedSalary, currency) : "—"} />
              <InfoItem label={t("موعد المقابلة", "Interview")} value={candidate.interviewAt ? muscatDateTime(candidate.interviewAt) : "—"} />
              <InfoItem label={t("تقييمك", "Your rating")} value={candidate.rating ? `${"★".repeat(candidate.rating)}${"☆".repeat(5 - candidate.rating)}` : "—"} />
              {candidate.coverNote ? <InfoItem wide label={t("رسالة المتقدم", "Applicant's note")} value={<span className="whitespace-pre-line">{candidate.coverNote}</span>} /> : null}
              {candidate.notes ? <InfoItem wide label={t("ملاحظات", "Notes")} value={
                    <span className="whitespace-pre-line">
                      <Tr text={candidate.notes} />
                    </span>
                  } /> : null}
              {candidate.rejectReason ? <InfoItem wide label={t("سبب الاستبعاد", "Reason for rejection")} value={candidate.rejectReason} /> : null}
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {candidate.cvUrl ? (
                <a href={candidate.cvUrl} target="_blank" className={linkAction}>
                  <FileText size={15} />
                  {t("فتح السيرة الذاتية", "Open CV")}
                </a>
              ) : null}
              {whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noreferrer" className={linkAction}>
                  <MessageCircle size={15} />
                  {t("واتساب", "WhatsApp")}
                </a>
              ) : null}
              {candidate.email ? (
                <a href={`mailto:${candidate.email}`} className={linkAction}>
                  <Mail size={15} />
                  {t("بريد", "Email")}
                </a>
              ) : null}
              {candidate.phone ? (
                <a href={phoneHref(candidate.phone)} className={linkAction}>
                  <Phone size={15} />
                  {t("اتصال", "Call")}
                </a>
              ) : null}
            </div>
          </Card>

          {allow.edit ? (
            <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-slate-900 transition hover:bg-slate-50/70 sm:px-5">
                <span className="flex items-center gap-2">
                  <Pencil size={16} className="text-teal-700" />
                  {t("تعديل البيانات والمقابلة", "Edit details & interview")}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              <form action={updateCandidate} className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-2 sm:px-5">
                <input type="hidden" name="id" value={candidate.id} />
                <Field label={t("الاسم الكامل", "Full name")}>
                  <input name="fullName" required maxLength={120} defaultValue={candidate.fullName} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("المسمى الحالي", "Current title")}>
                  <input name="currentTitle" maxLength={120} defaultValue={candidate.currentTitle || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("البريد الإلكتروني", "Email")}>
                  <input name="email" type="email" maxLength={120} dir="ltr" defaultValue={candidate.email || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("الهاتف", "Phone")}>
                  <input name="phone" type="tel" maxLength={30} dir="ltr" defaultValue={candidate.phone || ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("سنوات الخبرة", "Years of experience")}>
                  <input name="experienceYears" type="number" min={0} max={60} step="0.5" defaultValue={candidate.experienceYears ?? ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t(`الراتب المتوقع (${currency})`, `Expected salary (${currency})`)}>
                  <input name="expectedSalary" type="number" min={0} step="0.001" defaultValue={candidate.expectedSalary ?? ""} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("موعد المقابلة (توقيت مسقط)", "Interview (Muscat time)")}>
                  <input name="interviewAt" type="datetime-local" defaultValue={muscatInputValue(candidate.interviewAt)} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("تقييمك (1–5)", "Your rating (1–5)")}>
                  <select name="rating" defaultValue={candidate.rating ?? ""} className={`${fieldClass} w-full`}>
                    <option value="">{t("— بلا —", "— None —")}</option>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {"★".repeat(value)} {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("استبدال السيرة الذاتية", "Replace CV")}>
                  <input name="cv" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={`${fieldClass} w-full`} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t("ملاحظات المقابلة والتقييم", "Interview & assessment notes")}>
                    <textarea name="notes" rows={4} maxLength={2000} defaultValue={candidate.notes || ""} className={`${fieldClass} w-full`} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton className="w-full sm:w-auto">{t("حفظ", "Save")}</SubmitButton>
                </div>
              </form>
            </details>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {candidate.employee ? (
            <Card>
              <SectionTitle>{t("تم التعيين", "Hired")}</SectionTitle>
              <Link href={`/employees/${candidate.employee.id}`} className={linkAction}>
                <UserCheck size={15} />
                {candidate.employee.fullName} — {candidate.employee.employeeNumber}
              </Link>
            </Card>
          ) : null}

          {allow.edit && candidate.stage !== "HIRED" ? (
            <Card>
              <SectionTitle>{t("المرحلة", "Stage")}</SectionTitle>
              <form action={moveCandidate} className="space-y-3">
                <input type="hidden" name="id" value={candidate.id} />
                <select name="stage" defaultValue={candidate.stage} aria-label={t("المرحلة", "Stage")} className={`${fieldClass} w-full`}>
                  {STAGES.filter((value) => value !== "HIRED").map((value) => (
                    <option key={value} value={value}>
                      {pick(STAGE_LABEL[value], lang)}
                    </option>
                  ))}
                </select>
                <Field label={t("سبب الاستبعاد (عند الاستبعاد)", "Reason (when rejecting)")}>
                  <input name="rejectReason" maxLength={500} defaultValue={candidate.rejectReason || ""} className={`${fieldClass} w-full`} />
                </Field>
                <SubmitButton variant="secondary" className="w-full">
                  {t("حفظ المرحلة", "Save stage")}
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          {allow.hire && open ? (
            <Card>
              <SectionTitle hint={t("يُنشأ ملف موظف بالاسم والتواصل والمسمى والقسم، ثم تكمل بقية البيانات.", "Creates an employee with name, contact, title and department; you complete the rest.")}>
                {t("تعيين المرشح", "Hire candidate")}
              </SectionTitle>
              <form action={hireCandidate} className="space-y-3">
                <input type="hidden" name="id" value={candidate.id} />
                <Field label={t("تاريخ المباشرة", "Joining date")}>
                  <input name="joiningDate" type="date" required defaultValue={todayInputValue()} className={`${fieldClass} w-full`} />
                </Field>
                {allow.salary ? (
                  <Field label={t(`الراتب الأساسي (${currency})`, `Basic salary (${currency})`)}>
                    <input name="basicSalary" type="number" min={0} step="0.001" defaultValue={candidate.expectedSalary ?? ""} className={`${fieldClass} w-full`} />
                  </Field>
                ) : null}
                <SubmitButton className="w-full" confirm={t(`تعيين ${candidate.fullName} وإنشاء ملف موظف؟`, `Hire ${candidate.fullName} and create an employee record?`)}>
                  <UserCheck size={16} />
                  {t("تعيين وإنشاء ملف موظف", "Hire & create employee")}
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          {allow.remove ? (
            <form action={deleteCandidate} className="px-1">
              <input type="hidden" name="id" value={candidate.id} />
              <SubmitButton variant="link" confirm={t("حذف المرشح وسيرته الذاتية؟", "Delete this candidate and the CV?")}>
                {t("حذف المرشح", "Delete candidate")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
