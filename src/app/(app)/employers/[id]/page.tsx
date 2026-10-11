import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Banknote, FileText, Mail, MapPin, PencilLine, Phone, Printer, ReceiptText, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { EmployerForm } from "@/components/employer-form";
import { Flash } from "@/components/flash";
import { DeleteButton } from "@/components/row-forms";
import { Card, EmptyState, SectionTitle, Stat, ToneBadge, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND, STATUS_LABEL, STATUS_TONE, termText } from "@/lib/constants";
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
  const user = await requirePermission("employers.view");
  const showPay = can(user, "salaries.view");
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
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/employers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("دفتر العناوين", "Address book")}
      </Link>

      <section className="animate-fade-up overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-card">
        <div className="relative h-24 overflow-hidden bg-gradient-to-l from-slate-900 to-navy-700 sm:h-28" aria-hidden="true">
          <div className="higher-horizon absolute -bottom-10 end-4 h-44 w-72 bg-[length:100%] opacity-[0.1]" />
        </div>
        <div className="flex flex-col gap-4 px-4 pb-5 sm:px-6 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            {employer.logoUrl ? (
              <img
                src={employer.logoUrl}
                alt=""
                className="relative -mt-10 size-20 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-raised ring-4 ring-white sm:-mt-12 sm:size-24"
              />
            ) : (
              <div className="relative -mt-10 flex size-20 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-3xl font-bold text-white shadow-raised ring-4 ring-white sm:-mt-12 sm:size-24">
                {title.trim().slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 pb-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
                <ToneBadge tone="teal">{pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}</ToneBadge>
              </div>
              {subtitle ? (
                <p className="mt-0.5 break-words text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center md:justify-end">
            {can(user, "employees.create") ? (
              <Link href={`/employees/new?employerId=${employer.id}`} className={primaryBtn}>
                <UserPlus size={16} />
                {t("إضافة موظف", "Add employee")}
              </Link>
            ) : null}
            {showPay ? (
              <>
                <Link href={`/salaries?employerId=${employer.id}`} className={secondaryBtn}>
                  <Banknote size={16} />
                  {t("الرواتب", "Payroll")}
                </Link>
                <Link href={`/salaries/sheet?from=${period}&to=${period}&employerId=${employer.id}`} target="_blank" className={secondaryBtn}>
                  <ReceiptText size={16} />
                  {t("كشف الشهر", "Month sheet")}
                </Link>
              </>
            ) : null}
            <Link href={`/address-book/print?employerId=${employer.id}`} target="_blank" className={secondaryBtn}>
              <Printer size={16} />
              {t("طباعة جهات الاتصال", "Print contacts")}
            </Link>
          </div>
        </div>
        {contacts.length ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs sm:px-6">
            {contacts.map((item) => {
              const Icon = item.icon;
              const chip = "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200";
              return item.href ? (
                <a key={item.value} href={item.href} className={`${chip} hover:text-teal-700`} dir="ltr">
                  <Icon size={13} className="shrink-0 text-slate-400" />
                  <span className="truncate">{item.value}</span>
                </a>
              ) : (
                <span key={item.value} className={chip} dir={item.ltr ? "ltr" : undefined}>
                  <Icon size={13} className="shrink-0 text-slate-400" />
                  <span className="break-words">{item.value}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label={t("كل الموظفين", "All employees")} value={String(employer.employees.length)} icon={Users} tone="navy" />
        <Stat label={t("النشطون", "Active")} value={String(active.length)} icon={Users} tone="teal" />
        <div className="col-span-2 sm:col-span-1">
          <Stat label={t("الرواتب الشهرية", "Monthly payroll")} value={showPay ? money(monthly, currency) : "—"} icon={Wallet} tone="gold" />
        </div>
      </div>

      <Flash error={sp.error} message={sp.message} />

      <Card>
        <SectionTitle hint={t(`${employer.employees.length} موظف`, `${employer.employees.length} employee(s)`)}>{t("الموظفون المرتبطون", "Linked employees")}</SectionTitle>
        {employer.employees.length === 0 ? (
          <EmptyState icon={Users} title={t("لا يوجد موظفون", "No employees")} text={t("لا يوجد موظفون مرتبطون بهذا الكفيل.", "No employees linked to this sponsor.")}>
            {can(user, "employees.create") ? (
              <Link href={`/employees/new?employerId=${employer.id}`} className={primaryBtn}>
                <UserPlus size={16} />
                {t("إضافة موظف", "Add employee")}
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <div className="table-shell -mx-1 sm:mx-0">
            <table className="table-stack text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
                  <th className="px-4 py-3 text-start">{t("الرقم", "No.")}</th>
                  <th className="px-4 py-3 text-start">{t("الوظيفة", "Job title")}</th>
                  <th className="px-4 py-3 text-start">{t("إجمالي الراتب", "Gross salary")}</th>
                  <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {employer.employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="cell-title px-4 py-3">
                      <Link href={`/employees/${employee.id}`} className="flex items-center gap-2.5 font-semibold text-slate-900 hover:text-teal-700">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-sm font-bold text-teal-700">
                          {employeeName(employee).trim().slice(0, 1)}
                        </span>
                        <span className="min-w-0 break-words">{employeeName(employee)}</span>
                      </Link>
                    </td>
                    <td data-label={t("الرقم", "No.")} className="tabular px-4 py-3 text-slate-500">
                      {employee.employeeNumber}
                    </td>
                    <td data-label={t("الوظيفة", "Job title")} className="px-4 py-3">
                      {text(termText(employee.jobTitle, employee.jobTitleEn, lang))}
                    </td>
                    <td data-label={t("إجمالي الراتب", "Gross salary")} className="tabular whitespace-nowrap px-4 py-3 font-semibold">
                      {showPay ? money(packageGross(employee), currency) : "—"}
                    </td>
                    <td data-label={t("الحالة", "Status")} className="px-4 py-3">
                      <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {can(user, "employers.edit") ? (
        <Card id="details" className="scroll-mt-24">
          <SectionTitle hint={t("الاسم والشعار وبيانات التواصل.", "Name, logo and contact details.")}>
            <span className="inline-flex items-center gap-2">
              <PencilLine size={18} className="text-teal-700" />
              {t("تعديل بيانات الكفيل", "Edit sponsor details")}
            </span>
          </SectionTitle>
          <EmployerForm action={updateEmployer} employer={employer} submitLabel={t("حفظ التعديلات", "Save changes")} />
        </Card>
      ) : null}

      {can(user, "employers.delete") ? (
        <Card className="border-red-100 bg-red-50/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
                <Trash2 size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold text-red-800">{t("حذف الكفيل", "Delete sponsor")}</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {t(
                    "يمكن حذف الكفيل فقط إذا لم يكن مرتبطاً بأي موظف. الرواتب السابقة تحتفظ باسمه.",
                    "A sponsor can be deleted only when no employees are linked. Past salaries keep its name.",
                  )}
                </p>
              </div>
            </div>
            <DeleteButton
              action={deleteEmployer}
              fields={{ id: employer.id }}
              variant="danger"
              label={t("حذف الكفيل", "Delete sponsor")}
              confirm={t(`حذف ${employer.name} من دفتر العناوين؟`, `Delete ${employer.name} from the address book?`)}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
