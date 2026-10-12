import { prisma } from "./prisma";

/** Next EMP-0001-style number inside the company. */
export async function nextEmployeeNumber(companyId: string) {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { employeeNumber: true } });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.employeeNumber.replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}
