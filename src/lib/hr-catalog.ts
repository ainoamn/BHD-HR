import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { BALANCE_LABEL } from "./constants";
import { DEFAULT_DEPARTMENTS, DEFAULT_JOB_TITLES } from "./hr-defaults";
import { prisma } from "./prisma";

const CATALOG_VERSION = 1;

/** The four balances that existed before leave types became editable, with the defaults the old columns used. */
const LEGACY_LEAVE = [
  { key: "annual", days: 30, column: "annualLeaveDays" },
  { key: "sick", days: 0, column: "sickLeaveDays" },
  { key: "compensatory", days: 0, column: null },
  { key: "other", days: 0, column: "otherLeaveDays" },
] as const;

/**
 * Seeds a company's job titles, departments and leave types once, then links existing employees to them:
 * free-text job titles and departments become catalog entries, and leave days that differed from the old
 * defaults become per-employee overrides so no balance changes.
 */
async function ensureCatalog(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { catalogVersion: true } });
  if (!company || company.catalogVersion >= CATALOG_VERSION) return;
  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.company.updateMany({ where: { id: companyId, catalogVersion: { lt: CATALOG_VERSION } }, data: { catalogVersion: CATALOG_VERSION } });
      if (claimed.count === 0) return;

      await tx.jobTitle.createMany({ data: DEFAULT_JOB_TITLES.map(([nameAr, nameEn]) => ({ companyId, nameAr, nameEn })), skipDuplicates: true });
      await tx.department.createMany({ data: DEFAULT_DEPARTMENTS.map(([nameAr, nameEn]) => ({ companyId, nameAr, nameEn })), skipDuplicates: true });
      await tx.leaveType.createMany({
        data: LEGACY_LEAVE.map((item, index) => ({ companyId, key: item.key, nameAr: BALANCE_LABEL[item.key].ar, nameEn: BALANCE_LABEL[item.key].en, days: item.days, sortOrder: index })),
        skipDuplicates: true,
      });

      const employees = await tx.employee.findMany({
        where: { companyId },
        select: { id: true, jobTitle: true, department: true, annualLeaveDays: true, sickLeaveDays: true, otherLeaveDays: true },
      });
      const jobTitles = await tx.jobTitle.findMany({ where: { companyId } });
      const departments = await tx.department.findMany({ where: { companyId } });
      const match = <T extends { nameAr: string; nameEn: string | null }>(list: T[], value: string) =>
        list.find((item) => item.nameAr === value || item.nameEn?.toLowerCase() === value.toLowerCase());

      for (const employee of employees) {
        const data: Prisma.EmployeeUncheckedUpdateInput = {};
        const jobText = employee.jobTitle?.trim();
        if (jobText) {
          let job = match(jobTitles, jobText);
          if (!job) {
            job = await tx.jobTitle.create({ data: { companyId, nameAr: jobText } });
            jobTitles.push(job);
          }
          Object.assign(data, { jobTitleId: job.id, jobTitle: job.nameAr, jobTitleEn: job.nameEn });
        }
        const departmentText = employee.department?.trim();
        if (departmentText) {
          let department = match(departments, departmentText);
          if (!department) {
            department = await tx.department.create({ data: { companyId, nameAr: departmentText } });
            departments.push(department);
          }
          Object.assign(data, { departmentId: department.id, department: department.nameAr, departmentEn: department.nameEn });
        }
        const overrides: Record<string, number> = {};
        for (const item of LEGACY_LEAVE) {
          if (!item.column) continue;
          const value = employee[item.column];
          if (value !== item.days) overrides[item.key] = value;
        }
        if (Object.keys(overrides).length) data.leaveDays = overrides;
        if (Object.keys(data).length) await tx.employee.update({ where: { id: employee.id }, data });
      }
    },
    { maxWait: 10000, timeout: 60000 },
  );
}

export const getHrCatalog = cache(async (companyId: string) => {
  await ensureCatalog(companyId);
  const [jobTitles, departments, leaveTypes, allowanceTypes] = await Promise.all([
    prisma.jobTitle.findMany({ where: { companyId }, orderBy: { nameAr: "asc" } }),
    prisma.department.findMany({ where: { companyId }, orderBy: { nameAr: "asc" } }),
    prisma.leaveType.findMany({ where: { companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.allowanceType.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { jobTitles, departments, leaveTypes, allowanceTypes };
});

export const getLeaveTypes = async (companyId: string) => (await getHrCatalog(companyId)).leaveTypes;
