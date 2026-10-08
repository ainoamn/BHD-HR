import Link from "next/link";
import { Flash } from "@/components/flash";
import { EmptyState, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { BALANCE_LABEL, STATUS_LABEL, STATUS_TONE, localizeTerm } from "@/lib/constants";
import { worstExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, leaveWarningText, leaveWarnings } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { money, text } from "@/lib/utils";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; employerId?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const q = sp.q?.trim() || "";
  const status = sp.status && STATUS_LABEL[sp.status] ? sp.status : "ALL";
  const employerId = sp.employerId || "";
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const [employees, employers] = await Promise.all([
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
                { jobTitle: { contains: q, mode: "insensitive" } },
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
  ]);
  const employerName = (employer: { name: string; nameEn: string | null } | null) =>
    employer ? (lang === "en" && employer.nameEn ? employer.nameEn : employer.name) : "—";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("الموظفون", "Employees")} description={t("سجل العمال وبيانات الراتب وحالة الوثائق.", "Staff records, salaries and document status.")}>
        <Link href="/employees/new" className={primaryBtn}>
          {t("إضافة موظف", "Add employee")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className={`${fieldClass} w-full sm:w-72`} name="q" defaultValue={q} placeholder={t("بحث بالاسم أو الرقم أو الهاتف", "Search name, number or phone")} />
        <select className={fieldClass} name="employerId" defaultValue={employerId}>
          <option value="">{t("كل الكفلاء", "All sponsors")}</option>
          {employers.map((employer) => (
            <option key={employer.id} value={employer.id}>
              {employerName(employer)}
            </option>
          ))}
          <option value="none">{t("بدون كفيل", "No sponsor")}</option>
        </select>
        <select className={fieldClass} name="status" defaultValue={status}>
          <option value="ALL">{t("كل الحالات", "All statuses")}</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {pick(label, lang)}
            </option>
          ))}
        </select>
        <button className={secondaryBtn} type="submit">
          {t("بحث", "Search")}
        </button>
      </form>

      {employees.length === 0 ? (
        <EmptyState title={t("لا يوجد موظفون", "No employees")} text={t("أضف أول موظف لتبدأ بتسجيل الوثائق والرواتب.", "Add your first employee to start tracking documents and payroll.")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-start text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-start">{t("الرقم", "No.")}</th>
                <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
                <th className="px-4 py-3 text-start">{t("الكفيل", "Sponsor")}</th>
                <th className="px-4 py-3 text-start">{t("الوظيفة", "Job")}</th>
                <th className="px-4 py-3 text-start">{t("الراتب", "Salary")}</th>
                <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
                <th className="px-4 py-3 text-start">{t("المستندات", "Documents")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const docs = worstExpiry(
                  [employee.idExpiry, employee.passportExpiry, employee.residenceExpiry, ...employee.documents.map((item) => item.expiryDate)],
                  limits,
                  lang,
                );
                const leave = leaveWarnings(computeLeaveBalances(employee, employee.attendance, employee.leaveCredits), user.company.leaveWarningDays);
                const leaveText = leave.some((item) => item.level === "exceeded")
                  ? t("تجاوز رصيد الإجازة", "Leave exceeded")
                  : leave.some((item) => item.level === "exhausted")
                    ? t("نفد رصيد الإجازة", "Leave used up")
                    : t("اقترب نفاد الإجازة", "Leave almost used");
                return (
                  <tr key={employee.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-500">{employee.employeeNumber}</td>
                    <td className="px-4 py-3">
                      <Link href={`/employees/${employee.id}`} className="font-semibold text-slate-900 hover:text-teal-800">
                        {employee.fullName}
                      </Link>
                      <div className="text-xs text-slate-500">{text(localizeTerm(employee.nationality, lang))}</div>
                    </td>
                    <td className="px-4 py-3">
                      {employee.employer ? (
                        <Link href={`/employers/${employee.employer.id}`} className="hover:text-teal-800">
                          {employerName(employee.employer)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{text(localizeTerm(employee.jobTitle, lang))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{money(packageGross(employee), user.company.currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
                        {leave.length ? (
                          <Link href={`/employees/${employee.id}?tab=attendance`} title={leave.map((item) => leaveWarningText(item, pick(BALANCE_LABEL[item.key], lang), lang)).join(" · ")}>
                            <ToneBadge tone="red">{leaveText}</ToneBadge>
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ToneBadge tone={docs.tone}>{docs.label}</ToneBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
