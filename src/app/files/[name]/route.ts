import path from "path";
import { NextResponse } from "next/server";
import { can, canTeam, isStaffRole, requireUser, teamScope } from "@/lib/auth";
import { isTeamRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  if (!isStaffRole(user.role) && !isTeamRole(user.role)) return new NextResponse("Forbidden", { status: 403 });
  const { name } = await context.params;
  const safeName = path.basename(name);
  const file = await prisma.storedFile.findFirst({ where: { name: safeName, companyId: user.companyId } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  const url = `/files/${safeName}`;
  const team = isTeamRole(user.role);
  const scope = team ? await teamScope(user) : null;
  const inScope = scope ? { id: { in: scope } } : {};
  const [isDocument, isIdentityCopy, isCv, isReceipt, isTeamPhoto] = await Promise.all([
    prisma.employeeDocument.count({ where: { fileUrl: url, employee: { companyId: user.companyId, ...inScope } } }),
    prisma.employee.count({
      where: { companyId: user.companyId, ...inScope, OR: [{ idFileUrl: url }, { passportFileUrl: url }, { residenceFileUrl: url }] },
    }),
    team ? 0 : prisma.candidate.count({ where: { companyId: user.companyId, cvUrl: url } }),
    prisma.expenseClaim.count({ where: { companyId: user.companyId, receiptUrl: url, ...(scope ? { employeeId: { in: scope } } : {}) } }),
    team ? prisma.employee.count({ where: { companyId: user.companyId, ...inScope, photoUrl: url } }) : 0,
  ]);
  const allowed = team
    ? isTeamPhoto > 0 || (isDocument + isIdentityCopy > 0 && canTeam(user, "team.documents.view")) || (isReceipt > 0 && canTeam(user, "team.expenses.approve"))
    : (!(isDocument || isIdentityCopy) || can(user, "documents.view")) &&
      (!isCv || can(user, "recruitment.view") || (isDocument > 0 && can(user, "documents.view"))) &&
      (!isReceipt || can(user, "expenses.view"));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
