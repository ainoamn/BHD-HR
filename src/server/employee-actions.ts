"use server";

import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND, NEW_EMPLOYER } from "@/lib/constants";
import { readEmployeeInput } from "@/lib/employee-input";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { removeUpload } from "@/lib/uploads";
import { clip, money, req, str } from "@/lib/utils";

async function nextEmployeeNumber(companyId: string) {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { employeeNumber: true } });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.employeeNumber.replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

async function resolveEmployer(formData: FormData, user: { companyId: string; permissions: readonly string[] }, errorPath: string) {
  const { t } = await getI18n();
  const companyId = user.companyId;
  const value = req(formData, "employerId");
  if (!value) return null;
  if (value === NEW_EMPLOYER) {
    if (!can(user, "employers.create")) go(errorPath, { error: t("ليست لديك صلاحية إضافة كفيل جديد", "You cannot add a new sponsor") });
    const name = clip(str(formData, "newEmployerName"), 150);
    if (!name || name.length < 2) go(errorPath, { error: t("اكتب اسم الكفيل الجديد", "Enter the new sponsor's name") });
    const kind = req(formData, "newEmployerKind");
    const employer = await prisma.employer.create({
      data: {
        companyId,
        name: name!,
        nameEn: clip(str(formData, "newEmployerNameEn"), 150),
        kind: EMPLOYER_KIND[kind] ? kind : "COMPANY",
        idNumber: clip(str(formData, "newEmployerIdNumber"), 40),
        phone: clip(str(formData, "newEmployerPhone"), 30),
      },
    });
    return employer.id;
  }
  const employer = await prisma.employer.findFirst({ where: { id: value, companyId } });
  if (!employer) go(errorPath, { error: t("الكفيل غير موجود", "Sponsor not found") });
  return employer!.id;
}

export async function createEmployee(formData: FormData) {
  const user = await requirePermission("employees.create", "/employees");
  const { t } = await getI18n();
  const input = readEmployeeInput(formData);
  if (!can(user, "salaries.edit")) Object.assign(input, { basicSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0 });
  if (input.fullName.length < 2) go("/employees/new", { error: t("الاسم الكامل مطلوب", "Full name is required") });
  const employerId = await resolveEmployer(formData, user, "/employees/new");
  const employeeNumber = await nextEmployeeNumber(user.companyId);
  const employee = await prisma.employee.create({
    data: { ...input, employerId, employeeNumber, companyId: user.companyId },
  });
  await writeAudit({
    userId: user.id,
    employeeId: employee.id,
    action: "EMPLOYEE_CREATE",
    message: t(`أضاف الموظف ${employee.fullName} برقم ${employee.employeeNumber}`, `Added employee ${employee.fullName} (${employee.employeeNumber})`),
  });
  refreshAll();
  go(`/employees/${employee.id}`, { message: t("تمت إضافة الموظف", "Employee added") });
}

export async function updateEmployee(formData: FormData) {
  const user = await requirePermission("employees.edit", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  const input = readEmployeeInput(formData);
  if (!can(user, "salaries.edit")) {
    input.basicSalary = existing!.basicSalary;
    input.housingAllowance = existing!.housingAllowance;
    input.transportAllowance = existing!.transportAllowance;
    input.otherAllowance = existing!.otherAllowance;
  }
  if (input.fullName.length < 2) go(`/employees/${id}/edit`, { error: t("الاسم الكامل مطلوب", "Full name is required") });
  const employerId = await resolveEmployer(formData, user, `/employees/${id}/edit`);
  await prisma.employee.update({ where: { id }, data: { ...input, employerId } });
  const before = packageGross(existing!);
  const after = packageGross(input);
  const currency = user.company.currency;
  const message =
    before !== after
      ? t(
          `عدّل بيانات ${existing!.fullName} والراتب من ${money(before, currency)} إلى ${money(after, currency)}`,
          `Updated ${existing!.fullName}; salary ${money(before, currency)} → ${money(after, currency)}`,
        )
      : t(`عدّل بيانات الموظف ${input.fullName}`, `Updated employee ${input.fullName}`);
  await writeAudit({ userId: user.id, employeeId: id, action: "EMPLOYEE_UPDATE", message });
  refreshAll();
  go(`/employees/${id}`, { message: t("تم حفظ البيانات", "Saved") });
}

/** Paid salaries are financial records, so an employee who has any is ended (status) instead of deleted. */
export async function deleteEmployee(formData: FormData) {
  const user = await requirePermission("employees.delete", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "id");
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { documents: { select: { fileUrl: true } }, _count: { select: { salaries: { where: { paid: true } } } } },
  });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  if (employee!._count.salaries > 0) {
    go(`/employees/${id}`, {
      error: t(
        `لا يمكن حذف ${employee!.fullName} لأن له ${employee!._count.salaries} راتب مصروف. غيّر حالته إلى «منتهي الخدمة» بدلاً من الحذف.`,
        `${employee!.fullName} has ${employee!._count.salaries} paid salary record(s) and cannot be deleted. Set the status to Terminated instead.`,
      ),
    });
  }
  await prisma.$transaction([
    prisma.auditLog.updateMany({ where: { employeeId: id, companyId: user.companyId }, data: { employeeId: null } }),
    prisma.employee.delete({ where: { id } }),
  ]);
  for (const document of employee!.documents) await removeUpload(document.fileUrl);
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_DELETE",
    message: t(`حذف الموظف ${employee!.fullName} (${employee!.employeeNumber})`, `Deleted employee ${employee!.fullName} (${employee!.employeeNumber})`),
  });
  refreshAll();
  go("/employees", { message: t("تم حذف الموظف", "Employee deleted") });
}
