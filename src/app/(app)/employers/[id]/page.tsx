import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, MapPin, Phone } from "lucide-react";
import { EmployerForm } from "@/components/employer-form";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, ToneBadge, primaryBtn, secondaryBtn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { EMPLOYER_KIND, STATUS_LABEL, STATUS_TONE, localizeTerm } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { currentPeriod, money, text } from "@/lib/utils";
import { deleteEmployer, updateEmployer } from "@/server/employer-actions";

export default async function EmployerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const employer = await prisma.employer.findFirst({
    where: { id, companyId: user.companyId },
    include: { employees: { orderBy: { fullName: "asc" } } },
  });
  if (!employer) notFound();
  const currency = user.company.currency;
  const title = lang === "en" && employer.nameEn ? employer.nameEn : employer.name;
  const otherName = lang === "en" ? (employer.nameEn ? employer.name : null) : employer.nameEn;
  const subtitle = otherName && otherName.trim() !== title.trim() ? otherName : null;
  const active = employer.employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION");
  const monthly = active.reduce((sum, employee) => sum + packageGross(employee), 0);
  const { year, month } = currentPeriod();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const contacts = [
    employer.idNumber ? { icon: FileText, value: employer.idNumber, href: null, ltr: true } : null,
    employer.phone ? { icon: Phone, value: employer.phone, href: `tel:${employer.phone}`, ltr: true } : null,
    employer.email ? { icon: Mail, value: employer.email, href: `mailto:${employer.email}`, ltr: true } : null,
    employer.address ? { icon: MapPin, value: employer.address, href: null, ltr: false } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const employeeName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/employers" className="inline-flex text-sm font-semibold text-teal-800">
        {lang === "en" ? "←" : "→"} {t("دفتر العناوين", "Address book")}
      </Link>

      <Card className="p-0 sm:p-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            {employer.logoUrl ? (
              <img src={employer.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-teal-800 text-2xl font-bold text-white">{title.slice(0, 1)}</div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
                <ToneBadge tone="teal">{pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}</ToneBadge>
              </div>
              {subtitle ? (
                <p className="mt-0.5 break-words text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                  {subtitle}
                </p>
              ) : null}
              {contacts.length ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {contacts.map((item) => {
                    const Icon = item.icon;
                    return (
                      <span key={item.value} className="inline-flex min-w-0 items-center gap-1.5">
                        <Icon size={14} className="shrink-0 text-slate-400" />
                        {item.href ? (
                          <a href={item.href} className="break-all hover:text-teal-800" dir="ltr">
                            {item.value}
                          </a>
                        ) : (
                          <span className="break-words" dir={item.ltr ? "ltr" : undefined}>
                            {item.value}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
            <Link href={`/employees/new?employerId=${employer.id}`} className={primaryBtn}>
              {t("إضافة موظف", "Add employee")}
            </Link>
            <Link href={`/salaries?employerId=${employer.id}`} className={secondaryBtn}>
              {t("الرواتب", "Payroll")}
            </Link>
            <Link href={`/salaries/sheet?from=${period}&to=${period}&employerId=${employer.id}`} target="_blank" className={secondaryBtn}>
              {t("كشف رواتب الشهر", "This month's sheet")}
            </Link>
            <Link href={`/address-book/print?employerId=${employer.id}`} target="_blank" className={secondaryBtn}>
              {t("طباعة جهات الاتصال", "Print contacts")}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 text-center rtl:divide-x-reverse">
          <div className="px-2 py-3">
            <p className="text-xs text-slate-500">{t("كل الموظفين", "All employees")}</p>
            <p className="font-bold text-slate-900">{employer.employees.length}</p>
          </div>
          <div className="px-2 py-3">
            <p className="text-xs text-slate-500">{t("النشطون", "Active")}</p>
            <p className="font-bold text-slate-900">{active.length}</p>
          </div>
          <div className="min-w-0 px-2 py-3">
            <p className="text-xs text-slate-500">{t("الرواتب الشهرية", "Monthly payroll")}</p>
            <p className="truncate font-bold text-slate-900">{money(monthly, currency)}</p>
          </div>
        </div>
      </Card>

      <Flash error={sp.error} message={sp.message} />

      <Card>
        <h2 className="mb-3 font-bold">
          {t("الموظفون المرتبطون", "Linked employees")} ({employer.employees.length})
        </h2>
        {employer.employees.length === 0 ? (
          <p className="text-sm text-slate-500">{t("لا يوجد موظفون مرتبطون بهذا الكفيل.", "No employees linked to this sponsor.")}</p>
        ) : null}
        <div className="space-y-2 md:hidden">
          {employer.employees.map((employee) => (
            <Link key={employee.id} href={`/employees/${employee.id}`} className="block rounded-xl border border-slate-100 p-3 hover:border-teal-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-900">{employeeName(employee)}</p>
                  <p className="text-xs text-slate-500">
                    {employee.employeeNumber} · {text(localizeTerm(employee.jobTitle, lang))}
                  </p>
                </div>
                <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-700">{money(packageGross(employee), currency)}</p>
            </Link>
          ))}
        </div>
        {employer.employees.length ? (
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="py-2 text-start font-semibold">{t("الرقم", "No.")}</th>
                  <th className="py-2 text-start font-semibold">{t("الموظف", "Employee")}</th>
                  <th className="py-2 text-start font-semibold">{t("الوظيفة", "Job title")}</th>
                  <th className="py-2 text-start font-semibold">{t("إجمالي الراتب", "Gross salary")}</th>
                  <th className="py-2 text-start font-semibold">{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {employer.employees.map((employee) => (
                  <tr key={employee.id} className="border-t border-slate-100">
                    <td className="py-2.5 text-slate-500">{employee.employeeNumber}</td>
                    <td className="py-2.5">
                      <Link href={`/employees/${employee.id}`} className="font-semibold hover:text-teal-800">
                        {employeeName(employee)}
                      </Link>
                    </td>
                    <td className="py-2.5">{text(localizeTerm(employee.jobTitle, lang))}</td>
                    <td className="whitespace-nowrap py-2.5">{money(packageGross(employee), currency)}</td>
                    <td className="py-2.5">
                      <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card>
        <div id="details" className="scroll-mt-24" />
        <h2 className="mb-4 font-bold">{t("تعديل بيانات الكفيل", "Edit sponsor details")}</h2>
        <EmployerForm action={updateEmployer} employer={employer} submitLabel={t("حفظ التعديلات", "Save changes")} />
      </Card>

      <Card className="border-red-100">
        <h2 className="font-bold text-red-800">{t("حذف الكفيل", "Delete sponsor")}</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          {t(
            "يمكن حذف الكفيل فقط إذا لم يكن مرتبطاً بأي موظف. الرواتب السابقة تحتفظ باسمه.",
            "A sponsor can be deleted only when no employees are linked. Past salaries keep its name.",
          )}
        </p>
        <form action={deleteEmployer}>
          <input type="hidden" name="id" value={employer.id} />
          <SubmitButton variant="danger" pendingLabel={t("جارٍ الحذف...", "Deleting...")}>
            {t("حذف الكفيل", "Delete sponsor")}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
