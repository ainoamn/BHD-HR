import { EmployeeForm } from "@/components/employee-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { createEmployee } from "@/server/employee-actions";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ employerId?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("employees.create");
  const { t } = await getI18n();
  const employers = await prisma.employer.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, nameEn: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("إضافة موظف", "Add employee")} description={t("أدخل البيانات والوثائق والراتب. رقم الموظف يُنشأ تلقائياً.", "Enter details, documents and salary. The employee number is generated automatically.")} />
      <Flash error={sp.error} message={sp.message} />
      <EmployeeForm
        action={createEmployee}
        currency={user.company.currency}
        employers={employers}
        defaultEmployerId={sp.employerId}
        showSalary={can(user, "salaries.edit")}
      />
    </div>
  );
}
