"use server";

import crypto from "node:crypto";
import { aiDraftLetter } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, requireAdmin, requirePermission } from "@/lib/auth";
import { CHANNELS, sendPendingCopies, type Channel } from "@/lib/delivery";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { isLetterKind, LETTER_KIND } from "@/lib/letters";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { clip, isUniqueError, parseDateInput, req, safeReturn, str } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** HR-2026-0001: per company and year. */
async function nextRefNo(companyId: string, issuedAt: Date) {
  const prefix = `HR-${issuedAt.getUTCFullYear()}-`;
  const last = await prisma.letter.findFirst({
    where: { companyId, refNo: { startsWith: prefix } },
    orderBy: { refNo: "desc" },
    select: { refNo: true },
  });
  const next = last ? Number(last.refNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(4, "0")}`;
}

function copyTarget(channel: Channel, employee: { email: string | null; phone: string | null }) {
  if (channel === "EMAIL") return employee.email && EMAIL_PATTERN.test(employee.email.trim()) ? employee.email.trim() : null;
  return normalizePhone(employee.phone);
}

function wantedChannels(formData: FormData) {
  return CHANNELS.filter((channel) => formData.get(`send${channel}`) === "1");
}

export async function createLetters(formData: FormData) {
  const user = await requirePermission("letters.create", "/letters");
  const { t } = await getI18n();
  const back = "/letters/new";
  const kind = req(formData, "kind");
  if (!isLetterKind(kind)) go(back, { error: t("اختر نوع الخطاب", "Choose the letter type") });
  const ids = [...new Set(formData.getAll("employeeIds").map(String).filter(Boolean))].slice(0, 200);
  if (!ids.length) go(back, { error: t("اختر موظفاً واحداً على الأقل", "Choose at least one employee") });
  const employees = await prisma.employee.findMany({ where: { companyId: user.companyId, id: { in: ids } } });
  if (!employees.length) go(back, { error: t("الموظف غير موجود", "Employee not found") });
  const subject = clip(req(formData, "subject"), 200) || "";
  const body = clip(req(formData, "body"), 8000) || "";
  if (subject.length < 2 || body.length < 5) go(back, { error: t("اكتب موضوع الخطاب ونصه", "Enter the letter subject and text") });
  const issuedAt = parseDateInput(str(formData, "issuedAt")) || new Date();
  const channels = wantedChannels(formData);
  const created: string[] = [];

  for (const employee of employees) {
    const deliveries = channels
      .map((channel) => ({ channel, target: copyTarget(channel, employee) }))
      .filter((item): item is { channel: Channel; target: string } => Boolean(item.target));
    for (let attempt = 0; ; attempt += 1) {
      try {
        const letter = await prisma.letter.create({
          data: {
            companyId: user.companyId,
            employeeId: employee.id,
            kind,
            refNo: await nextRefNo(user.companyId, issuedAt),
            issuedAt,
            subject,
            subjectEn: clip(str(formData, "subjectEn"), 200),
            body,
            bodyEn: clip(str(formData, "bodyEn"), 8000),
            signatoryName: clip(str(formData, "signatoryName"), 120),
            signatoryTitle: clip(str(formData, "signatoryTitle"), 120),
            createdById: user.id,
            createdByName: user.name,
            token: crypto.randomBytes(24).toString("base64url"),
            deliveries: { create: deliveries },
          },
        });
        created.push(letter.id);
        await writeAudit({
          userId: user.id,
          employeeId: employee.id,
          action: "LETTER_ISSUE",
          message: t(
            `أصدر «${LETTER_KIND[kind as keyof typeof LETTER_KIND].label.ar}» رقم ${letter.refNo} لـ ${employee.fullName}`,
            `Issued “${LETTER_KIND[kind as keyof typeof LETTER_KIND].label.en}” ${letter.refNo} to ${employee.fullName}`,
          ),
        });
        break;
      } catch (error) {
        if (!isUniqueError(error) || attempt >= 4) throw error;
      }
    }
  }

  if (channels.length) await sendPendingCopies(user.companyId, await requestOrigin(), created);
  refreshAll();
  if (created.length === 1) go(`/letters/${created[0]}`, { message: t("تم إصدار الخطاب", "Letter issued") });
  go("/letters", { message: t(`تم إصدار ${created.length} خطاب`, `Issued ${created.length} letters`) });
}

async function findLetter(companyId: string, id: string) {
  return prisma.letter.findFirst({ where: { id, companyId }, include: { employee: true } });
}

export async function cancelLetter(formData: FormData) {
  const user = await requirePermission("letters.edit", "/letters");
  const { t } = await getI18n();
  const letter = await findLetter(user.companyId, req(formData, "id"));
  if (!letter) go("/letters", { error: t("الخطاب غير موجود", "Letter not found") });
  const cancel = !letter!.cancelledAt;
  await prisma.letter.update({ where: { id: letter!.id }, data: { cancelledAt: cancel ? new Date() : null } });
  await writeAudit({
    userId: user.id,
    employeeId: letter!.employeeId,
    action: cancel ? "LETTER_CANCEL" : "LETTER_RESTORE",
    message: cancel ? t(`ألغى الخطاب ${letter!.refNo}`, `Cancelled letter ${letter!.refNo}`) : t(`أعاد تفعيل الخطاب ${letter!.refNo}`, `Restored letter ${letter!.refNo}`),
  });
  refreshAll();
  go(`/letters/${letter!.id}`, { message: cancel ? t("تم إلغاء الخطاب", "Letter cancelled") : t("أُعيد تفعيل الخطاب", "Letter restored") });
}

export async function deleteLetter(formData: FormData) {
  const user = await requirePermission("letters.delete", "/letters");
  const { t } = await getI18n();
  const letter = await findLetter(user.companyId, req(formData, "id"));
  if (!letter) go("/letters", { error: t("الخطاب غير موجود", "Letter not found") });
  await prisma.letter.delete({ where: { id: letter!.id } });
  await writeAudit({ userId: user.id, employeeId: letter!.employeeId, action: "LETTER_DELETE", message: t(`حذف الخطاب ${letter!.refNo}`, `Deleted letter ${letter!.refNo}`) });
  refreshAll();
  go(safeReturn(formData.get("returnTo"), "/letters"), { message: t("تم حذف الخطاب", "Letter deleted") });
}

/** Queues another copy (e.g. after the employee's email was added) and sends it if the channel is active. */
export async function queueLetterCopy(formData: FormData) {
  const user = await requirePermission("letters.edit", "/letters");
  const { t } = await getI18n();
  const letter = await findLetter(user.companyId, req(formData, "id"));
  if (!letter) go("/letters", { error: t("الخطاب غير موجود", "Letter not found") });
  const back = `/letters/${letter!.id}`;
  const channel = req(formData, "channel") as Channel;
  if (!CHANNELS.includes(channel)) go(back, { error: t("قناة غير معروفة", "Unknown channel") });
  if (letter!.cancelledAt) go(back, { error: t("الخطاب ملغى", "The letter is cancelled") });
  const target = copyTarget(channel, letter!.employee);
  if (!target) {
    go(back, {
      error: channel === "EMAIL" ? t("لا يوجد بريد صحيح في ملف الموظف", "The employee has no valid email") : t("لا يوجد رقم هاتف في ملف الموظف", "The employee has no phone number"),
    });
  }
  await prisma.letterDelivery.create({ data: { letterId: letter!.id, channel, target: target! } });
  await sendPendingCopies(user.companyId, await requestOrigin(), [letter!.id]);
  refreshAll();
  go(back, { message: t("أُضيفت النسخة إلى قائمة الإرسال", "Copy queued for sending") });
}

/** Settings: sends every copy that was waiting for a channel to be activated. */
export async function sendPendingLetterCopies() {
  const user = await requireAdmin("/settings");
  const { t } = await getI18n();
  const result = await sendPendingCopies(user.companyId, await requestOrigin());
  refreshAll();
  go("/settings#channels", {
    message: t(`أُرسلت ${result.sent} نسخة${result.failed ? `، وتعذر ${result.failed}` : ""}`, `Sent ${result.sent} copies${result.failed ? `, ${result.failed} failed` : ""}`),
  });
}

/** AI draft for the new-letter form. */
export async function draftLetter(input: { kind: string; reason: string; employeeId?: string }): Promise<{ subject?: string; subjectEn?: string; body?: string; bodyEn?: string; error?: string }> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user || !can(user, "letters.create")) return { error: t("ليست لديك صلاحية إصدار الخطابات", "You cannot issue letters") };
  const kind = isLetterKind(input.kind) ? input.kind : "GENERAL";
  const reason = String(input.reason || "").trim().slice(0, 1500);
  if (reason.length < 3) return { error: t("اكتب سبب الخطاب أو تفاصيله أولاً", "Describe the reason or details first") };
  const employee = input.employeeId
    ? await prisma.employee.findFirst({ where: { id: input.employeeId, companyId: user.companyId }, select: { jobTitle: true } })
    : null;
  try {
    const draft = await aiDraftLetter({
      kind,
      kindAr: LETTER_KIND[kind].label.ar,
      kindEn: LETTER_KIND[kind].label.en,
      reason,
      companyName: user.company.name,
      jobTitle: employee?.jobTitle,
    });
    return draft || { error: t("لم تُرجِع الصياغة نتيجة، حاول مرة أخرى", "The draft came back empty, try again") };
  } catch (error) {
    console.error("AI letter draft failed", error);
    return { error: t("تعذرت الصياغة الآلية الآن. استخدم القالب أو اكتب النص يدوياً.", "AI drafting is unavailable right now. Use the template or type the text.") };
  }
}

/** Public: the employee confirms receipt from the link in the copy. */
export async function acknowledgeLetter(formData: FormData) {
  const token = req(formData, "token");
  const letter = token ? await prisma.letter.findUnique({ where: { token } }) : null;
  if (!letter) go("/login");
  if (!letter!.acknowledgedAt && !letter!.cancelledAt) {
    await prisma.letter.update({ where: { id: letter!.id }, data: { acknowledgedAt: new Date() } });
    await writeAudit({
      companyId: letter!.companyId,
      employeeId: letter!.employeeId,
      action: "LETTER_ACK",
      message: `أكد الموظف استلام الخطاب ${letter!.refNo} / Employee confirmed receipt of ${letter!.refNo}`,
    });
    refreshAll();
  }
  go(`/letter/${token}`);
}
