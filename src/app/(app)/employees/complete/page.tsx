import Link from "next/link";
import { ClipboardCheck, FileUp, PartyPopper, Pencil } from "lucide-react";
import { Flash } from "@/components/flash";
import { EmptyState, PageHeader, ToneBadge, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { GAP_LABEL, profileGaps, type GapKey } from "@/lib/employee-gaps";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SALARY_GAPS: GapKey[] = ["basicSalary", "bank"];

/** Employees whose file lacks what payroll, WPS and expiry alerts need; after an import, only the ones just saved. */
export default async function CompleteEmployeesPage({ searchParams }: { searchParams: Promise<{ since?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("employees.edit", "/employees");
  const { lang, t } = await getI18n();
  const since = Number(sp.since);
  const recent = Number.isFinite(since) && since > 0 ? new Date(since) : null;
  const salaryAccess = can(user, "salaries.edit");
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" }, ...(recent ? { updatedAt: { gte: recent } } : {}) },
    select: {
      id: true,
      fullName: true,
      nameEn: true,
      employeeNumber: true,
      nationality: true,
      gender: true,
      dateOfBirth: true,
      phone: true,
      idNumber: true,
      idExpiry: true,
      passportNumber: true,
      passportExpiry: true,
      employerId: true,
      jobTitle: true,
      joiningDate: true,
      basicSalary: true,
      bankBic: true,
      bankAccount: true,
      _count: { select: { documents: { where: { type: "WORK_PERMIT" } } } },
    },
    orderBy: recent ? { createdAt: "asc" } : { fullName: "asc" },
    take: 1000,
  });
  const rows = employees
    .map((employee) => ({
      employee,
      gaps: profileGaps({ ...employee, hasWorkPermit: employee._count.documents > 0 }).filter((gap) => salaryAccess || !SALARY_GAPS.includes(gap)),
    }))
    .filter((row) => row.gaps.length);
  const name = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn) || employee.fullName;

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={ClipboardCheck}
        title={t("إكمال بيانات الموظفين", "Complete employee details")}
        description={
          recent
            ? t("الموظفون الذين أُضيفوا أو حُدّثوا للتو وتنقص ملفاتهم بيانات. أكملها ليعمل الراتب وملف حماية الأجور وتنبيهات الوثائق كما يجب.", "Employees just added or updated whose files lack details. Complete them so payroll, WPS and document alerts work properly.")
            : t("كل موظف تنقص ملفه بيانات يحتاجها الراتب أو ملف حماية الأجور أو تنبيهات انتهاء الوثائق.", "Every employee whose file lacks details needed for payroll, WPS or document expiry alerts.")
        }
      >
        {recent ? (
          <Link href="/employees/complete" className={secondaryBtn}>
            {t("كل الموظفين", "All employees")}
          </Link>
        ) : null}
        {can(user, "employees.create") ? (
          <Link href="/employees/import" className={secondaryBtn}>
            <FileUp size={16} />
            {t("إضافة دفعة واحدة", "Bulk add")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      {rows.length ? (
        <>
          <p className="text-sm text-slate-600">{t(`${rows.length} موظفاً تنقص ملفاتهم بيانات.`, `${rows.length} employee(s) with missing details.`)}</p>
          <ul className="space-y-2">
            {rows.map(({ employee, gaps }) => (
              <li key={employee.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-surface p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-900">
                    <Link href={`/employees/${employee.id}`} className="hover:underline">
                      {name(employee)}
                    </Link>
                    <span className="text-xs font-normal text-slate-500" dir="ltr">
                      {employee.employeeNumber}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {gaps.map((gap) => (
                      <ToneBadge key={gap} tone="amber">
                        {GAP_LABEL[gap][lang]}
                      </ToneBadge>
                    ))}
                  </div>
                </div>
                <Link href={`/employees/${employee.id}/edit?complete=1`} className={secondaryBtn}>
                  <Pencil size={15} />
                  {t("أكمل", "Complete")}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          icon={PartyPopper}
          title={t("الملفات مكتملة", "All files are complete")}
          text={recent ? t("كل الموظفين الذين حُفظوا للتو ملفاتهم مكتملة.", "Everyone just saved has a complete file.") : t("لا يوجد موظف تنقص ملفه بيانات أساسية.", "No employee is missing essential details.")}
        />
      )}
    </div>
  );
}
