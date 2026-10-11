import Link from "next/link";
import { Pencil, Search, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { DeleteButton } from "@/components/row-forms";
import { EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { STATUS_LABEL, STATUS_TONE, termText } from "@/lib/constants";
import { worstExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, leaveWarningText, leaveWarnings } from "@/lib/leave";
import { NATIONALITIES, nationalityName } from "@/lib/nationalities";
import { normalizeSearchText } from "@/lib/search";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { money, text } from "@/lib/utils";
import { deleteEmployee } from "@/server/employee-actions";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; employerId?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const allow = {
    create: can(user, "employees.create"),
    edit: can(user, "employees.edit"),
    remove: can(user, "employees.delete"),
    salaries: can(user, "salaries.view"),
    docs: can(user, "documents.view"),
    attendance: can(user, "attendance.view"),
  };
  const q = sp.q?.trim() || "";
  const status = sp.status && STATUS_LABEL[sp.status] ? sp.status : "ALL";
  const employerId = sp.employerId || "";
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const needle = normalizeSearchText(q);
  const nationalityCodes = q
    ? NATIONALITIES.filter((item) => normalizeSearchText(item.ar).includes(needle) || item.en.toLowerCase().includes(needle)).map((item) => item.code)
    : [];
  const [employees, employers, leaveTypes] = await Promise.all([
    prisma.employee.findMany({
      where: {
        companyId: user.companyId,
        ...(status !== "ALL" ? { status } : {}),
        ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { nameEn: { contains: q, mode: "insensitive" } },
                { employeeNumber: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { nationality: { contains: q, mode: "insensitive" } },
                ...(nationalityCodes.length ? [{ nationality: { in: nationalityCodes } }] : []),
                { jobTitle: { contains: q, mode: "insensitive" } },
                { jobTitleEn: { contains: q, mode: "insensitive" } },
                { department: { contains: q, mode: "insensitive" } },
                { departmentEn: { contains: q, mode: "insensitive" } },
                { idNumber: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        documents: { select: { expiryDate: true } },
        employer: true,
        attendance: { select: { type: true, balanceKey: true } },
        leaveCredits: { select: { balanceKey: true, days: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    getLeaveTypes(user.companyId),
  ]);
  const employerName = (employer: { name: string; nameEn: string | null } | null) =>
    employer ? (lang === "en" && employer.nameEn ? employer.nameEn : employer.name) : "—";

  const filtered = Boolean(q || employerId || status !== "ALL");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon={Users} title={t("الموظفون", "Employees")} description={t("سجل العمال وبيانات الراتب وحالة الوثائق.", "Staff records, salaries and document status.")}>
        {allow.create ? (
          <Link href="/employees/new" className={primaryBtn}>
            <UserPlus size={17} />
            {t("إضافة موظف", "Add employee")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      <Toolbar>
        <GetForm className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
          <div className="relative col-span-2 min-w-0 md:flex-1">
            <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${fieldClass} w-full ps-10`}
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("ابحث بالاسم أو الرقم أو الهاتف أو الجنسية", "Search name, number, phone or nationality")}
              aria-label={t("بحث", "Search")}
            />
          </div>
          <select className={`${fieldClass} w-full md:w-auto md:min-w-44`} name="employerId" defaultValue={employerId} aria-label={t("الكفيل", "Sponsor")}>
            <option value="">{t("كل الكفلاء", "All sponsors")}</option>
            {employers.map((employer) => (
              <option key={employer.id} value={employer.id}>
                {employerName(employer)}
              </option>
            ))}
            <option value="none">{t("بدون كفيل", "No sponsor")}</option>
          </select>
          <select className={`${fieldClass} w-full md:w-auto md:min-w-36`} name="status" defaultValue={status} aria-label={t("الحالة", "Status")}>
            <option value="ALL">{t("كل الحالات", "All statuses")}</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {pick(label, lang)}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button className={`${primaryBtn} flex-1 md:flex-none`} type="submit">
              {t("بحث", "Search")}
            </button>
            {filtered ? (
              <Link href="/employees" className={`${secondaryBtn} flex-1 md:flex-none`}>
                {t("مسح", "Clear")}
              </Link>
            ) : null}
          </div>
        </GetForm>
      </Toolbar>

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? t("لا توجد نتائج", "No results") : t("لا يوجد موظفون", "No employees")}
          text={
            filtered
              ? t("جرّب كلمة بحث أخرى أو امسح عوامل التصفية.", "Try another search or clear the filters.")
              : t("أضف أول موظف لتبدأ بتسجيل الوثائق والرواتب.", "Add your first employee to start tracking documents and payroll.")
          }
        >
          {!filtered && allow.create ? (
            <Link href="/employees/new" className={primaryBtn}>
              <UserPlus size={17} />
              {t("إضافة موظف", "Add employee")}
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <>
        <p className="mb-2 px-1 text-xs font-medium text-slate-500">{t(`${employees.length} موظف`, `${employees.length} employee(s)`)}</p>
        <div className="table-shell">
          <table className="table-stack min-w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
                <th className="hidden px-4 py-3 text-start xl:table-cell">{t("الرقم", "No.")}</th>
                <th className="hidden px-4 py-3 text-start xl:table-cell">{t("الكفيل", "Sponsor")}</th>
                <th className="hidden px-4 py-3 text-start xl:table-cell">{t("الوظيفة", "Job")}</th>
                {allow.salaries ? <th className="px-4 py-3 text-start">{t("الراتب", "Salary")}</th> : null}
                <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
                {allow.docs ? <th className="px-4 py-3 text-start">{t("المستندات", "Documents")}</th> : null}
                {allow.edit || allow.remove ? <th className="px-4 py-3 text-end">{t("إجراءات", "Actions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const docs = worstExpiry(
                  [employee.idExpiry, employee.passportExpiry, employee.residenceExpiry, ...employee.documents.map((item) => item.expiryDate)],
                  limits,
                  lang,
                );
                const leave = leaveWarnings(computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes), user.company.leaveWarningDays);
                const leaveText = leave.some((item) => item.level === "exceeded")
                  ? t("تجاوز رصيد الإجازة", "Leave exceeded")
                  : leave.some((item) => item.level === "exhausted")
                    ? t("نفد رصيد الإجازة", "Leave used up")
                    : t("اقترب نفاد الإجازة", "Leave almost used");
                const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
                return (
                  <tr key={employee.id}>
                    <td className="cell-title px-4 py-3">
                      <Link href={`/employees/${employee.id}`} className="group flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800 ring-1 ring-inset ring-teal-100">
                          {name.trim().slice(0, 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 group-hover:text-teal-700">{name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            <span className="tabular hidden sm:inline xl:hidden">{employee.employeeNumber} · </span>
                            {text(nationalityName(employee.nationality, lang))}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="tabular hidden px-4 py-3 font-medium whitespace-nowrap text-slate-500 xl:table-cell" data-label={t("الرقم", "No.")}>
                      {employee.employeeNumber}
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell" data-label={t("الكفيل", "Sponsor")}>
                      {employee.employer ? (
                        <Link href={`/employers/${employee.employer.id}`} className="hover:text-teal-700">
                          {employerName(employee.employer)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell" data-label={t("الوظيفة", "Job")}>
                      {text(termText(employee.jobTitle, employee.jobTitleEn, lang))}
                    </td>
                    {allow.salaries ? (
                      <td className="tabular px-4 py-3 font-medium whitespace-nowrap" data-label={t("الراتب", "Salary")}>
                        {money(packageGross(employee), user.company.currency)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3" data-label={t("الحالة", "Status")}>
                      <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start">
                        <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
                        {allow.attendance && leave.length ? (
                          <Link href={`/employees/${employee.id}?tab=attendance`} title={leave.map((item) => leaveWarningText(item, lang)).join(" · ")}>
                            <ToneBadge tone="red">{leaveText}</ToneBadge>
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    {allow.docs ? (
                      <td className="px-4 py-3" data-label={t("المستندات", "Documents")}>
                        <ToneBadge tone={docs.tone}>{docs.label}</ToneBadge>
                      </td>
                    ) : null}
                    {allow.edit || allow.remove ? (
                      <td className="cell-actions px-4 py-3">
                        <div className="flex items-center gap-4 whitespace-nowrap sm:justify-end">
                          {allow.edit ? (
                            <Link href={`/employees/${employee.id}/edit`} className={linkAction}>
                              <Pencil size={14} />
                              {t("تعديل", "Edit")}
                            </Link>
                          ) : null}
                          {allow.remove ? (
                            <DeleteButton
                              action={deleteEmployee}
                              fields={{ id: employee.id }}
                              confirm={t(`حذف ${employee.fullName} نهائياً؟ لا يمكن التراجع.`, `Permanently delete ${employee.fullName}? This cannot be undone.`)}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
