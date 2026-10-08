"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { COMPANY_COOKIE, getSessionUser, sessionCookieOptions } from "@/lib/auth";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { req } from "@/lib/utils";

/** Only the account whose email was invited can take the seat; the link alone grants nothing. */
export async function acceptInvite(formData: FormData) {
  const token = req(formData, "token");
  const back = `/invite/${encodeURIComponent(token)}`;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const { t } = await getI18n();
  const invite = await prisma.membership.findUnique({ where: { inviteToken: token } });
  if (!invite) go(back);
  const email = user!.email.toLowerCase();
  if (invite!.userId && invite!.userId !== user!.id) go(back);
  if (!invite!.userId && invite!.email !== email) go(back, { error: t("هذه الدعوة لبريد آخر", "This invitation is for another email") });
  if (!invite!.userId || !invite!.acceptedAt) {
    await prisma.membership.update({ where: { id: invite!.id }, data: { userId: user!.id, acceptedAt: invite!.acceptedAt ?? new Date() } });
    await writeAudit({
      companyId: invite!.companyId,
      userId: user!.id,
      action: "MEMBER_JOIN",
      message: `قبل ${email} الدعوة (${invite!.role}) / ${email} accepted the invitation (${invite!.role})`,
    });
  }
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, invite!.companyId, sessionCookieOptions());
  redirect("/");
}
