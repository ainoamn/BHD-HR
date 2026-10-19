import Link from "next/link";
import { BookUser, ClipboardCheck, FileUp, KeyRound, Pencil, Search, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { GetForm } from "@/components/get-form";
import { ColumnHead } from "@/components/column-head";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { EmployeeBulkBar } from "@/components/employee-bulk-bar";
import { DeleteButton } from "@/components/row-forms";
import { EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { profileGaps } from "@/lib/employee-gaps";
import { STATUS_LABEL, STATUS_TONE, termText } from "@/lib/constants";
import { worstExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, leaveWarningText, leaveWarnings } from "@/lib/leave";
import { nationalityName } from "@/lib/nationalities";
import { BULK_FORM, employeeFilterQuery, employeeWhere, readEmployeeFilter } from "@/lib/employee-filter";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { money, text } from "@/lib/utils";
import { openMissingEmployeeAccounts } from "@/server/account-actions";
import { deleteEmployee } from "@/server/employee-actions";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; employerId?: string; sort?: string; dir?: string; fname?: string; fnat?: string; fno?: string; fsponsor?: string; fjob?: string; fsalary?: string; fstatus?: string; fdocs?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const filter = readEmployeeFilter(sp);
  const { q, status, employerId } = filter;
  const allow = {
    create: can(user, "employees.create"),
    edit: can(user, "employees.edit"),
    remove: can(user, "employees.delete"),
    salaries: can(user, "salaries.view"),
    docs: can(user, "documents.view"),
    attendance: can(user, "attendance.view"),
  };
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const [employees, employers, leaveTypes, schedules] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere(user.companyId, filter),
      include: {
        documents: { select: { expiryDate: true } },
        employer: true,
        attendance: { select: { type: true, balanceKey: true, date: true } },
        leaveCredits: { select: { balanceKey: true, days: true } },
        account: { select: { id: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    getLeaveTypes(user.companyId),
    prisma.workSchedule.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const employerName = (employer: { name: string; nameEn: string | null } | null) =>
    employer ? (lang === "en" && employer.nameEn ? employer.nameEn : employer.name) : "—";

  const filtered = Boolean(q || employerId || status !== "ALL");
  const noAccount = (employee: { status: string; account: { id: string } | null }) => !employee.account && employee.status !== "TERMINATED";
  const withoutAccount = allow.edit
    ? await prisma.employee.count({ where: { companyId: user.companyId, status: { not: "TERMINATED" }, account: null } })
    : 0;
  const includes = (value: string, query?: string) => {
    const needle = (query || "").trim().toLowerCase();
    return !needle || value.toLowerCase().includes(needle);
  };
  const listed = employees
    .filter((employee) => {
      const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
      const docs = worstExpiry([employee.idExpiry, employee.passportExpiry, employee.residenceExpiry, ...employee.documents.map((item) => item.expiryDate)], limits, lang);
      return (
        includes(name, sp.fname) &&
        includes(nationalityName(employee.nationality, lang) || "", sp.fnat) &&
        includes(employee.employeeNumber, sp.fno) &&
        includes(employerName(employee.employer), sp.fsponsor) &&
        includes(termText(employee.jobTitle, employee.jobTitleEn, lang) || "", sp.fjob) &&
        includes(`${packageGross(employee)} ${money(packageGross(employee), user.company.currency)}`, sp.fsalary) &&
        includes(pick(STATUS_LABEL[employee.status], lang, employee.status), sp.fstatus) &&
        includes(docs.label, sp.fdocs)
      );
    })
    .sort((a, b) => {
      const sort = ["name", "nat", "no", "sponsor", "job", "salary", "status", "docs"].includes(sp.sort || "") ? sp.sort || "name" : "name";
      const direction = sp.dir === "desc" ? -1 : 1;
      if (sort === "salary") return (packageGross(a) - packageGross(b)) * direction;
      if (sort === "docs") {
        const days = (employee: typeof a) =>
          worstExpiry([employee.idExpiry, employee.passportExpiry, employee.residenceExpiry, ...employee.documents.map((item) => item.expiryDate)], limits, lang).days;
        return (days(a) - days(b)) * direction;
      }
      const label = (employee: typeof a) => {
        if (sort === "nat") return nationalityName(employee.nationality, lang) || "";
        if (sort === "no") return employee.employeeNumber;
        if (sort === "sponsor") return employerName(employee.employer);
        if (sort === "job") return termText(employee.jobTitle, employee.jobTitleEn, lang) || "";
        if (sort === "status") return pick(STATUS_LABEL[employee.status], lang, employee.status);
        return lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
      };
      return label(a).localeCompare(label(b), lang === "en" ? "en" : "ar") * direction;
    });
  const listParams = new URLSearchParams(employeeFilterQuery(filter).replace(/^\?/, ""));
  for (const key of ["sort", "dir", "fname", "fnat", "fno", "fsponsor", "fjob", "fsalary", "fstatus", "fdocs"] as const) {
    if (sp[key]) listParams.set(key, sp[key]);
  }
  const listQuery = listParams.toString() ? `?${listParams}` : "";
  const salaryEdit = can(user, "salaries.edit");
  const incomplete = allow.edit
    ? employees.filter(
        (employee) =>
          employee.status !== "TERMINATED" && profileGaps(employee).some((gap) => salaryEdit || (gap !== "basicSalary" && gap !== "bank")),
      ).length
    : 0;

  return (
    <div className="page-wide">
      <PageHeader icon={Users} title={t("الموظفون", "Employees")} description={t("سجل العمال وبيانات الراتب وحالة الوثائق.", "Staff records, salaries and document status.")}>
        {employees.length ? (
          <Link
            href={`/employees/passport-stickers${listQuery}`}
            className={secondaryBtn}
            title={t("ملصق بيانات كل عامل في القائمة لوضعه داخل غلاف جوازه الخلفي", "A details sticker for each worker in the list, for the inside back cover of their passport")}
          >
            <BookUser size={17} />
            {t("ملصقات الجوازات", "Passport stickers")}
          </Link>
        ) : null}
        {incomplete ? (
          <Link href="/employees/complete" className={secondaryBtn}>
            <ClipboardCheck size={17} />
            {t(`بيانات ناقصة (${incomplete})`, `Missing details (${incomplete})`)}
          </Link>
        ) : null}
        {allow.create ? (
          <Link href="/employees/import" className={secondaryBtn}>
            <FileUp size={17} />
            {t("إضافة دفعة (Excel / PDF)", "Bulk add (Excel / PDF)")}
          </Link>
        ) : null}
        {allow.create ? (
          <Link href="/employees/new" className={primaryBtn}>
            <UserPlus size={17} />
            {t("إضافة موظف", "Add employee")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      {withoutAccount ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <KeyRound size={20} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="font-bold text-amber-900">
                {t(`${withoutAccount} موظف بلا حساب دخول`, `${withoutAccount} employee(s) without a sign-in account`)}
              </p>
              <p className="mt-0.5 text-sm leading-6 text-amber-800">
                {t(
                  "افتح حساباتهم ليدخلوا ويروا ملفاتهم ورواتبهم.",
                  "Open their accounts so they can sign in and see their file and pay.",
                )}
              </p>
            </div>
          </div>
          <form action={openMissingEmployeeAccounts} className="shrink-0">
            <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ فتح الحسابات...", "Opening accounts...")}>
              {t("فتح حساباتهم الآن", "Open their accounts now")}
            </SubmitButton>
          </form>
        </div>
      ) : null}
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
            {sp.sort ? <input type="hidden" name="sort" value={sp.sort} /> : null}
            {sp.dir ? <input type="hidden" name="dir" value={sp.dir} /> : null}
            {(["fname", "fnat", "fno", "fsponsor", "fjob", "fsalary", "fstatus", "fdocs"] as const).map((key) =>
              sp[key] ? <input key={key} type="hidden" name={key} value={sp[key]} /> : null,
            )}
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
        <p className="mb-2 px-1 text-xs font-medium text-slate-500">{t(`${listed.length} موظف`, `${listed.length} employee(s)`)}</p>
        <EmployeeBulkBar
          returnTo={`/employees${listQuery}`}
          canEdit={allow.edit}
          statuses={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label: pick(label, lang) }))}
          employers={employers.map((employer) => ({ value: employer.id, label: employerName(employer) }))}
          schedules={schedules.map((schedule) => ({ value: schedule.id, label: lang === "en" && schedule.nameEn ? schedule.nameEn : schedule.name }))}
        />
        <div className="table-shell">
          <table className="table-stack table-tools min-w-full text-sm">
            <thead>
              <tr>
                <ColumnHead column="name" label={t("الموظف", "Employee")} />
                <ColumnHead column="nat" label={t("الجنسية", "Nationality")} />
                <ColumnHead column="no" label={t("الرقم", "No.")} className="hidden xl:table-cell" />
                <ColumnHead column="sponsor" label={t("الكفيل", "Sponsor")} className="hidden xl:table-cell" />
                <ColumnHead column="job" label={t("الوظيفة", "Job")} className="hidden xl:table-cell" />
                {allow.salaries ? <ColumnHead column="salary" label={t("الراتب", "Salary")} /> : null}
                <ColumnHead column="status" label={t("الحالة", "Status")} />
                {allow.docs ? <ColumnHead column="docs" label={t("المستندات", "Documents")} /> : null}
                {allow.edit || allow.remove ? <th className="px-4 py-3 text-end">{t("إجراءات", "Actions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {listed.map((employee) => {
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
                      <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        name="ids"
                        value={employee.id}
                        form={BULK_FORM}
                        className="size-4 shrink-0 accent-teal-700"
                        aria-label={t(`تحديد ${name}`, `Select ${name}`)}
                      />
                      <Link href={`/employees/${employee.id}`} className="group flex min-w-0 items-center gap-3">
                        <EmployeeAvatar name={name} photo={employee.photoUrl} className="size-10 rounded-full bg-teal-50 text-sm text-teal-800 ring-1 ring-inset ring-teal-100" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 group-hover:text-teal-700">{name}</span>
                          <span className="block truncate text-xs text-slate-500 xl:hidden">
                            <span className="tabular">{employee.employeeNumber}</span>
                          </span>
                        </span>
                      </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700" data-label={t("الجنسية", "Nationality")}>
                      {text(nationalityName(employee.nationality, lang))}
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
                        {allow.edit && noAccount(employee) ? (
                          <Link href={`/employees/${employee.id}#account`}>
                            <ToneBadge tone="amber">{t("بلا حساب دخول", "No sign-in")}</ToneBadge>
                          </Link>
                        ) : null}
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
