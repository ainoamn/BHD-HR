import { prisma } from "./prisma";

/** Scope key for per-employer (كفيل) employee numbers; empty string when the employee has no employer. */
export function employeeNumberScope(employerId?: string | null) {
  return employerId || "";
}

/** Next EMP-0001-style number for this company + employer (each كفيل has its own series). */
export async function nextEmployeeNumber(companyId: string, employerId?: string | null) {
  const numberScope = employeeNumberScope(employerId);
  const rows = await prisma.employee.findMany({
    where: { companyId, numberScope },
    select: { employeeNumber: true },
  });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.employeeNumber.replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}
