import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, UserPen } from "lucide-react";
import { EmployeeForm } from "@/components/employee-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { GAP_LABEL, profileGaps } from "@/lib/employee-gaps";
import { getHrCatalog } from "@/lib/hr-catalog";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { updateEmployee } from "@/server/employee-actions";

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; complete?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.edit");
  const { lang, t } = await getI18n();
  const [employee, employers, catalog, managers, schedules] = await Promise.all([
    prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { allowances: { orderBy: { createdAt: "asc" } } } }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    getHrCatalog(user.companyId),
    prisma.employee.findMany({
      where: { companyId: user.companyId, OR: [{ status: { not: "TERMINATED" } }, { reports: { some: { id } } }] },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.workSchedule.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true, startTime: true, endTime: true }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!employee) notFound();
  const gaps = sp.complete
    ? profileGaps({ ...employee, hasWorkPermit: (await prisma.employeeDocument.count({ where: { employeeId: employee.id, type: "WORK_PERMIT" } })) > 0 }).filter(
        (gap) => can(user, "salaries.edit") || (gap !== "basicSalary" && gap !== "bank"),
      )
    : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={UserPen} title={t("تعديل بيانات الموظف", "Edit employee")} description={`${employee.fullName} · ${employee.employeeNumber}`} />
      <Flash error={sp.error} message={sp.message} />
      {gaps.length ? (
        <div className="mb-4 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <ClipboardCheck size={17} />
            {t("أكمل البيانات الناقصة لهذا الموظف:", "Complete this employee's missing details:")}
          </p>
          <p>{gaps.filter((gap) => gap !== "workPermit").map((gap) => GAP_LABEL[gap][lang]).join("، ")}</p>
          {gaps.includes("workPermit") ? (
            <p className="text-xs">
              {t("تصريح العمل يُضاف من ", "The work permit is added from ")}
              <Link href={`/employees/${employee.id}?tab=docs`} className="font-semibold underline">
                {t("وثائق الموظف", "the employee's documents")}
              </Link>
              .
            </p>
          ) : null}
          <p className="text-xs">
            <Link href="/employees/complete" className="underline">
              {t("قائمة كل من تنقص بياناتهم", "Everyone with missing details")}
            </Link>
          </p>
        </div>
      ) : null}
      <EmployeeForm
        action={updateEmployee}
        employee={employee}
        allowances={employee.allowances}
        catalog={catalog}
        currency={user.company.currency}
        employers={employers}
        managers={managers}
        schedules={schedules}
        showSalary={can(user, "salaries.edit")}
        canManageCatalog={user.role === "ADMIN"}
      />
    </div>
  );
}
