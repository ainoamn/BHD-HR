"use server";

import { revalidatePath } from "next/cache";
import { applyPayment } from "@/lib/billing";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { platformConfig, receiptNumber, requirePlatformAdmin, writePlatformLog } from "@/lib/platform";
import { formatRial, isCycle, priceFor, readFeatures } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { clip, parseDateInput, req, str } from "@/lib/utils";

const DAY = 86_400_000;

function optionalInt(formData: FormData, key: string, max = 1_000_000) {
  const raw = req(formData, key);
  if (!raw) return null;
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : null;
}

function amountOf(formData: FormData, key: string) {
  const value = Math.round(Number(req(formData, key) || 0) * 1000) / 1000;
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 1_000_000) : 0;
}

function refresh() {
  revalidatePath("/", "layout");
}

async function companyOr404(companyId: string, back: string) {
  const { t } = await getI18n();
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { subscription: { include: { plan: true } } } });
  if (!company) go(back, { error: t("الشركة غير موجودة", "Company not found") });
  return company!;
}

/** Creates or edits a plan. Changing a plan changes it for every company on it at once. */
export async function savePlan(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const back = "/admin/plans";
  const id = req(formData, "id");
  const code = req(formData, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20);
  const name = clip(req(formData, "name"), 60);
  if (!name || !code) go(back, { error: t("اسم الباقة ورمزها مطلوبان", "Plan name and code are required") });
  const data = {
    name: name!,
    nameEn: clip(str(formData, "nameEn"), 60),
    tagline: clip(str(formData, "tagline"), 120),
    taglineEn: clip(str(formData, "taglineEn"), 120),
    priceMonthly: amountOf(formData, "priceMonthly"),
    priceYearly: amountOf(formData, "priceYearly"),
    maxEmployees: optionalInt(formData, "maxEmployees"),
    maxUsers: optionalInt(formData, "maxUsers"),
    features: readFeatures(formData.getAll("features")),
    isPublic: formData.get("isPublic") === "on",
    contactOnly: formData.get("contactOnly") === "on",
    isActive: formData.get("isActive") === "on",
    highlight: formData.get("highlight") === "on",
    sortOrder: optionalInt(formData, "sortOrder", 1000) ?? 0,
  };
  if (id) {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) go(back, { error: t("الباقة غير موجودة", "Plan not found") });
    await prisma.plan.update({ where: { id }, data });
    await writePlatformLog({ userId: admin.id, userName: admin.name, action: "PLAN_UPDATE", message: `${plan!.code}: ${data.name} — ${formatRial(data.priceMonthly)}/${formatRial(data.priceYearly)}, ${data.maxEmployees ?? "∞"} emp, ${data.maxUsers ?? "∞"} users` });
  } else {
    if (await prisma.plan.findUnique({ where: { code } })) go(back, { error: t("رمز الباقة مستخدم", "This plan code is taken") });
    await prisma.plan.create({ data: { ...data, code } });
    await writePlatformLog({ userId: admin.id, userName: admin.name, action: "PLAN_CREATE", message: `${code}: ${data.name}` });
  }
  refresh();
  go(back, { message: t("تم حفظ الباقة", "Plan saved") });
}

/** Puts a company on a plan by hand: trial or paid, with an end date (or none), limit overrides and extra features. */
export async function setCompanyPlan(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const companyId = req(formData, "companyId");
  const back = `/admin/companies/${companyId}`;
  const company = await companyOr404(companyId, "/admin/companies");
  const plan = await prisma.plan.findUnique({ where: { id: req(formData, "planId") } });
  if (!plan) go(back, { error: t("اختر الباقة", "Choose the plan") });
  const status = req(formData, "status") === "TRIAL" ? "TRIAL" : "ACTIVE";
  const cycle = isCycle(req(formData, "cycle")) ? req(formData, "cycle") : "MONTHLY";
  const end = formData.get("noEnd") === "on" ? null : parseDateInput(str(formData, "endsAt"));
  if (formData.get("noEnd") !== "on" && !end) go(back, { error: t("حدد تاريخ الانتهاء أو اختر «بلا تاريخ انتهاء»", "Set the end date or tick “no end date”") });
  const endOfDay = end ? new Date(end.getTime() + DAY - 1000) : null;
  const data = {
    planId: plan!.id,
    status,
    cycle,
    trialEndsAt: status === "TRIAL" ? endOfDay : (company.subscription?.trialEndsAt ?? null),
    currentPeriodStart: status === "ACTIVE" ? (company.subscription?.currentPeriodStart ?? new Date()) : null,
    currentPeriodEnd: status === "ACTIVE" ? endOfDay : null,
    maxEmployees: optionalInt(formData, "maxEmployees"),
    maxUsers: optionalInt(formData, "maxUsers"),
    extraFeatures: readFeatures(formData.getAll("extraFeatures")),
    notes: clip(str(formData, "notes"), 1000),
    lastReminder: null,
  };
  await prisma.subscription.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
  await writePlatformLog({
    userId: admin.id,
    userName: admin.name,
    companyId,
    action: "SUBSCRIPTION_SET",
    message: `${company.name}: ${plan!.code} ${status}${endOfDay ? ` → ${endOfDay.toISOString().slice(0, 10)}` : " (no end)"}${data.maxEmployees !== null ? `, emp ${data.maxEmployees}` : ""}${data.maxUsers !== null ? `, users ${data.maxUsers}` : ""}`,
  });
  refresh();
  go(back, { message: t("تم حفظ اشتراك الشركة", "Company subscription saved") });
}

/** Adds days to the trial or the paid period (from today if it already ended). */
export async function extendSubscription(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const companyId = req(formData, "companyId");
  const back = `/admin/companies/${companyId}`;
  const company = await companyOr404(companyId, "/admin/companies");
  const days = Math.min(3650, Math.max(1, Math.floor(Number(req(formData, "days")) || 0)));
  const sub = company.subscription;
  if (!sub) go(back, { error: t("ضع الشركة على باقة أولاً", "Put the company on a plan first") });
  const now = new Date();
  const field = sub!.status === "TRIAL" ? "trialEndsAt" : "currentPeriodEnd";
  const current = sub![field];
  if (field === "currentPeriodEnd" && !current) go(back, { error: t("الاشتراك بلا تاريخ انتهاء أصلاً", "The subscription has no end date") });
  const from = current && current > now ? current : now;
  const end = new Date(from.getTime() + days * DAY);
  await prisma.subscription.update({ where: { companyId }, data: { [field]: end, ...(sub!.status === "CANCELED" ? { status: "ACTIVE" } : {}), lastReminder: null } });
  await writePlatformLog({ userId: admin.id, userName: admin.name, companyId, action: "SUBSCRIPTION_EXTEND", message: `${company.name}: +${days} days → ${end.toISOString().slice(0, 10)}` });
  refresh();
  go(back, { message: t(`مُدّد الاشتراك ${days} يوماً`, `Extended by ${days} day(s)`) });
}

export async function setCompanyStatus(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const companyId = req(formData, "companyId");
  const back = `/admin/companies/${companyId}`;
  const company = await companyOr404(companyId, "/admin/companies");
  const suspend = req(formData, "status") === "SUSPENDED";
  const reason = suspend ? clip(str(formData, "reason"), 300) : null;
  await prisma.company.update({ where: { id: companyId }, data: { status: suspend ? "SUSPENDED" : "ACTIVE", suspendedReason: reason } });
  await writePlatformLog({ userId: admin.id, userName: admin.name, companyId, action: suspend ? "COMPANY_SUSPEND" : "COMPANY_ACTIVATE", message: `${company.name}${reason ? `: ${reason}` : ""}` });
  refresh();
  go(back, { message: suspend ? t("أُوقف حساب الشركة", "Company suspended") : t("أُعيد تفعيل حساب الشركة", "Company reactivated") });
}

/** Money received outside the card gateway (transfer, cash, cheque): recorded as paid and applied at once. */
export async function recordPayment(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const companyId = req(formData, "companyId");
  const back = `/admin/companies/${companyId}`;
  const company = await companyOr404(companyId, "/admin/companies");
  const plan = await prisma.plan.findUnique({ where: { id: req(formData, "planId") } });
  if (!plan) go(back, { error: t("اختر الباقة", "Choose the plan") });
  const cycle = isCycle(req(formData, "cycle")) ? req(formData, "cycle") : "MONTHLY";
  const amount = req(formData, "amount") ? amountOf(formData, "amount") : priceFor(plan!, cycle);
  const payment = await prisma.payment.create({
    data: {
      companyId,
      planId: plan!.id,
      planName: plan!.name,
      cycle,
      amount,
      provider: "MANUAL",
      reference: clip(str(formData, "reference"), 120),
      note: clip(str(formData, "note"), 500),
      createdById: admin.id,
      createdByName: admin.name,
    },
  });
  await applyPayment(payment.id);
  await writePlatformLog({ userId: admin.id, userName: admin.name, companyId, action: "PAYMENT_RECORD", message: `${company.name}: ${receiptNumber(payment.number)} ${plan!.code} ${cycle} ${formatRial(amount)}` });
  refresh();
  go(back, { message: t("سُجّلت الدفعة وتفعّل الاشتراك", "Payment recorded and plan applied") });
}

/** A bank transfer the company reported: confirm (plan starts) or reject. */
export async function decidePayment(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const back = safeBack(str(formData, "back"));
  const payment = await prisma.payment.findUnique({ where: { id: req(formData, "paymentId") }, include: { company: { select: { name: true } } } });
  if (!payment || payment.status !== "PENDING") go(back, { error: t("الدفعة غير موجودة أو حُسمت", "Payment not found or already decided") });
  const confirm = req(formData, "decision") === "confirm";
  if (confirm) {
    await applyPayment(payment!.id);
  } else {
    await prisma.payment.updateMany({ where: { id: payment!.id, status: "PENDING" }, data: { status: "FAILED", note: clip(str(formData, "note"), 500) || "Rejected by platform admin" } });
  }
  await writePlatformLog({
    userId: admin.id,
    userName: admin.name,
    companyId: payment!.companyId,
    action: confirm ? "PAYMENT_CONFIRM" : "PAYMENT_REJECT",
    message: `${payment!.company.name}: ${receiptNumber(payment!.number)} ${formatRial(payment!.amount)}`,
  });
  refresh();
  go(back, { message: confirm ? t("أُكّدت الدفعة وتفعّل الاشتراك", "Payment confirmed; plan applied") : t("رُفضت الدفعة", "Payment rejected") });
}

function safeBack(value: string | null) {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : "/admin/payments";
}

export async function setUserFlags(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const back = safeBack(str(formData, "back"));
  const user = await prisma.user.findUnique({ where: { id: req(formData, "userId") } });
  if (!user) go(back, { error: t("المستخدم غير موجود", "User not found") });
  if (user!.id === admin.id) go(back, { error: t("لا يمكنك تغيير حسابك أنت", "You cannot change your own account") });
  const change = req(formData, "change");
  if (change === "disable" || change === "enable") {
    await prisma.user.update({ where: { id: user!.id }, data: { disabledAt: change === "disable" ? new Date() : null } });
  } else if (change === "admin-on" || change === "admin-off") {
    await prisma.user.update({ where: { id: user!.id }, data: { isPlatformAdmin: change === "admin-on" } });
  } else go(back);
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: `USER_${change.toUpperCase().replace("-", "_")}`, message: user!.email });
  refresh();
  go(back, { message: t("تم الحفظ", "Saved") });
}

export async function saveConfig(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const back = "/admin/settings";
  const config = await platformConfig();
  const trialPlanCode = req(formData, "trialPlanCode");
  if (!(await prisma.plan.findUnique({ where: { code: trialPlanCode } }))) go(back, { error: t("باقة التجربة غير موجودة", "Trial plan not found") });
  const trialDays = Math.min(90, Math.max(1, Math.floor(Number(req(formData, "trialDays")) || 14)));
  await prisma.platformConfig.update({
    where: { id: config.id },
    data: {
      trialPlanCode,
      trialDays,
      bankDetails: clip(str(formData, "bankDetails"), 1000),
      supportEmail: clip(str(formData, "supportEmail"), 120),
      supportPhone: clip(str(formData, "supportPhone"), 40),
      announcement: clip(str(formData, "announcement"), 300),
    },
  });
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "CONFIG_UPDATE", message: `trial ${trialPlanCode} ${trialDays}d` });
  refresh();
  go(back, { message: t("تم حفظ إعدادات المنصة", "Platform settings saved") });
}

/** Companies from before plans have no subscription row: move them all to a plan without an end date in one go. */
export async function grantLegacyPlan(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const back = "/admin/companies";
  const plan = await prisma.plan.findUnique({ where: { id: req(formData, "planId") } });
  if (!plan) go(back, { error: t("اختر الباقة", "Choose the plan") });
  const legacy = await prisma.company.findMany({ where: { subscription: null }, select: { id: true } });
  if (legacy.length) {
    await prisma.subscription.createMany({
      data: legacy.map((company) => ({ companyId: company.id, planId: plan!.id, status: "ACTIVE", cycle: "YEARLY", currentPeriodStart: new Date(), currentPeriodEnd: null, notes: "حساب قائم قبل الباقات / Account from before plans" })),
      skipDuplicates: true,
    });
  }
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "LEGACY_GRANT", message: `${legacy.length} companies → ${plan!.code}` });
  refresh();
  go(back, { message: t(`نُقلت ${legacy.length} شركة إلى ${plan!.name}`, `${legacy.length} companies moved to ${plan!.nameEn || plan!.name}`) });
}