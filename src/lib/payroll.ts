import { salaryDayWeight } from "./leave";
import { prisma } from "./prisma";
import { monthRange, round3 } from "./utils";

export async function countAbsenceDays(employeeId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const rows = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: { gte: start, lt: end },
      deductsSalary: true,
    },
  });
  return round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0));
}
