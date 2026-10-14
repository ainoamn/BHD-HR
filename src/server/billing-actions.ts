"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { cardPaymentsReady, createCheckout, settleCardPayment } from "@/lib/billing";
import { channelReady, sendEmailMessage } from "@/lib/delivery";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { receiptNumber, writePlatformLog } from "@/lib/platform";
import { formatRial, isCycle, priceFor } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { countedEmployees, countedUsers } from "@/lib/subscription";
import { clip, req, str } from "@/lib/utils";

const BACK = "/billing";
const MAX_PENDING = 3;

/** Paying is for the company's administrators; a suspended company cannot pay its way back in. */
async function requireBillingAdmin() {
  const user = await requireUser();
  const { t } = await getI18n();
  if (user.role !== "ADMIN") go(BACK, { error: t("الاشتراك والدفع لمسؤول المنشأة فقط", "Only the company administrator manages the subscription") });
  if (user.company.status === "SUSPENDED") go(BACK, { error: t("الحساب موقوف من إدارة المنصة. تواصل مع الدعم.", "The account is suspended by the platform. Contact support.") });
  return user;
}

/** The plan and cycle chosen on the page, checked against what the company already uses. */
async function chosenPlan(formData: FormData, companyId: string) {
  const { lang, t } = await getI18n();
  const cycle = req(formData, "cycle");
  if (!isCycle(cycle)) go(BACK, { error: t("اختر مدة الاشتراك", "Choose the billing period") });
  const plan = await prisma.plan.findUnique({ where: { code: req(formData, "plan") } });
  if (!plan || !plan.isActive || !plan.isPublic) go(BACK, { error: t("الباقة غير متاحة", "This plan is not available") });
  if (plan!.contactOnly) go(BACK, { error: t("هذه الباقة بالتواصل مع فريق المبيعات", "This plan is arranged with our sales team") });
  const amount = priceFor(plan!, cycle);
  if (!(amount > 0)) go(BACK, { error: t("لا يوجد سعر لهذه الباقة", "This plan has no price") });
  const [employees, users] = await Promise.all([countedEmployees(companyId), countedUsers(companyId)]);
  if (plan!.maxEmployees !== null && employees > plan!.maxEmployees) {
    go(BACK, {
      error: t(
        `لديك ${employees} موظفاً وباقة «${plan!.name}» تسمح بـ ${plan!.maxEmployees}. اختر باقة أكبر أو أنهِ خدمة من لم يعد يعمل.`,
        `You have ${employees} employees and ${plan!.nameEn || plan!.name} allows ${plan!.maxEmployees}. Choose a bigger plan.`,
      ),
    });
  }
  if (plan!.maxUsers !== null && users > plan!.maxUsers) {
    go(BACK, {
      error: t(
        `لديك ${users} مستخدماً وباقة «${plan!.name}» تسمح بـ ${plan!.maxUsers}. أزل مستخدمين من الإعدادات أو اختر باقة أكبر.`,
        `You have ${users} users and ${plan!.nameEn || plan!.name} allows ${plan!.maxUsers}. Remove users or choose a bigger plan.`,
      ),
    });
  }
  return { plan: plan!, cycle, amount, planName: lang === "en" && plan!.nameEn ? plan!.nameEn : plan!.name };
}

async function tooManyPending(companyId: string) {
  return (await prisma.payment.count({ where: { companyId, status: "PENDING" } })) >= MAX_PENDING;
}

/** Card payment: records the attempt, opens a Thawani checkout and sends the payer there. */
export async function startCheckout(formData: FormData) {
  const user = await requireBillingAdmin();
  const { t } = await getI18n();
  if (!cardPaymentsReady()) go(BACK, { error: t("الدفع بالبطاقة غير مفعّل بعد. استخدم التحويل البنكي.", "Card payment is not enabled yet. Use bank transfer.") });
  const { plan, cycle, amount } = await chosenPlan(formData, user.companyId);
  await prisma.payment.updateMany({ where: { companyId: user.companyId, provider: "THAWANI", status: "PENDING", createdAt: { lt: new Date(Date.now() - 60 * 60_000) } }, data: { status: "CANCELED" } });
  if (await tooManyPending(user.companyId)) go(BACK, { error: t("لديك مدفوعات معلّقة. تحقق منها أو ألغِها أولاً.", "You have pending payments. Check or cancel them first.") });
  const payment = await prisma.payment.create({
    data: { companyId: user.companyId, planId: plan.id, planName: plan.name, cycle, amount, provider: "THAWANI", createdById: user.id, createdByName: user.name, ip: await clientIp() },
  });
  let url: string;
  try {
    url = await createCheckout(payment, await requestOrigin());
  } catch (error) {
    console.error("checkout", error);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", note: error instanceof Error ? error.message.slice(0, 300) : "checkout failed" } });
    go(BACK, { error: t("تعذّر فتح صفحة الدفع. حاول بعد قليل.", "Could not open the payment page. Try again shortly.") });
  }
  redirect(url!);
}

/** Bank transfer: the company says it paid; the platform admin confirms the money arrived and the plan starts. */
export async function requestManualPayment(formData: FormData) {
  const user = await requireBillingAdmin();
  const { t } = await getI18n();
  const { plan, cycle, amount } = await chosenPlan(formData, user.companyId);
  if (await tooManyPending(user.companyId)) go(BACK, { error: t("لديك طلبات دفع معلّقة بانتظار التأكيد.", "You have payment requests awaiting confirmation.") });
  const reference = clip(str(formData, "reference"), 120);
  const payment = await prisma.payment.create({
    data: { companyId: user.companyId, planId: plan.id, planName: plan.name, cycle, amount, provider: "MANUAL", reference, createdById: user.id, createdByName: user.name, ip: await clientIp() },
  });
  await writeAudit({ userId: user.id, action: "BILLING_REQUEST", message: `طلب تأكيد تحويل ${formatRial(amount)} لباقة ${plan.name} (${receiptNumber(payment.number)})` });
  await writePlatformLog({ userId: user.id, userName: user.name, companyId: user.companyId, action: "PAYMENT_REQUEST", message: `${user.company.name}: ${plan.name} ${cycle} ${formatRial(amount)}${reference ? ` — ${reference}` : ""}` });
  if (channelReady("EMAIL")) {
    const admins = await prisma.user.findMany({ where: { isPlatformAdmin: true, disabledAt: null }, select: { email: true } });
    const origin = await requestOrigin();
    for (const admin of admins) {
      await sendEmailMessage({
        to: admin.email,
        subject: `BHD HR — طلب تأكيد دفع ${receiptNumber(payment.number)}`,
        text: `${user.company.name}\n${plan.name} — ${cycle === "YEARLY" ? "سنوي" : "شهري"} — ${formatRial(amount)}\n${reference ? `المرجع: ${reference}\n` : ""}\n${origin}/admin/payments`,
      }).catch((error) => console.error("payment request email", error));
    }
  }
  go(BACK, { message: t("سُجّل طلبك. يبدأ الاشتراك فور تأكيد وصول التحويل.", "Request recorded. The plan starts as soon as the transfer is confirmed.") });
}

async function ownPayment(formData: FormData, companyId: string) {
  const { t } = await getI18n();
  const payment = await prisma.payment.findFirst({ where: { id: req(formData, "paymentId"), companyId } });
  if (!payment) go(BACK, { error: t("الدفعة غير موجودة", "Payment not found") });
  return payment!;
}

/** For a card payment whose return page was closed: asks Thawani again. */
export async function checkPayment(formData: FormData) {
  const user = await requireBillingAdmin();
  const { t } = await getI18n();
  const payment = await ownPayment(formData, user.companyId);
  if (payment.provider !== "THAWANI" || payment.status !== "PENDING") go(BACK);
  let status: string | null = null;
  try {
    status = await settleCardPayment(payment.id);
  } catch (error) {
    console.error("check payment", error);
  }
  if (status === "PAID") go(BACK, { message: t("تم الدفع وتفعّل الاشتراك. شكراً لك.", "Paid — your subscription is active. Thank you.") });
  if (status === "CANCELED") go(BACK, { error: t("أُلغيت عملية الدفع ولم يُخصم شيء.", "The payment was cancelled; nothing was charged.") });
  go(BACK, { error: t("لم يكتمل الدفع بعد.", "The payment is not complete yet.") });
}

export async function cancelPayment(formData: FormData) {
  const user = await requireBillingAdmin();
  const { t } = await getI18n();
  const payment = await ownPayment(formData, user.companyId);
  if (payment.status !== "PENDING") go(BACK);
  let status: string | null = null;
  if (payment.provider === "THAWANI") {
    try {
      status = await settleCardPayment(payment.id);
    } catch (error) {
      console.error("cancel check", error);
    }
  }
  if (status === "PAID") go(BACK, { message: t("هذه الدفعة مكتملة وتفعّل بها الاشتراك.", "This payment went through and your plan is active.") });
  await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "CANCELED" } });
  go(BACK, { message: t("أُلغي الطلب", "Request cancelled") });
}
