import { isPlaceholderEmail } from "@/lib/accounts";
import { remindSubscriptions, settleStalePayments } from "@/lib/billing";
import { getDailyBrief } from "@/lib/brief";
import { channelReady, sendEmailMessage, sendPendingCopies } from "@/lib/delivery";
import { BACKUP_GRACE_HOURS, backupStatus, recordError } from "@/lib/errors";
import { issueDueLetterDrafts } from "@/lib/letter-drafts";
import { purgeOldLogins } from "@/lib/login-events";
import { remindExpiringDocuments } from "@/lib/notify";
import { permissionsFor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { purgeExpiredLimits } from "@/lib/rate-limit";
import { originOf } from "@/lib/request-origin";
import { companyAccess } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs every morning (vercel.json "crons"). Vercel sends `Authorization: Bearer $CRON_SECRET`; without the
 * secret configured the job refuses to run. Issues the letters scheduled for today, then for each company: sends waiting letter copies, and emails the
 * daily brief to admins and managers once the email channel is configured. Also checks that last night's backup ran
 * and clears expired attempt counters; any failure is recorded in the error log.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const origin = originOf(request);
  try {
    return Response.json(await runDaily(origin));
  } catch (error) {
    await recordError({ source: "CRON", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null, path: "/api/cron/daily", origin });
    return Response.json({ ok: false }, { status: 500 });
  }
}

async function runDaily(origin: string) {
  const scheduledLetters = await issueDueLetterDrafts(origin);
  const emailReady = channelReady("EMAIL");
  const companies = await prisma.company.findMany({ include: { memberships: { where: { acceptedAt: { not: null }, role: { in: ["ADMIN", "MANAGER"] } }, include: { user: true } } } });
  const results: { company: string; sent: number; failed: number; briefs: number; errors: number }[] = [];
  for (const { memberships, ...company } of companies) {
    if (!(await companyAccess(company.id)).active) continue;
    const copies = await sendPendingCopies(company.id, origin);
    let briefs = 0;
    let errors = 0;
    if (emailReady) {
      for (const member of memberships) {
        const to = member.user?.email || member.email;
        if (!to || isPlaceholderEmail(to)) continue;
        try {
          const brief = await getDailyBrief(company, permissionsFor(member.role, member.permissions, company.rolePermissions), "ar");
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
  const backup = await backupStatus();
  if (backup.overdue) {
    await recordError({ source: "BACKUP", message: `No successful backup in the last ${BACKUP_GRACE_HOURS} hours`, path: "/settings/system", origin });
  }
  const limitsCleared = await purgeExpiredLimits();
  const expiryReminders = await remindExpiringDocuments(origin);
  const paymentsSettled = await settleStalePayments();
  const subscriptionReminders = await remindSubscriptions(origin);
  const loginsPurged = await purgeOldLogins();
  return { ok: true, emailReady, scheduledLetters, results, backupOverdue: backup.overdue, limitsCleared, expiryReminders, paymentsSettled, subscriptionReminders, loginsPurged };
}
