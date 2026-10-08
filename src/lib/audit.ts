import { prisma } from "./prisma";

export async function writeAudit(entry: {
  userId?: string | null;
  employeeId?: string | null;
  action: string;
  message: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId || null,
      employeeId: entry.employeeId || null,
      action: entry.action,
      message: entry.message,
    },
  });
}
