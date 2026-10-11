import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { BilingualFields } from "@/components/bilingual-fields";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { MultiCheck } from "@/components/multi-check";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, fieldClass, secondaryBtn } from "@/components/ui";
import { ALLOWANCE_BASES, ALLOWANCE_CALCS, ALLOWANCE_FREQUENCIES, describeAllowance } from "@/lib/allowances";
import { requireAdmin } from "@/lib/auth";
import { ALLOWANCE_BASE, ALLOWANCE_CALC, ALLOWANCE_FREQUENCY, monthName, termText } from "@/lib/constants";
import { getHrCatalog } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { normalizeSearchText } from "@/lib/search";
import { prisma } from "@/lib/prisma";
import { cn, daysLabel } from "@/lib/utils";
import {
  deleteAllowanceType,
  deleteCatalogEntry,
  deleteLeaveType,
  importDefaults,
  saveAllowanceType,
  saveCatalogEntry,
  saveLeaveType,
  translateMissing,
} from "@/server/hr-settings-actions";

const TABS = ["jobs", "departments", "leave", "allowances"] as const;
type Tab = (typeof TABS)[number];

export default async function HrSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const { lang, t } = await getI18n();
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab || "") ? (sp.tab as Tab) : "jobs";
  const catalog = await getHrCatalog(user.companyId);
  const currency = user.company.currency;
  const query = normalizeSearchText(sp.q || "");
  const matches = (item: { nameAr: string; nameEn: string | null }) =>
    !query || normalizeSearchText(item.nameAr).includes(query) || normalizeSearchText(item.nameEn || "").includes(query);
  const name = (item: { nameAr: string; nameEn: string | null }) => termText(item.nameAr, item.nameEn, lang) || item.nameAr;

  const [jobCounts, departmentCounts, allowanceCounts] = await Promise.all([
    prisma.employee.groupBy({ by: ["jobTitleId"], where: { companyId: user.companyId, jobTitleId: { not: null } }, _count: true }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { companyId: user.companyId, departmentId: { not: null } }, _count: true }),
    prisma.employeeAllowance.groupBy({ by: ["allowanceTypeId"], where: { companyId: user.companyId }, _count: true }),
  ]);
  const jobUse = new Map(jobCounts.map((row) => [row.jobTitleId, row._count]));
  const departmentUse = new Map(departmentCounts.map((row) => [row.departmentId, row._count]));
  const allowanceUse = new Map(allowanceCounts.map((row) => [row.allowanceTypeId, row._count]));

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "jobs", label: t("المسميات الوظيفية", "Job titles"), count: catalog.jobTitles.length },
    { id: "departments", label: t("الأقسام", "Departments"), count: catalog.departments.length },
    { id: "leave", label: t("أنواع الإجازات", "Leave types"), count: catalog.leaveTypes.length },
    { id: "allowances", label: t("العلاوات", "Allowances"), count: catalog.allowanceTypes.length },
  ];

  const translateButton = (list: Tab, missing: number) =>
    missing > 0 ? (
      <form action={translateMissing}>
        <input type="hidden" name="list" value={list} />
        <SubmitButton variant="secondary" pendingLabel={t("جارٍ الترجمة بالذكاء الاصطناعي…", "Translating with AI…")}>
          <Sparkles size={15} className="text-gold-500" />
          {t(`ترجمة الناقص بالذكاء الاصطناعي (${missing})`, `AI-translate missing (${missing})`)}
        </SubmitButton>
      </form>
    ) : null;
  const missingEn = (list: { nameEn: string | null }[]) => list.filter((item) => !item.nameEn?.trim()).length;

  const catalogTab = (list: "jobs" | "departments") => {
    const rows = list === "jobs" ? catalog.jobTitles : catalog.departments;
    const usage = list === "jobs" ? jobUse : departmentUse;
    const shown = rows.filter(matches);
    return (
      <>
        <Card className="space-y-3">
          <h2 className="font-bold">{list === "jobs" ? t("إضافة مسمى وظيفي", "Add a job title") : t("إضافة قسم", "Add a department")}</h2>
          <form action={saveCatalogEntry} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input type="hidden" name="list" value={list} />
            <BilingualFields arName="nameAr" enName="nameEn" arLabel={t("الاسم بالعربية", "Arabic name")} enLabel={t("الاسم بالإنجليزية", "English name")} required />
            <SubmitButton>{t("إضافة", "Add")}</SubmitButton>
          </form>
          <p className="text-xs text-slate-500">
            {t("اكتب الاسم بلغة واحدة فتُكتب الأخرى تلقائياً بالذكاء الاصطناعي.", "Type the name in one language and AI fills in the other.")}
          </p>
        </Card>
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <GetForm className="flex min-w-0 flex-1 basis-60 gap-2">
              <input type="hidden" name="tab" value={list} />
              <input className={`${fieldClass} w-0 min-w-0 flex-1`} name="q" defaultValue={sp.q || ""} placeholder={t("ابحث بالعربية أو الإنجليزية…", "Search in Arabic or English…")} />
              <button className={secondaryBtn}>{t("بحث", "Search")}</button>
            </GetForm>
            <div className="flex flex-wrap gap-2">
              {translateButton(list, missingEn(rows))}
              <form action={importDefaults}>
                <input type="hidden" name="list" value={list} />
                <SubmitButton variant="secondary">{t("استيراد القائمة الجاهزة", "Import built-in list")}</SubmitButton>
              </form>
            </div>
          </div>
          <p className="mb-2 text-xs text-slate-500">{t(`${shown.length} من ${rows.length}`, `${shown.length} of ${rows.length}`)}</p>
          <ul className="divide-y divide-slate-100">
            {shown.map((row) => {
              const used = usage.get(row.id) || 0;
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{row.nameAr}</p>
                    <p className={cn("text-sm", row.nameEn ? "text-slate-500" : "text-amber-700")} dir="ltr">
                      {row.nameEn || t("لا توجد ترجمة إنجليزية", "No English name")}
                    </p>
                    {used ? <p className="text-xs text-teal-800">{t(`${used} موظف`, `${used} employee(s)`)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 group-open:bg-slate-100 group-open:text-slate-600">{t("تعديل", "Edit")}</summary>
                      <form action={saveCatalogEntry} className="mt-2 grid w-72 max-w-[80vw] grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                        <input type="hidden" name="list" value={list} />
                        <input type="hidden" name="id" value={row.id} />
                        <BilingualFields arName="nameAr" enName="nameEn" arLabel={t("بالعربية", "Arabic")} enLabel={t("بالإنجليزية", "English")} arDefault={row.nameAr} enDefault={row.nameEn} required compact />
                        <SubmitButton variant="secondary">{t("حفظ", "Save")}</SubmitButton>
                      </form>
                    </details>
                    {used ? null : (
                      <DeleteButton action={deleteCatalogEntry} fields={{ id: row.id, list }} confirm={t(`حذف «${row.nameAr}»؟`, `Delete "${row.nameAr}"?`)} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </>
    );
  };

  const jobOptions = catalog.jobTitles.map((job) => ({ value: job.id, label: name(job), hint: lang === "en" ? job.nameAr : job.nameEn }));
  const leaveForm = (type?: (typeof catalog.leaveTypes)[number]) => (
    <form action={saveLeaveType} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <BilingualFields arName="nameAr" enName="nameEn" arLabel={t("اسم الإجازة بالعربية", "Leave name (Arabic)")} enLabel={t("اسم الإجازة بالإنجليزية", "Leave name (English)")} arDefault={type?.nameAr} enDefault={type?.nameEn} required />
      <Field label={t("عدد الأيام المستحقة", "Days entitled")} hint={t("الافتراضي لكل موظف، ويمكن تغييره في ملف الموظف.", "Default for every employee; can be changed per employee.")}>
        <input className={`${fieldClass} w-full`} type="number" name="days" min="0" max="366" step="0.5" defaultValue={type?.days ?? 0} required />
      </Field>
      <fieldset className="min-w-0 space-y-2 md:col-span-2">
        <legend className="text-sm font-medium text-slate-700">{t("مشمولة لـ", "Applies to")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="scope" value="all" defaultChecked={type ? type.allJobs : true} className="accent-teal-700" />
          {t("كل الوظائف", "All jobs")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="scope" value="selected" defaultChecked={type ? !type.allJobs : false} className="accent-teal-700" />
          {t("مسميات وظيفية محددة فقط (اخترها أدناه)", "Selected job titles only (choose below)")}
        </label>
        <MultiCheck name="jobTitleIds" options={jobOptions} defaultValues={type?.jobTitleIds || []} />
      </fieldset>
      <div className="md:col-span-2">
        <SubmitButton>{type ? t("حفظ التعديل", "Save changes") : t("إضافة نوع الإجازة", "Add leave type")}</SubmitButton>
      </div>
    </form>
  );

  const allowanceForm = (type?: (typeof catalog.allowanceTypes)[number]) => (
    <form action={saveAllowanceType} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <BilingualFields arName="nameAr" enName="nameEn" arLabel={t("اسم العلاوة بالعربية", "Allowance name (Arabic)")} enLabel={t("اسم العلاوة بالإنجليزية", "Allowance name (English)")} arDefault={type?.nameAr} enDefault={type?.nameEn} required />
      <Field label={t("نوع الحساب", "Calculation")}>
        <select className={`${fieldClass} w-full`} name="calc" defaultValue={type?.calc || "FIXED"}>
          {ALLOWANCE_CALCS.map((value) => (
            <option key={value} value={value}>
              {pick(ALLOWANCE_CALC[value], lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("القيمة (مبلغ أو نسبة %)", "Value (amount or %)")}>
        <input className={`${fieldClass} w-full`} type="number" name="value" min="0" step="0.001" defaultValue={type?.value ?? 0} required />
      </Field>
      <Field label={t("النسبة تُحسب من", "Percentage is of")} hint={t("للنسبة المئوية فقط.", "Percentage only.")}>
        <select className={`${fieldClass} w-full`} name="base" defaultValue={type?.base || "BASIC"}>
          {ALLOWANCE_BASES.map((value) => (
            <option key={value} value={value}>
              {pick(ALLOWANCE_BASE[value], lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("موعد الصرف", "Paid")}>
        <select className={`${fieldClass} w-full`} name="frequency" defaultValue={type?.frequency || "MONTHLY"}>
          {ALLOWANCE_FREQUENCIES.map((value) => (
            <option key={value} value={value}>
              {pick(ALLOWANCE_FREQUENCY[value], lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("شهر الصرف", "Pay month")} hint={t("لغير الشهرية: أول شهر تُصرف فيه، ثم كل 3 أو 6 أو 12 شهراً.", "For non-monthly: the first month it is paid, then every 3, 6 or 12 months.")}>
        <select className={`${fieldClass} w-full`} name="payMonth" defaultValue={type?.payMonth || 1}>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index} value={index + 1}>
              {monthName(index + 1, lang)}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-2 md:col-span-2">
        {type ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="applyToEmployees" value="1" className="mt-1 accent-teal-700" />
            {t(
              "تطبيق القيمة وموعد الصرف الجديدين على كل الموظفين الذين لديهم هذه العلاوة (الرواتب المصروفة لا تتغير)",
              "Apply the new value and schedule to every employee who has this allowance (paid salaries do not change)",
            )}
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="addToAll" value="1" className="mt-1 accent-teal-700" />
          {t("إضافتها الآن لكل الموظفين النشطين الذين لا يملكونها (تبدأ من هذا الشهر)", "Give it now to every active employee who does not have it (starting this month)")}
        </label>
      </div>
      <div className="md:col-span-2">
        <SubmitButton>{type ? t("حفظ التعديل", "Save changes") : t("إضافة العلاوة", "Add allowance")}</SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("الإعدادات", "Settings")}
      </Link>
      <PageHeader
        icon={Sparkles}
        title={t("إعدادات الموارد البشرية", "HR settings")}
        description={t(
          "المسميات الوظيفية والأقسام وأنواع الإجازات والعلاوات لهذه المنشأة، بالعربية والإنجليزية. اكتب الاسم بلغة واحدة فتكمل الأخرى بالذكاء الاصطناعي.",
          "This company's job titles, departments, leave types and allowances in Arabic and English. Type a name in one language and AI completes the other.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />
      <nav className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t("القوائم", "Lists")}>
        <div className="segmented flex-nowrap">
          {tabs.map((item) => (
            <Link key={item.id} href={`/settings/hr?tab=${item.id}`} aria-current={item.id === tab ? "page" : undefined}>
              {item.label}
              <span className={cn("tabular rounded-full px-1.5 text-xs leading-5", item.id === tab ? "bg-teal-50 text-teal-800" : "bg-white/70 text-slate-500")}>{item.count}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="space-y-4">
        {tab === "jobs" ? catalogTab("jobs") : null}
        {tab === "departments" ? catalogTab("departments") : null}

        {tab === "leave" ? (
          <>
            <Card className="space-y-3">
              <h2 className="font-bold">{t("إضافة نوع إجازة", "Add a leave type")}</h2>
              {leaveForm()}
            </Card>
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{t("أنواع الإجازات", "Leave types")}</h2>
                {translateButton("leave", missingEn(catalog.leaveTypes))}
              </div>
              <ul className="divide-y divide-slate-100">
                {catalog.leaveTypes.map((type) => {
                  const jobs = type.jobTitleIds.map((id) => catalog.jobTitles.find((job) => job.id === id)).filter(Boolean);
                  return (
                    <li key={type.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {type.nameAr} <span className="text-sm font-normal text-slate-500" dir="ltr">{type.nameEn ? `/ ${type.nameEn}` : ""}</span>
                          </p>
                          <p className="text-sm text-slate-600">
                            {t(`${daysLabel(type.days)} يوم`, `${daysLabel(type.days)} day(s)`)} ·{" "}
                            {type.allJobs ? t("كل الوظائف", "All jobs") : t(`${jobs.length} مسمى: `, `${jobs.length} title(s): `) + jobs.map((job) => name(job!)).join("، ")}
                          </p>
                        </div>
                        <DeleteButton action={deleteLeaveType} fields={{ id: type.id }} confirm={t(`حذف نوع الإجازة «${type.nameAr}»؟`, `Delete leave type "${type.nameAr}"?`)} />
                      </div>
                      <details className="group">
                        <summary className="inline-flex cursor-pointer list-none items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 group-open:bg-slate-100 group-open:text-slate-600">{t("تعديل", "Edit")}</summary>
                        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">{leaveForm(type)}</div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        ) : null}

        {tab === "allowances" ? (
          <>
            <Card className="space-y-3">
              <h2 className="font-bold">{t("إضافة علاوة", "Add an allowance")}</h2>
              <p className="text-xs text-slate-500">
                {t(
                  "القيم هنا افتراضية؛ عند إضافة العلاوة لموظف من ملفه يمكن تغيير مبلغها أو نسبتها. تُضاف العلاوة تلقائياً لرواتب الأشهر التي تستحق فيها.",
                  "Values here are defaults; when you give the allowance to an employee you can change the amount or percentage. It is added automatically to the salary months it falls due in.",
                )}
              </p>
              {allowanceForm()}
            </Card>
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{t("العلاوات", "Allowances")}</h2>
                {translateButton("allowances", missingEn(catalog.allowanceTypes))}
              </div>
              {catalog.allowanceTypes.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد علاوات بعد.", "No allowances yet.")}</p> : null}
              <ul className="divide-y divide-slate-100">
                {catalog.allowanceTypes.map((type) => {
                  const used = allowanceUse.get(type.id) || 0;
                  return (
                    <li key={type.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {type.nameAr} <span className="text-sm font-normal text-slate-500" dir="ltr">{type.nameEn ? `/ ${type.nameEn}` : ""}</span>
                          </p>
                          <p className="text-sm text-slate-600">{describeAllowance(type, lang, currency)}</p>
                          <p className="text-xs text-teal-800">{t(`لدى ${used} موظف`, `${used} employee(s)`)}</p>
                        </div>
                        <DeleteButton
                          action={deleteAllowanceType}
                          fields={{ id: type.id }}
                          confirm={t(
                            `حذف «${type.nameAr}» وإزالتها من ${used} موظف؟ الرواتب المصروفة لا تتغير.`,
                            `Delete "${type.nameAr}" and remove it from ${used} employee(s)? Paid salaries do not change.`,
                          )}
                        />
                      </div>
                      <details className="group">
                        <summary className="inline-flex cursor-pointer list-none items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 group-open:bg-slate-100 group-open:text-slate-600">{t("تعديل", "Edit")}</summary>
                        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">{allowanceForm(type)}</div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
