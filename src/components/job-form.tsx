import type { JobOpening } from "@prisma/client";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass } from "./ui";
import { type Lang, makeT, pick } from "@/lib/i18n";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, JOB_STATUSES, JOB_STATUS_LABEL } from "@/lib/recruitment";
import { toDateInput } from "@/lib/utils";

type Option = { id: string; nameAr: string; nameEn: string | null };

export function JobForm({
  action,
  lang,
  jobTitles,
  departments,
  job,
  currency,
}: {
  action: (formData: FormData) => Promise<void>;
  lang: Lang;
  jobTitles: Option[];
  departments: Option[];
  job?: JobOpening;
  currency: string;
}) {
  const t = makeT(lang);
  const name = (item: Option) => (lang === "en" && item.nameEn ? item.nameEn : item.nameAr);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}
      <Field label={t("المسمى من القائمة", "Job title from the list")} hint={t("اختياري؛ يُستخدم عند التعيين", "Optional; used when hiring")}>
        <select name="jobTitleId" defaultValue={job?.jobTitleId || ""} className={`${fieldClass} w-full`}>
          <option value="">{t("— بلا —", "— None —")}</option>
          {jobTitles.map((item) => (
            <option key={item.id} value={item.id}>
              {name(item)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("عنوان الشاغر", "Vacancy title")} hint={t("يُؤخذ من المسمى إن تُرك فارغاً", "Taken from the job title if left empty")}>
        <input name="title" defaultValue={job?.title || ""} maxLength={120} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("العنوان بالإنجليزية", "Title in English")}>
        <input name="titleEn" defaultValue={job?.titleEn || ""} maxLength={120} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("القسم", "Department")}>
        <select name="departmentId" defaultValue={job?.departmentId || ""} className={`${fieldClass} w-full`}>
          <option value="">{t("— بلا —", "— None —")}</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {name(item)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("نوع العمل", "Employment type")}>
        <select name="employmentType" defaultValue={job?.employmentType || "FULL_TIME"} className={`${fieldClass} w-full`}>
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {pick(EMPLOYMENT_LABEL[type], lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("عدد المطلوبين", "Openings")}>
        <input name="openings" type="number" min={1} max={500} defaultValue={job?.openings ?? 1} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("مكان العمل", "Location")}>
        <input name="location" defaultValue={job?.location || ""} maxLength={120} placeholder={t("مسقط", "Muscat")} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("آخر موعد للتقديم", "Closing date")}>
        <input name="closesAt" type="date" defaultValue={toDateInput(job?.closesAt)} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t(`الراتب من (${currency})`, `Salary from (${currency})`)} hint={t("اختياري؛ لا يظهر في صفحة التقديم", "Optional; not shown on the apply page")}>
        <input name="salaryMin" type="number" min={0} step="0.001" defaultValue={job?.salaryMin ?? ""} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t(`إلى (${currency})`, `To (${currency})`)}>
        <input name="salaryMax" type="number" min={0} step="0.001" defaultValue={job?.salaryMax ?? ""} className={`${fieldClass} w-full`} />
      </Field>
      {job ? (
        <Field label={t("حالة الشاغر", "Status")}>
          <select name="status" defaultValue={job.status} className={`${fieldClass} w-full`}>
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {pick(JOB_STATUS_LABEL[status], lang)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="sm:col-span-2">
        <Field
          label={t("المهام والمتطلبات", "Duties and requirements")}
          hint={t("تظهر للمتقدمين، ويقارن بها الذكاء الاصطناعي السير الذاتية — كلما كانت أوضح كان التقييم أدق.", "Shown to applicants; AI compares CVs against it — the clearer it is, the better the screening.")}
        >
          <textarea name="description" rows={6} defaultValue={job?.description || ""} maxLength={6000} className={`${fieldClass} w-full`} />
        </Field>
      </div>
      {job ? null : (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
          <input type="checkbox" name="publicLink" value="1" defaultChecked className="size-4 accent-teal-700" />
          {t("إنشاء رابط تقديم عام أشاركه مع المتقدمين", "Create a public apply link to share with applicants")}
        </label>
      )}
      <div className="sm:col-span-2">
        <SubmitButton className="w-full sm:w-auto">{job ? t("حفظ الشاغر", "Save vacancy") : t("إضافة الشاغر", "Add vacancy")}</SubmitButton>
      </div>
    </form>
  );
}
