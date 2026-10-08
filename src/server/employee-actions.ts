"use server";

import { writeAudit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth";
import { EMPLOYER_KIND, NEW_EMPLOYER } from "@/lib/constants";
import { readEmployeeInput } from "@/lib/employee-input";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { clip, money, req, str } from "@/lib/utils";

async function nextEmployeeNumber(companyId: string) {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { employeeNumber: true } });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.employeeNumber.replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

async function resolveEmployer(formData: FormData, companyId: string, errorPath: string) {
  const { t } = await getI18n();
  const value = req(formData, "employerId");
  if (!value) return null;
  if (value === NEW_EMPLOYER) {
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
  const user = await requireWriter();
  const { t } = await getI18n();
  const input = readEmployeeInput(formData);
  if (input.fullName.length < 2) go("/employees/new", { error: t("الاسم الكامل مطلوب", "Full name is required") });
  const employerId = await resolveEmployer(formData, user.companyId, "/employees/new");
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
  const user = await requireWriter();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const existing = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  const input = readEmployeeInput(formData);
  if (input.fullName.length < 2) go(`/employees/${id}/edit`, { error: t("الاسم الكامل مطلوب", "Full name is required") });
  const employerId = await resolveEmployer(formData, user.companyId, `/employees/${id}/edit`);
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
