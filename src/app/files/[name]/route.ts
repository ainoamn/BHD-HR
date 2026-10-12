import path from "path";
import { NextResponse } from "next/server";
import { can, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  const { name } = await context.params;
  const safeName = path.basename(name);
  const file = await prisma.storedFile.findFirst({ where: { name: safeName, companyId: user.companyId } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  const url = `/files/${safeName}`;
  const [isDocument, isIdentityCopy, isCv, isReceipt] = await Promise.all([
    prisma.employeeDocument.count({ where: { fileUrl: url, employee: { companyId: user.companyId } } }),
    prisma.employee.count({
      where: { companyId: user.companyId, OR: [{ idFileUrl: url }, { passportFileUrl: url }, { residenceFileUrl: url }] },
    }),
    prisma.candidate.count({ where: { companyId: user.companyId, cvUrl: url } }),
    prisma.expenseClaim.count({ where: { companyId: user.companyId, receiptUrl: url } }),
  ]);
  const allowed =
    (!(isDocument || isIdentityCopy) || can(user, "documents.view")) &&
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
