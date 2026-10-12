import { notFound } from "next/navigation";
import { UserPen } from "lucide-react";
import { EmployeeForm } from "@/components/employee-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getHrCatalog } from "@/lib/hr-catalog";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { updateEmployee } from "@/server/employee-actions";

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.edit");
  const { t } = await getI18n();
  const [employee, employers, catalog, managers] = await Promise.all([
    prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { allowances: { orderBy: { createdAt: "asc" } } } }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    getHrCatalog(user.companyId),
    prisma.employee.findMany({
      where: { companyId: user.companyId, OR: [{ status: { not: "TERMINATED" } }, { reports: { some: { id } } }] },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (!employee) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={UserPen} title={t("تعديل بيانات الموظف", "Edit employee")} description={`${employee.fullName} · ${employee.employeeNumber}`} />
      <Flash error={sp.error} message={sp.message} />
      <EmployeeForm
        action={updateEmployee}
        employee={employee}
        allowances={employee.allowances}
        catalog={catalog}
        currency={user.company.currency}
        employers={employers}
        managers={managers}
        showSalary={can(user, "salaries.edit")}
        canManageCatalog={user.role === "ADMIN"}
      />
    </div>
  );
}
