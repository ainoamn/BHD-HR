"use server";

import type { Prisma } from "@prisma/client";
import { aiJobDescription, isRateLimited } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { JD_LISTS, readJobDescription, sanitizeJobDescription } from "@/lib/job-description";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { aiLockedMessage, aiOpen } from "@/lib/subscription";
import { req } from "@/lib/utils";

async function load(formData: FormData) {
  const user = await requirePermission("employees.edit");
  const employeeId = req(formData, "employeeId");
  const back = `/employees/${employeeId}/job-description`;
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: user.companyId },
    include: { jobTitleRef: true, manager: { select: { jobTitle: true, jobTitleEn: true } } },
  });
  const { t } = await getI18n();
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  if (!employee!.jobTitleRef) go(back, { error: t("حدّد المسمى الوظيفي للموظف من القائمة أولاً", "Set the employee's job title from the list first") });
  return { user, employee: employee!, jobTitle: employee!.jobTitleRef!, back, t };
}

/** Drafts the bilingual description for the employee's job title; it is shared by everyone with that title. */
export async function generateJobDescription(formData: FormData) {
  const { user, employee, jobTitle, back, t } = await load(formData);
  if (!(await aiOpen(user.companyId))) go(back, { error: aiLockedMessage(t) });
  let draft: ReturnType<typeof readJobDescription> = null;
  try {
    const result = await aiJobDescription({
      titleAr: jobTitle.nameAr,
      titleEn: jobTitle.nameEn,
      department: [employee.department, employee.departmentEn].filter(Boolean).join(" / ") || null,
      company: user.company.nameEn ? `${user.company.name} / ${user.company.nameEn}` : user.company.name,
      reportsTo: [employee.manager?.jobTitle, employee.manager?.jobTitleEn].filter(Boolean).join(" / ") || null,
    });
    draft = result ? readJobDescription(result) : null;
  } catch (error) {
    console.error("AI job description failed", error);
    go(back, {
      error: isRateLimited(error)
        ? t("المساعد مشغول الآن. حاول بعد دقيقة.", "The assistant is busy. Try again in a minute.")
        : t("تعذّر توليد الوصف الآن. حاول لاحقاً أو اكتبه يدوياً.", "The description could not be generated now. Try later or write it yourself."),
    });
  }
  if (!draft) go(back, { error: t("لم يُرجِع الذكاء الاصطناعي وصفاً صالحاً، حاول مرة أخرى", "The AI returned no usable description; try again") });
  await prisma.jobTitle.update({
    where: { id: jobTitle.id },
    data: { description: draft as unknown as Prisma.InputJsonValue, descriptionAt: new Date(), descriptionBy: user.name },
  });
  await writeAudit({ userId: user.id, employeeId: employee.id, action: "JOB_DESCRIPTION", message: `توليد الوصف الوظيفي لـ «${jobTitle.nameAr}» بالذكاء الاصطناعي` });
  refreshAll();
  go(back, { message: t("صيغ الوصف الوظيفي. راجعه وعدّله إن لزم ثم اطبعه.", "Job description drafted. Review and edit it if needed, then print.") });
}

export async function saveJobDescription(formData: FormData) {
  const { user, employee, jobTitle, back, t } = await load(formData);
  const input: Record<string, string> = { purposeAr: String(formData.get("purposeAr") || ""), purposeEn: String(formData.get("purposeEn") || "") };
  for (const key of JD_LISTS) {
    input[`${key}Ar`] = String(formData.get(`${key}Ar`) || "");
    input[`${key}En`] = String(formData.get(`${key}En`) || "");
  }
  const description = sanitizeJobDescription(input);
  await prisma.jobTitle.update({
    where: { id: jobTitle.id },
    data: { description: description as unknown as Prisma.InputJsonValue, descriptionAt: new Date(), descriptionBy: user.name },
  });
  await writeAudit({ userId: user.id, employeeId: employee.id, action: "JOB_DESCRIPTION", message: `تعديل الوصف الوظيفي لـ «${jobTitle.nameAr}»` });
  refreshAll();
  go(back, { message: t("حُفظ الوصف الوظيفي لكل من يحمل هذا المسمى", "Job description saved for everyone with this title") });
}
