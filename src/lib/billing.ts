import type { Payment } from "@prisma/client";
import { isPlaceholderEmail } from "./accounts";
import { channelReady, sendEmailMessage } from "./delivery";
import { receiptNumber } from "./platform";
import { formatRial } from "./plans";
import { prisma } from "./prisma";
import { periodAfterPayment } from "./subscription";

/**
 * Card payments through Thawani Pay (Oman), in rials. Settings:
 *   THAWANI_SECRET_KEY, THAWANI_PUBLISHABLE_KEY — from the Thawani merchant portal.
 *   THAWANI_MODE — "live" for real payments; anything else uses Thawani's test environment (test cards only).
 * Without the keys, companies pay by bank transfer and the platform admin confirms the payment.
 */
export function thawaniConfig() {
  const secret = process.env.THAWANI_SECRET_KEY?.trim();
  const publishable = process.env.THAWANI_PUBLISHABLE_KEY?.trim();
  if (!secret || !publishable) return null;
  const live = process.env.THAWANI_MODE?.trim().toLowerCase() === "live";
  const host = live ? "https://checkout.thawani.om" : "https://uatcheckout.thawani.om";
  return { secret, publishable, live, api: `${host}/api/v1`, pay: `${host}/pay` };
}

export function cardPaymentsReady() {
  return Boolean(thawaniConfig());
}

/** Rials to baisa (1 rial = 1000 baisa), the unit Thawani charges in. */
export function toBaisa(amount: number) {
  return Math.round(amount * 1000);
}

type ThawaniSession = { session_id: string; payment_status: string; total_amount?: number; client_reference_id?: string };

async function thawani<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = thawaniConfig();
  if (!config) throw new Error("Card payments are not configured");
  const response = await fetch(`${config.api}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "thawani-api-key": config.secret, ...(init.headers || {}) },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; description?: string } | null;
  if (!response.ok || !body?.success || !body.data) throw new Error(`Thawani ${response.status}: ${body?.description || "request failed"}`.slice(0, 300));
  return body.data;
}

/** Opens a checkout session for a pending payment and returns the page to send the payer to. */
export async function createCheckout(payment: Payment, origin: string) {
  const config = thawaniConfig()!;
  const session = await thawani<ThawaniSession>("/checkout/session", {
    method: "POST",
    body: JSON.stringify({
      client_reference_id: payment.id,
      mode: "payment",
      products: [{ name: `BHD HR ${payment.planName} ${payment.cycle === "YEARLY" ? "1Y" : "1M"}`.slice(0, 40), quantity: 1, unit_amount: toBaisa(payment.amount) }],
      success_url: `${origin}/api/billing/return?payment=${payment.id}`,
      cancel_url: `${origin}/api/billing/return?payment=${payment.id}&cancel=1`,
      metadata: { receipt: receiptNumber(payment.number), company: payment.companyId },
    }),
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.session_id } });
  return `${config.pay}/${session.session_id}?key=${config.publishable}`;
}

/**
 * Asks Thawani for the payment's real state — never trusts the browser or a webhook body — and applies it:
 * paid activates the plan, cancelled closes the attempt. Safe to call any number of times.
 */
export async function settleCardPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== "THAWANI" || !payment.providerRef) return payment?.status ?? null;
  if (payment.status !== "PENDING") return payment.status;
  const session = await thawani<ThawaniSession>(`/checkout/session/${encodeURIComponent(payment.providerRef)}`);
  if (session.payment_status === "paid") {
    if (typeof session.total_amount === "number" && session.total_amount < toBaisa(payment.amount)) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", note: `Paid ${session.total_amount} baisa, expected ${toBaisa(payment.amount)}` } });
      return "FAILED";
    }
    await applyPayment(payment.id);
    return "PAID";
  }
  if (session.payment_status === "cancelled") {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "CANCELED" } });
    return "CANCELED";
  }
  return "PENDING";
}

/**
 * Marks a pending payment paid and extends the company's subscription by what it bought. Only the first call
 * for a payment does anything, so a return page, a webhook and the daily check can all race safely.
 */
export async function applyPayment(paymentId: string, now = new Date()) {
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "PAID", paidAt: now } });
    if (!claimed.count) return null;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const plan = payment.planId ? await tx.plan.findUnique({ where: { id: payment.planId } }) : null;
    if (!plan) return { payment, period: null };
    const current = await tx.subscription.findUnique({ where: { companyId: payment.companyId }, include: { plan: true } });
    const period = periodAfterPayment({ now, current, plan, cycle: payment.cycle });
    const data = { planId: plan.id, status: "ACTIVE", cycle: payment.cycle, currentPeriodStart: period.start, currentPeriodEnd: period.end, lastReminder: null };
    await tx.subscription.upsert({ where: { companyId: payment.companyId }, create: { companyId: payment.companyId, ...data }, update: data });
    await tx.payment.update({ where: { id: payment.id }, data: { periodStart: period.start, periodEnd: period.end } });
    await tx.auditLog.create({
      data: {
        companyId: payment.companyId,
        userId: payment.createdById,
        action: "BILLING_PAID",
        message: `دُفع اشتراك ${plan.name} (${receiptNumber(payment.number)}) حتى ${period.end.toISOString().slice(0, 10)} / Paid ${plan.nameEn || plan.name} until ${period.end.toISOString().slice(0, 10)}`,
      },
    });
    return { payment: { ...payment, periodStart: period.start, periodEnd: period.end }, period };
  });
  if (result?.period) await emailReceipt(result.payment).catch((error) => console.error("receipt email", error));
  return result;
}

export async function companyAdminEmails(companyId: string) {
  const admins = await prisma.membership.findMany({ where: { companyId, role: "ADMIN", userId: { not: null } }, select: { email: true, user: { select: { email: true } } } });
  return [...new Set(admins.map((admin) => admin.user?.email || admin.email).filter((email) => email && !isPlaceholderEmail(email)))];
}

async function emailReceipt(payment: Payment) {
  if (!channelReady("EMAIL")) return;
  const until = payment.periodEnd ? payment.periodEnd.toISOString().slice(0, 10) : "";
  const text = [
    `شكراً لك. استلمنا دفعتك لاشتراك «${payment.planName}».`,
    `رقم الإيصال: ${receiptNumber(payment.number)}`,
    `المبلغ: ${formatRial(payment.amount)}`,
    until ? `الاشتراك ساري حتى: ${until}` : "",
    "",
    `Thank you. We received your payment for the ${payment.planName} plan (${receiptNumber(payment.number)}, ${formatRial(payment.amount, "en")}${until ? `, valid until ${until}` : ""}).`,
  ]
    .filter((line) => line !== null)
    .join("\n");
  for (const to of await companyAdminEmails(payment.companyId)) {
    await sendEmailMessage({ to, subject: `BHD HR — ${receiptNumber(payment.number)}`, text });
  }
}

/**
 * Emails company admins 7, 3 and 1 day(s) before the trial or paid period ends, and once when it has ended.
 * Each stage goes out once per end date (Subscription.lastReminder), even if the daily job skipped a day.
 */
export async function remindSubscriptions(origin: string, now = new Date()) {
  if (!channelReady("EMAIL")) return 0;
  const DAY = 86_400_000;
  const soon = new Date(now.getTime() + 8 * DAY);
  const ended = new Date(now.getTime() - 2 * DAY);
  const subs = await prisma.subscription.findMany({
    where: {
      company: { status: { not: "SUSPENDED" } },
      OR: [
        { status: "TRIAL", trialEndsAt: { gt: ended, lte: soon } },
        { status: { not: "TRIAL" }, currentPeriodEnd: { gt: ended, lte: soon } },
      ],
    },
    include: { plan: true, company: { select: { name: true } } },
  });
  let sent = 0;
  for (const sub of subs) {
    const end = sub.status === "TRIAL" ? sub.trialEndsAt : sub.currentPeriodEnd;
    if (!end) continue;
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
    const stage = daysLeft <= 0 ? 0 : daysLeft <= 1 ? 1 : daysLeft <= 3 ? 3 : daysLeft <= 7 ? 7 : null;
    if (stage === null) continue;
    const key = `${end.toISOString().slice(0, 10)}:${stage}`;
    if (sub.lastReminder === key) continue;
    const date = end.toISOString().slice(0, 10);
    const trial = sub.status === "TRIAL";
    const what = trial ? "التجربة المجانية" : `اشتراك «${sub.plan.name}»`;
    const whatEn = trial ? "free trial" : `${sub.plan.nameEn || sub.plan.name} subscription`;
    const text = [
      stage === 0
        ? `انتهت ${what} لشركة ${sub.company.name}. بياناتك محفوظة، وجدّد الاشتراك ليعود العمل فوراً.`
        : `تنتهي ${what} لشركة ${sub.company.name} بعد ${stage === 1 ? "يوم واحد" : `${daysLeft} أيام`} (${date}).`,
      `اختر الباقة وادفع من: ${origin}/billing`,
      "",
      stage === 0
        ? `The ${whatEn} for ${sub.company.name} has ended. Your data is kept; renew to continue at once.`
        : `The ${whatEn} for ${sub.company.name} ends in ${daysLeft} day(s) (${date}).`,
      `Choose a plan and pay at: ${origin}/billing`,
    ].join("\n");
    const subject = stage === 0 ? `انتهى الاشتراك — ${sub.company.name}` : `تذكير: الاشتراك ينتهي ${date} — ${sub.company.name}`;
    try {
      for (const to of await companyAdminEmails(sub.companyId)) await sendEmailMessage({ to, subject, text });
      await prisma.subscription.update({ where: { id: sub.id }, data: { lastReminder: key } });
      sent += 1;
    } catch (error) {
      console.error("subscription reminder", error);
    }
  }
  return sent;
}

/** Card payments left pending (payer closed the page before returning) are checked again by the daily job. */
export async function settleStalePayments() {
  if (!cardPaymentsReady()) return 0;
  const stale = await prisma.payment.findMany({
    where: { provider: "THAWANI", status: "PENDING", providerRef: { not: null }, createdAt: { lt: new Date(Date.now() - 10 * 60_000), gt: new Date(Date.now() - 7 * 86_400_000) } },
    select: { id: true },
    take: 50,
  });
  let settled = 0;
  for (const payment of stale) {
    try {
      if ((await settleCardPayment(payment.id)) !== "PENDING") settled += 1;
    } catch (error) {
      console.error("settle payment", error);
    }
  }
  await prisma.payment.updateMany({ where: { provider: "THAWANI", status: "PENDING", createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, data: { status: "CANCELED" } });
  return settled;
}
