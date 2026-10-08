import { getSessionUser } from "./auth";
import { prisma } from "./prisma";

export async function writeAudit(entry: {
  companyId?: string;
  userId?: string | null;
  employeeId?: string | null;
  action: string;
  message: string;
}) {
  const companyId = entry.companyId ?? (await getSessionUser())?.companyId;
  if (!companyId) throw new Error("audit entry without company");
  await prisma.auditLog.create({
    data: {
      companyId,
      userId: entry.userId || null,
      employeeId: entry.employeeId || null,
      action: entry.action,
      message: entry.message,
    },
  });
}
