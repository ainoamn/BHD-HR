import type { Prisma } from "@prisma/client";
import type { BoardTask } from "@/components/task-board";
import type { Lang } from "./i18n";
import { prisma } from "./prisma";
import { dueInfo, isTaskPriority, isTaskStatus } from "./tasks";

const nameOf = (employee: { fullName: string; nameEn: string | null }, lang: Lang) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

/** Tasks shaped for the board and lists, in column order. */
export async function loadBoardTasks(where: Prisma.TaskWhereInput, lang: Lang): Promise<(BoardTask & { dueDate: Date | null; createdAt: Date })[]> {
  const rows = await prisma.task.findMany({
    where,
    include: {
      assignees: { include: { employee: { select: { id: true, fullName: true, nameEn: true } } } },
      items: { select: { done: true } },
      _count: { select: { comments: { where: { kind: "COMMENT" } } } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((task) => ({
    id: task.id,
    title: task.title,
    status: isTaskStatus(task.status) ? task.status : "TODO",
    priority: isTaskPriority(task.priority) ? task.priority : "NORMAL",
    due: dueInfo(task.dueDate, task.status, lang),
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    assignees: [...task.assignees]
      .sort((a, b) => Number(b.employeeId === task.leadId) - Number(a.employeeId === task.leadId))
      .map((item) => ({ id: item.employee.id, name: nameOf(item.employee, lang) })),
    items: { done: task.items.filter((item) => item.done).length, total: task.items.length },
    comments: task._count.comments,
  }));
}

export async function employeeOptions(companyId: string, lang: Lang) {
  const employees = await prisma.employee.findMany({
    where: { companyId, status: { not: "TERMINATED" } },
    select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
    orderBy: { fullName: "asc" },
  });
  return employees.map((employee) => ({ value: employee.id, label: nameOf(employee, lang), hint: employee.employeeNumber }));
}
