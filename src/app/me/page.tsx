import { redirect } from "next/navigation";
import { getSessionUser, homePath } from "@/lib/auth";
import { newPortalToken } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The signed-in person's own employee portal; the link key is created if HR never made one. */
export default async function MePage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?local=1&next=/me");
  if (user.username && user.mustChangePassword) redirect("/password");
  if (!user.employeeId) redirect(homePath(user) === "/me" ? "/login?local=1" : homePath(user));
  const employee = await prisma.employee.findFirst({ where: { id: user.employeeId, companyId: user.companyId }, select: { id: true, status: true, portalToken: true } });
  if (!employee || employee.status === "TERMINATED") {
    redirect(`/login?local=1&error=${encodeURIComponent("انتهت خدمتك في هذه المنشأة / Your service at this company has ended")}`);
  }
  let token = employee.portalToken;
  if (!token) {
    token = newPortalToken();
    await prisma.employee.update({ where: { id: employee.id }, data: { portalToken: token } });
  }
  redirect(`/portal/${token}${sp.message ? `?message=${encodeURIComponent(sp.message)}` : ""}`);
}
