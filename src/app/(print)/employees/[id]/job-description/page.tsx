import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Sparkles } from "lucide-react";
import { Flash } from "@/components/flash";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, headerFor, sheetClass } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { termBoth } from "@/lib/constants";
import { JD_LABEL, JD_LISTS, readJobDescription, type JobDescription } from "@/lib/job-description";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { generateJobDescription, saveJobDescription } from "@/server/job-description-actions";

const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

function List({ items, dir }: { items: string[]; dir: "rtl" | "ltr" }) {
  return (
    <ul dir={dir} className="space-y-1.5 text-[13px] leading-6 text-slate-700">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal-600" style={exact} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function JobDescriptionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { employer: true, jobTitleRef: true, manager: { select: { fullName: true, nameEn: true, jobTitle: true, jobTitleEn: true } } },
  });
  if (!employee) notFound();
  const allowEdit = can(user, "employees.edit");
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);
  const jd: JobDescription | null = readJobDescription(employee.jobTitleRef?.description);
  const rows: [string, string, string][] = [
    ["المسمى الوظيفي", "Job title", termBoth(employee.jobTitle, employee.jobTitleEn) || "—"],
    ["القسم", "Department", termBoth(employee.department, employee.departmentEn) || "—"],
    [
      "المدير المباشر",
      "Reports to",
      employee.manager ? [employee.manager.fullName, termBoth(employee.manager.jobTitle, employee.manager.jobTitleEn)].filter(Boolean).join(" — ") : "—",
    ],
    ["اسم الموظف", "Employee", employee.nameEn ? `${employee.fullName} — ${employee.nameEn}` : employee.fullName],
    ["الرقم الوظيفي", "Employee no.", employee.employeeNumber],
    ["تاريخ الالتحاق", "Joined", employee.joiningDate ? formatDate(employee.joiningDate) : "—"],
    ["جهة العمل", "Employer", header.nameEn ? `${header.name} — ${header.nameEn}` : header.name],
    ["مقر العمل", "Work location", header.address || "—"],
  ];
  const back = `/employees/${id}`;

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={back} className="text-sm font-semibold text-teal-800">
            {t("رجوع لملف الموظف", "Back to the employee")}
          </Link>
          <div className="flex flex-wrap gap-2">
            {allowEdit && employee.jobTitleRef ? (
              <form action={generateJobDescription}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <SubmitButton
                  variant={jd ? "secondary" : "primary"}
                  pendingLabel={t("جارٍ الصياغة... (حتى 30 ثانية)", "Drafting... (up to 30 s)")}
                  confirm={jd ? t("سيُستبدل الوصف الحالي لهذا المسمى بصياغة جديدة. متابعة؟", "The current description for this title will be replaced by a new draft. Continue?") : undefined}
                >
                  <Sparkles size={16} />
                  {jd ? t("إعادة الصياغة بالذكاء الاصطناعي", "Redraft with AI") : t("صياغة الوصف بالذكاء الاصطناعي", "Draft with AI")}
                </SubmitButton>
              </form>
            ) : null}
            {jd ? <PrintButton label={t("طباعة البطاقة", "Print card")} /> : null}
          </div>
        </div>
        <Flash error={sp.error} message={sp.message} />
        {!employee.jobTitleRef ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 ring-1 ring-inset ring-amber-100">
            {t("لم يُحدَّد للموظف مسمى وظيفي من قائمة المسميات. حدّده من «تعديل البيانات» ليُصاغ له وصف وظيفي.", "The employee has no job title from the list. Set it from “Edit” to draft a job description.")}{" "}
            {allowEdit ? (
              <Link href={`${back}/edit`} className="font-semibold underline underline-offset-4">
                {t("تعديل البيانات", "Edit")}
              </Link>
            ) : null}
          </p>
        ) : !jd ? (
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
            {allowEdit
              ? t(
                  "لا يوجد وصف وظيفي لهذا المسمى بعد. اضغط «صياغة الوصف بالذكاء الاصطناعي» فيكتب الغرض والمهام والمؤهلات والمهارات ومؤشرات الأداء بالعربية والإنجليزية، ثم راجعه وعدّله واطبعه. يُحفظ الوصف للمسمى فيشترك فيه كل من يحمله.",
                  "There is no job description for this title yet. Press “Draft with AI” to write the purpose, duties, qualifications, skills and KPIs in Arabic and English, then review, edit and print it. It is saved for the title and shared by everyone who holds it.",
                )
              : t("لا يوجد وصف وظيفي لهذا المسمى بعد. اطلب من الموارد البشرية إعداده.", "There is no job description for this title yet. Ask HR to prepare it.")}
          </p>
        ) : (
          <p className="text-xs leading-5 text-slate-500">
            {t("الوصف مشترك لكل من يحمل المسمى", "Shared by everyone with the title")} «{employee.jobTitleRef!.nameAr}»
            {employee.jobTitleRef!.descriptionAt ? ` · ${t("آخر تحديث", "Updated")} ${formatDate(employee.jobTitleRef!.descriptionAt)}${employee.jobTitleRef!.descriptionBy ? ` — ${employee.jobTitleRef!.descriptionBy}` : ""}` : ""}
          </p>
        )}
        {allowEdit && jd ? (
          <details className="rounded-2xl bg-surface ring-1 ring-slate-200">
            <summary className={`${secondaryBtn} m-2 cursor-pointer list-none`}>
              <Pencil size={16} />
              {t("تعديل النص", "Edit the text")}
            </summary>
            <form action={saveJobDescription} className="grid gap-4 border-t border-slate-100 p-4">
              <input type="hidden" name="employeeId" value={employee.id} />
              <p className="text-xs leading-5 text-slate-500">{t("في القوائم: سطر لكل بند.", "In lists: one item per line.")}</p>
              {(["purpose", ...JD_LISTS] as const).map((key) => (
                <fieldset key={key} className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-1.5 text-sm font-bold text-slate-800">
                    {JD_LABEL[key].ar} / {JD_LABEL[key].en}
                  </legend>
                  <textarea
                    name={`${key}Ar`}
                    dir="rtl"
                    className={`${fieldClass} min-h-32 leading-7`}
                    defaultValue={key === "purpose" ? jd.purposeAr : jd[`${key}Ar`].join("\n")}
                    aria-label={`${JD_LABEL[key].ar} (عربي)`}
                  />
                  <textarea
                    name={`${key}En`}
                    dir="ltr"
                    className={`${fieldClass} min-h-32 leading-7`}
                    defaultValue={key === "purpose" ? jd.purposeEn : jd[`${key}En`].join("\n")}
                    aria-label={`${JD_LABEL[key].en} (English)`}
                  />
                </fieldset>
              ))}
              <div>
                <SubmitButton>{t("حفظ الوصف", "Save description")}</SubmitButton>
              </div>
            </form>
          </details>
        ) : null}
      </div>

      {jd ? (
        <article className={sheetClass}>
          <HeaderBar header={header} titleAr="بطاقة الوصف الوظيفي" titleEn="Job Description" number={employee.employeeNumber} />
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 print:grid-cols-2">
            {rows.map(([ar, en, value]) => (
              <div key={en} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <Bi ar={ar} en={en} className="shrink-0 text-slate-500" />
                <strong className="min-w-0 break-words text-end">{value}</strong>
              </div>
            ))}
          </div>

          {(["purpose", ...JD_LISTS] as const).map((key) => {
            const arItems = key === "purpose" ? [] : jd[`${key}Ar`];
            const enItems = key === "purpose" ? [] : jd[`${key}En`];
            if (key !== "purpose" && !arItems.length && !enItems.length) return null;
            return (
              <section key={key} className="mt-5 break-inside-avoid">
                <h2 className="flex items-center justify-between gap-3 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-800" style={exact}>
                  <span>{JD_LABEL[key].ar}</span>
                  <span dir="ltr">{JD_LABEL[key].en}</span>
                </h2>
                <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
                  {key === "purpose" ? (
                    <>
                      <p dir="rtl" className="text-[13px] leading-7 text-slate-700">
                        {jd.purposeAr}
                      </p>
                      <p dir="ltr" className="text-[13px] leading-6 text-slate-700">
                        {jd.purposeEn}
                      </p>
                    </>
                  ) : (
                    <>
                      <List items={arItems} dir="rtl" />
                      <List items={enItems} dir="ltr" />
                    </>
                  )}
                </div>
              </section>
            );
          })}

          <section className="mt-8 grid break-inside-avoid grid-cols-1 gap-4 text-sm sm:grid-cols-3 print:grid-cols-3">
            {[
              ["الموظف", "Employee", employee.fullName],
              ["المدير المباشر", "Direct manager", employee.manager?.fullName || ""],
              ["الموارد البشرية", "Human Resources", ""],
            ].map(([ar, en, name]) => (
              <div key={en} className="rounded-xl border border-slate-200 p-3">
                <Bi ar={ar} en={en} className="font-semibold text-slate-700" />
                <p className="mt-2 min-h-5 text-[13px] text-slate-600">{name}</p>
                <div className="mt-8 border-t border-dashed border-slate-300 pt-1.5 text-[11px] text-slate-500">
                  التوقيع والتاريخ / Signature & date
                </div>
              </div>
            ))}
          </section>
          <p className="mt-4 text-[11px] leading-5 text-slate-400">
            يُراجَع هذا الوصف دورياً، ويجوز للإدارة تكليف الموظف بمهام أخرى ضمن طبيعة عمله. / This description is reviewed periodically; management may assign other duties within the nature of the job.
          </p>
        </article>
      ) : null}
    </div>
  );
}
