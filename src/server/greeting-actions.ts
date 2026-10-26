"use server";

import {
  audienceFromForm,
  designGreetingVersion,
  describeAudience,
  readAudience,
  resolveGreetingRecipients,
  sendGreetingEmails,
} from "@/lib/greetings";
import { channelReady } from "@/lib/delivery";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { requirePlatformAdmin, writePlatformLog } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { clip, parseDateTimeInput, req, str } from "@/lib/utils";

function back(id?: string) {
  return id ? `/admin/greetings/${id}` : "/admin/greetings";
}

/** Create a greeting draft and immediately design the first AI card. */
export async function createGreeting(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const title = clip(req(formData, "title"), 120);
  const meaning = clip(req(formData, "meaning"), 1000);
  const brief = clip(req(formData, "brief"), 2000);
  const when = parseDateTimeInput(req(formData, "scheduledFor"));
  if (!title || !meaning || !brief || !when) go(back(), { error: t("أكمل اسم المناسبة ومعناها والوصف والتاريخ", "Fill the occasion, meaning, brief and date") });
  const audience = audienceFromForm(formData);
  const greeting = await prisma.platformGreeting.create({
    data: {
      title: title!,
      meaning: meaning!,
      brief: brief!,
      scheduledFor: when!,
      audience,
      status: "DRAFT",
      createdById: admin.id,
      createdByName: admin.name,
    },
  });
  try {
    await designGreetingVersion({
      greetingId: greeting.id,
      title: greeting.title,
      meaning: greeting.meaning,
      brief: greeting.brief,
    });
  } catch {
    await prisma.platformGreeting.update({ where: { id: greeting.id }, data: { status: "DRAFT", lastError: "design_failed" } });
    await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_CREATE", message: `أنشأ مناسبة «${greeting.title}» وتعذّر التصميم` });
    go(back(greeting.id), { error: t("حُفظت المناسبة وتعذّر تصميم البطاقة. أعد التوليد.", "Occasion saved but the card failed. Regenerate.") });
  }
  await writePlatformLog({
    userId: admin.id,
    userName: admin.name,
    action: "GREETING_CREATE",
    message: `أنشأ مناسبة «${greeting.title}» — ${describeAudience(audience, t)}`,
  });
  refreshAll();
  go(back(greeting.id), { message: t("صُمّمت البطاقة. عاينها أو اطلب تعديلاً أو جدول الإرسال.", "Card designed. Preview, revise, or schedule sending.") });
}

/** Regenerate a new card version (keeps previous images). */
export async function redesignGreeting(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const reviseNote = clip(str(formData, "reviseNote"), 500);
  const greeting = await prisma.platformGreeting.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!greeting) go(back(), { error: t("المناسبة غير موجودة", "Occasion not found") });
  if (greeting!.status === "SENT") go(back(id), { error: t("لا يُعاد تصميم مناسبة أُرسلت", "A sent greeting cannot be redesigned") });
  try {
    await designGreetingVersion({
      greetingId: greeting!.id,
      title: greeting!.title,
      meaning: greeting!.meaning,
      brief: greeting!.brief,
      reviseNote: reviseNote || null,
      previousPrompt: greeting!.currentVersion?.imagePrompt || greeting!.imagePrompt,
    });
  } catch {
    go(back(id), { error: t("تعذّر إعادة التصميم. حاول مرة أخرى.", "Redesign failed. Try again.") });
  }
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_REDESIGN", message: `أعاد تصميم «${greeting!.title}»${reviseNote ? `: ${reviseNote}` : ""}` });
  refreshAll();
  go(back(id), { message: t("صدر تصميم جديد. الصورة السابقة محفوظة في السجل.", "New design ready. The previous image is kept in history.") });
}

export async function scheduleGreeting(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const greeting = await prisma.platformGreeting.findUnique({ where: { id } });
  if (!greeting?.currentVersionId) go(back(id), { error: t("صمم البطاقة أولاً", "Design the card first") });
  if (!channelReady("EMAIL")) go(back(id), { error: t("فعّل البريد (RESEND) قبل الجدولة", "Enable email (RESEND) before scheduling") });
  await prisma.platformGreeting.update({ where: { id }, data: { status: "SCHEDULED", lastError: null } });
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_SCHEDULE", message: `جدول إرسال «${greeting!.title}»` });
  refreshAll();
  go(back(id), { message: t("جُدولت. ستُرسل تلقائياً في التاريخ المحدد.", "Scheduled. It will send automatically on the set date.") });
}

export async function cancelGreeting(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const greeting = await prisma.platformGreeting.findUnique({ where: { id } });
  if (!greeting) go(back(), { error: t("المناسبة غير موجودة", "Occasion not found") });
  if (greeting!.status === "SENT") go(back(id), { error: t("لا يمكن إلغاء ما أُرسل", "Cannot cancel a sent greeting") });
  await prisma.platformGreeting.update({ where: { id }, data: { status: "CANCELLED" } });
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_CANCEL", message: `ألغى «${greeting!.title}»` });
  refreshAll();
  go(back(id), { message: t("أُلغيت المناسبة", "Greeting cancelled") });
}

export async function sendGreetingNow(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const testOnly = formData.get("test") === "1";
  const greeting = await prisma.platformGreeting.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!greeting?.currentVersion) go(back(id), { error: t("صمم البطاقة أولاً", "Design the card first") });
  if (!channelReady("EMAIL")) go(back(id), { error: t("فعّل البريد (RESEND) قبل الإرسال", "Enable email (RESEND) before sending") });
  const origin = await requestOrigin();
  try {
    if (testOnly) {
      const result = await sendGreetingEmails({
        origin,
        greeting,
        version: greeting!.currentVersion!,
        recipients: [],
        testTo: admin.email,
      });
      await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_TEST", message: `تجربة إرسال «${greeting!.title}» إلى ${admin.email}` });
      refreshAll();
      go(back(id), { message: t(`أُرسلت نسخة تجريبية إلى بريدك (${result.sent})`, `Test copy sent to your email (${result.sent})`) });
    }
    const recipients = await resolveGreetingRecipients(readAudience(greeting!.audience));
    const result = await sendGreetingEmails({ origin, greeting: greeting!, version: greeting!.currentVersion!, recipients });
    await prisma.platformGreeting.update({
      where: { id },
      data: { status: result.sent ? "SENT" : "FAILED", sentAt: new Date(), sentCount: result.sent, lastError: result.sent ? null : "send_failed" },
    });
    await writePlatformLog({
      userId: admin.id,
      userName: admin.name,
      action: "GREETING_SEND",
      message: `أرسل «${greeting!.title}» — نجح ${result.sent} / فشل ${result.failed}`,
    });
    refreshAll();
    go(back(id), {
      message: t(`أُرسل إلى ${result.sent} مستلم${result.failed ? ` (فشل ${result.failed})` : ""}`, `Sent to ${result.sent} recipient(s)${result.failed ? ` (${result.failed} failed)` : ""}`),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "email_not_ready") {
      go(back(id), { error: t("البريد غير مفعّل", "Email is not configured") });
    }
    throw error;
  }
}

export async function updateGreetingMeta(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const id = req(formData, "id");
  const greeting = await prisma.platformGreeting.findUnique({ where: { id } });
  if (!greeting) go(back(), { error: t("المناسبة غير موجودة", "Occasion not found") });
  if (greeting!.status === "SENT") go(back(id), { error: t("لا تُعدَّل مناسبة أُرسلت", "A sent greeting cannot be edited") });
  const title = clip(req(formData, "title"), 120);
  const meaning = clip(req(formData, "meaning"), 1000);
  const brief = clip(req(formData, "brief"), 2000);
  const when = parseDateTimeInput(req(formData, "scheduledFor"));
  if (!title || !meaning || !brief || !when) go(back(id), { error: t("أكمل الحقول", "Complete the fields") });
  const audience = audienceFromForm(formData);
  await prisma.platformGreeting.update({
    where: { id },
    data: { title: title!, meaning: meaning!, brief: brief!, scheduledFor: when!, audience },
  });
  await writePlatformLog({ userId: admin.id, userName: admin.name, action: "GREETING_UPDATE", message: `حدّث «${title}»` });
  refreshAll();
  go(back(id), { message: t("حُفظت التغييرات. أعد التصميم إن أردت بطاقة جديدة.", "Saved. Redesign if you want a new card.") });
}
