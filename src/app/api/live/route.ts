import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, sessionUserId } from "@/lib/auth";
import { liveVersion } from "@/lib/live";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Read-only and cookie-free (BHD-SESSION-POLICY): which scopes this page watches, or null if it may not watch any. */
async function scopesFor(url: URL): Promise<string[] | null> {
  const portal = url.searchParams.get("portal");
  if (portal) {
    if (portal.length < 20) return null;
    const employee = await prisma.employee.findUnique({ where: { portalToken: portal }, select: { id: true, companyId: true, status: true } });
    return employee && employee.status !== "TERMINATED" ? [`e:${employee.id}`, `p:${employee.companyId}`] : null;
  }
  const task = url.searchParams.get("task");
  if (task) {
    if (task.length < 20 || task.length > 64) return null;
    const invite = await prisma.taskInvite.findUnique({ where: { token: task }, select: { taskId: true, revokedAt: true } });
    return invite && !invite.revokedAt ? [`t:${invite.taskId}`] : null;
  }
  const jar = await cookies();
  const userId = await sessionUserId(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const wanted = jar.get(COMPANY_COOKIE)?.value;
  const member =
    (wanted ? await prisma.membership.findFirst({ where: { userId, companyId: wanted }, select: { companyId: true } }) : null) ??
    (await prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { companyId: true } }));
  return member ? [`c:${member.companyId}`] : null;
}

export async function GET(request: Request) {
  const scopes = await scopesFor(new URL(request.url));
  const v = scopes ? await liveVersion(prisma, scopes) : null;
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
