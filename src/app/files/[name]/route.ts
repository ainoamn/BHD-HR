import path from "path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  const { name } = await context.params;
  const safeName = path.basename(name);
  const file = await prisma.storedFile.findFirst({ where: { name: safeName, companyId: user.companyId } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
