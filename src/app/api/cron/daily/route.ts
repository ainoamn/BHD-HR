import { getDailyBrief } from "@/lib/brief";
import { channelReady, sendEmailMessage, sendPendingCopies } from "@/lib/delivery";
import { permissionsFor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { originOf } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs every morning (vercel.json "crons"). Vercel sends `Authorization: Bearer $CRON_SECRET`; without the
 * secret configured the job refuses to run. For each company: sends waiting letter copies, and emails the
 * daily brief to admins and managers once the email channel is configured.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const origin = originOf(request);
  const emailReady = channelReady("EMAIL");
  const companies = await prisma.company.findMany({ include: { memberships: { where: { acceptedAt: { not: null }, role: { in: ["ADMIN", "MANAGER"] } }, include: { user: true } } } });
  const results: { company: string; sent: number; failed: number; briefs: number; errors: number }[] = [];
  for (const { memberships, ...company } of companies) {
    const copies = await sendPendingCopies(company.id, origin);
    let briefs = 0;
    let errors = 0;
    if (emailReady) {
      for (const member of memberships) {
        const to = member.user?.email || member.email;
        if (!to) continue;
        try {
          const brief = await getDailyBrief(company, permissionsFor(member.role, member.permissions), "ar");
          if (!brief.alertCount) continue;
          await sendEmailMessage({
            to,
            subject: `ملخص اليوم — ${company.name}`,
            text: `${brief.text}\n\nافتح النظام: ${origin}/#brief`,
          });
          briefs += 1;
        } catch {
          errors += 1;
        }
      }
    }
    results.push({ company: company.id.slice(-6), sent: copies.sent, failed: copies.failed, briefs, errors });
  }
  return Response.json({ ok: true, emailReady, results });
}
