import {
  DEFAULT_ALLOWANCE_TYPES,
  DEFAULT_DEPARTMENTS,
  DEFAULT_LEAVE_TYPES,
  DEPARTMENT_RENAMES,
} from "@/lib/hr-defaults";
import { prisma } from "@/lib/prisma";

export type CatalogSyncResult = {
  departmentsAdded: number;
  departmentsUpdated: number;
  leaveAdded: number;
  leaveUpdated: number;
  allowancesAdded: number;
};

/**
 * Brings a company's departments, leave types and allowances in line with the curated defaults:
 * adds missing rows, fills empty English, renames known aliases, and tunes legacy leave cycles —
 * without deleting anything the company already uses.
 */
export async function syncHrCatalogDefaults(companyId: string): Promise<CatalogSyncResult> {
  let departmentsAdded = 0;
  let departmentsUpdated = 0;
  let leaveAdded = 0;
  let leaveUpdated = 0;
  let allowancesAdded = 0;

  const departments = await prisma.department.findMany({ where: { companyId } });
  const byDeptName = new Map(departments.map((row) => [row.nameAr, row]));

  for (const [from, [toAr, toEn]] of Object.entries(DEPARTMENT_RENAMES)) {
    const row = byDeptName.get(from);
    if (!row) continue;
    const clash = byDeptName.get(toAr);
    if (clash && clash.id !== row.id) {
      await prisma.$transaction([
        prisma.employee.updateMany({
          where: { companyId, departmentId: row.id },
          data: { departmentId: clash.id, department: clash.nameAr, departmentEn: clash.nameEn || toEn },
        }),
        prisma.department.delete({ where: { id: row.id } }),
      ]);
      byDeptName.delete(from);
      departmentsUpdated += 1;
      continue;
    }
    await prisma.department.update({ where: { id: row.id }, data: { nameAr: toAr, nameEn: toEn } });
    await prisma.employee.updateMany({
      where: { companyId, departmentId: row.id },
      data: { department: toAr, departmentEn: toEn },
    });
    byDeptName.delete(from);
    byDeptName.set(toAr, { ...row, nameAr: toAr, nameEn: toEn });
    departmentsUpdated += 1;
  }

  for (const [nameAr, nameEn] of DEFAULT_DEPARTMENTS) {
    const existing = byDeptName.get(nameAr);
    if (!existing) {
      await prisma.department.create({ data: { companyId, nameAr, nameEn } });
      departmentsAdded += 1;
      continue;
    }
    if (!existing.nameEn?.trim() || (nameAr === "الجودة" && existing.nameEn === "Quality")) {
      await prisma.department.update({ where: { id: existing.id }, data: { nameEn } });
      await prisma.employee.updateMany({ where: { companyId, departmentId: existing.id }, data: { departmentEn: nameEn } });
      departmentsUpdated += 1;
    }
  }

  const leaveTypes = await prisma.leaveType.findMany({ where: { companyId } });
  const byLeaveKey = new Map(leaveTypes.map((row) => [row.key, row]));
  const byLeaveName = new Map(leaveTypes.map((row) => [row.nameAr, row]));

  for (const seed of DEFAULT_LEAVE_TYPES) {
    const existing = byLeaveKey.get(seed.key) || byLeaveName.get(seed.nameAr);
    if (!existing) {
      await prisma.leaveType.create({
        data: {
          companyId,
          key: seed.key,
          nameAr: seed.nameAr,
          nameEn: seed.nameEn,
          days: seed.days,
          cycle: seed.cycle,
          carryCap: seed.carryCap,
          sortOrder: seed.sortOrder,
          allJobs: true,
          jobTitleIds: [],
        },
      });
      leaveAdded += 1;
      continue;
    }

    const data: {
      nameAr?: string;
      nameEn?: string | null;
      days?: number;
      cycle?: string;
      carryCap?: number | null;
      sortOrder?: number;
      key?: string;
    } = {};

    if (existing.key !== seed.key && !byLeaveKey.has(seed.key)) data.key = seed.key;
    if (existing.nameAr !== seed.nameAr) data.nameAr = seed.nameAr;
    if (!existing.nameEn?.trim()) data.nameEn = seed.nameEn;
    if (existing.sortOrder !== seed.sortOrder) data.sortOrder = seed.sortOrder;

    // Tune only the still-default legacy shapes so custom company values are kept.
    if (seed.key === "annual" && existing.cycle === "ONCE" && existing.days === 30) {
      data.cycle = "YEARLY";
      data.carryCap = seed.carryCap;
    }
    if (seed.key === "sick" && existing.days === 0) {
      data.days = seed.days;
      data.cycle = seed.cycle;
    }

    if (Object.keys(data).length) {
      await prisma.leaveType.update({ where: { id: existing.id }, data });
      leaveUpdated += 1;
    }
  }

  const allowances = await prisma.allowanceType.findMany({ where: { companyId }, select: { nameAr: true } });
  const allowanceNames = new Set(allowances.map((row) => row.nameAr));
  for (const seed of DEFAULT_ALLOWANCE_TYPES) {
    if (allowanceNames.has(seed.nameAr)) continue;
    await prisma.allowanceType.create({
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
    allowancesAdded += 1;
  }

  return { departmentsAdded, departmentsUpdated, leaveAdded, leaveUpdated, allowancesAdded };
}
