import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
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
  const user = await requireUser();
  const { t } = await getI18n();
  const [employee, employers] = await Promise.all([
    prisma.employee.findFirst({ where: { id, companyId: user.companyId } }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
  ]);
  if (!employee) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("تعديل بيانات الموظف", "Edit employee")} description={employee.fullName} />
      <Flash error={sp.error} message={sp.message} />
      <EmployeeForm action={updateEmployee} employee={employee} currency={user.company.currency} employers={employers} />
    </div>
  );
}
