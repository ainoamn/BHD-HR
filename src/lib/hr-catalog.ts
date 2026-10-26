import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { DEFAULT_ALLOWANCE_TYPES, DEFAULT_DEPARTMENTS, DEFAULT_JOB_TITLES, DEFAULT_LEAVE_TYPES } from "./hr-defaults";
import { prisma } from "./prisma";

/** Bump when new default leave types / Oman labour leave alignment must be seeded into existing companies. */
const CATALOG_VERSION = 2;

/** The four balances that existed before leave types became editable, with the defaults the old columns used. */
const LEGACY_LEAVE = [
  { key: "annual", days: 30, column: "annualLeaveDays" },
  { key: "sick", days: 0, column: "sickLeaveDays" },
  { key: "compensatory", days: 0, column: null },
  { key: "other", days: 0, column: "otherLeaveDays" },
] as const;

async function seedLeaveTypes(tx: Prisma.TransactionClient, companyId: string) {
  await tx.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((seed) => ({
      companyId,
      key: seed.key,
      nameAr: seed.nameAr,
      nameEn: seed.nameEn,
      days: seed.days,
      cycle: seed.cycle,
      carryCap: seed.carryCap,
      sortOrder: seed.sortOrder,
    })),
    skipDuplicates: true,
  });
  // Oman MD 619/2024 alignment when the company still has the older built-in figures.
  const annual = await tx.leaveType.findFirst({ where: { companyId, key: "annual" }, select: { id: true, carryCap: true, days: true } });
  if (annual && annual.days === 30 && (annual.carryCap === 15 || annual.carryCap === null)) {
    await tx.leaveType.update({ where: { id: annual.id }, data: { carryCap: 30 } });
  }
  for (const key of ["hajj", "exam"] as const) {
    const row = await tx.leaveType.findFirst({ where: { companyId, key }, select: { id: true, days: true } });
    if (row && row.days === 14) await tx.leaveType.update({ where: { id: row.id }, data: { days: 15 } });
  }
}

/**
 * Seeds a company's job titles, departments and leave types once, then links existing employees to them:
 * free-text job titles and departments become catalog entries, and leave days that differed from the old
 * defaults become per-employee overrides so no balance changes.
 * Version 2 only adds Oman-aligned leave types without re-linking employees.
 */
async function ensureCatalog(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { catalogVersion: true } });
  if (!company || company.catalogVersion >= CATALOG_VERSION) return;
  const from = company.catalogVersion;
  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.company.updateMany({ where: { id: companyId, catalogVersion: from }, data: { catalogVersion: CATALOG_VERSION } });
      if (claimed.count === 0) return;

      if (from < 1) {
        await tx.jobTitle.createMany({ data: DEFAULT_JOB_TITLES.map(([nameAr, nameEn]) => ({ companyId, nameAr, nameEn })), skipDuplicates: true });
        await tx.department.createMany({ data: DEFAULT_DEPARTMENTS.map(([nameAr, nameEn]) => ({ companyId, nameAr, nameEn })), skipDuplicates: true });
        await seedLeaveTypes(tx, companyId);
        for (const seed of DEFAULT_ALLOWANCE_TYPES) {
          const exists = await tx.allowanceType.findFirst({ where: { companyId, nameAr: seed.nameAr }, select: { id: true } });
          if (!exists) {
            await tx.allowanceType.create({
              data: {
                companyId,
                nameAr: seed.nameAr,
                nameEn: seed.nameEn,
                calc: seed.calc,
                value: seed.value,
                base: seed.base,
                frequency: seed.frequency,
                payMonth: seed.payMonth,
              },
            });
          }
        }

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
            Object.assign(data, { jobTitleId: job.id, jobTitle: job.nameAr, jobTitleEn: job.nameEn, jobCode: job.code ?? null, jobClass: job.skillClass ?? null });
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
        return;
      }

      // v1 → v2: Oman leave alignment only.
      await seedLeaveTypes(tx, companyId);
    },
    { maxWait: 10000, timeout: 60000 },
  );
}

export const getHrCatalog = cache(async (companyId: string, opts?: { jobTitles?: boolean }) => {
  await ensureCatalog(companyId);
  const wantJobs = opts?.jobTitles !== false;
  const [jobTitles, jobTitleCount, departments, leaveTypes, allowanceTypes] = await Promise.all([
    wantJobs
      ? prisma.jobTitle.findMany({ where: { companyId }, orderBy: { nameAr: "asc" } })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.jobTitle.findMany>>),
    wantJobs ? Promise.resolve(0) : prisma.jobTitle.count({ where: { companyId } }),
    prisma.department.findMany({ where: { companyId }, orderBy: { nameAr: "asc" } }),
    prisma.leaveType.findMany({ where: { companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.allowanceType.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    jobTitles,
    jobTitleCount: wantJobs ? jobTitles.length : jobTitleCount,
    departments,
    leaveTypes,
    allowanceTypes,
  };
});

export const getLeaveTypes = async (companyId: string) => (await getHrCatalog(companyId, { jobTitles: false })).leaveTypes;
