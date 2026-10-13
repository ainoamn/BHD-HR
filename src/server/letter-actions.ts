"use server";

import { aiDraftLetter } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, requireAdmin, requirePermission } from "@/lib/auth";
import { CHANNELS, sendPendingCopies, type Channel } from "@/lib/delivery";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { composeLetters, issueComposed, muscatToday, OPEN_DRAFT, readDraftContent, readLetterForm, type DraftContent } from "@/lib/letter-drafts";
import { copyTarget } from "@/lib/letter-issue";
import { isLetterKind, LETTER_KIND, type LetterKind } from "@/lib/letters";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { clip, formatDate, parseDateInput, req, safeReturn, str, toDateInput } from "@/lib/utils";

type SessionUser = Awaited<ReturnType<typeof requirePermission>>;

function composeFor(user: SessionUser, form: { kind: string; employeeIds: string[]; content: DraftContent }) {
  return composeLetters({ companyId: user.companyId, company: user.company, ...form, canSalary: can(user, "salaries.view") });
}

function issuedMessage(t: (ar: string, en: string) => string, ids: string[]) {
  refreshAll();
  if (ids.length === 1) go(`/letters/${ids[0]}`, { message: t("تم إصدار الخطاب موقّعاً إلكترونياً", "Letter issued and e-signed") });
  go("/letters", { message: t(`تم إصدار ${ids.length} خطاب`, `Issued ${ids.length} letters`) });
}

/** Scheduled day from the form: a date after today (Muscat), else null. */
function scheduleDay(formData: FormData) {
  const day = parseDateInput(str(formData, "scheduleDate"));
  return day && day > muscatToday() ? day : null;
}

/**
 * The new-letter form. `intent`: issue (default) signs and issues now; preview and draft keep it in the drafts
 * without a number (preview opens it); schedule keeps it to issue on `scheduleDate`. `draftId` = editing a draft.
 */
export async function createLetters(formData: FormData) {
  const user = await requirePermission("letters.create", "/letters");
  const { lang, t } = await getI18n();
  const requestId = str(formData, "requestId");
  const draftId = str(formData, "draftId");
  const intent = ["preview", "draft", "schedule"].includes(req(formData, "intent")) && !requestId ? req(formData, "intent") : "issue";
  const back = requestId ? `/letters/new?requestId=${encodeURIComponent(requestId)}` : draftId ? `/letters/new?draftId=${encodeURIComponent(draftId)}` : "/letters/new";
  const form = readLetterForm(formData);
  const draft = draftId ? await prisma.letterDraft.findFirst({ where: { id: draftId, companyId: user.companyId, status: { in: OPEN_DRAFT } } }) : null;
  if (draftId && !draft) go("/letters?view=drafts", { error: t("المسودة غير موجودة أو صدرت", "The draft is missing or already issued") });

  if (intent !== "issue") {
    if (!isLetterKind(form.kind)) go(back, { error: t("اختر نوع الخطاب", "Choose the letter type") });
    if (LETTER_KIND[form.kind as LetterKind].salary && !can(user, "salaries.view")) go(back, { error: t("هذا الخطاب يُظهر الراتب ويحتاج صلاحية عرض الرواتب", "This letter shows pay and needs the view-salaries permission") });
    if (!form.employeeIds.length) go(back, { error: t("اختر موظفاً واحداً على الأقل", "Choose at least one employee") });
    let scheduledFor = intent === "schedule" ? scheduleDay(formData) : null;
    let problem = "";
    if (intent === "schedule") {
      if (!scheduledFor) go(back, { error: t("اختر يوم الإصدار بعد اليوم", "Choose an issue day after today") });
      const composed = await composeFor(user, form);
      if ("error" in composed) {
        scheduledFor = null;
        problem = composed.error[lang];
      }
    }
    const data = {
      kind: form.kind,
      employeeIds: form.employeeIds,
      content: form.content,
      status: scheduledFor ? "SCHEDULED" : "DRAFT",
      scheduledFor,
      error: null,
      createdById: user.id,
      createdByName: user.name,
    };
    const saved = draft
      ? await prisma.letterDraft.update({ where: { id: draft.id }, data, select: { id: true } })
      : await prisma.letterDraft.create({ data: { ...data, companyId: user.companyId }, select: { id: true } });
    const label = LETTER_KIND[form.kind as LetterKind].label;
    await writeAudit({
      userId: user.id,
      action: scheduledFor ? "LETTER_SCHEDULE" : "LETTER_DRAFT",
      message: scheduledFor
        ? `جدول «${label.ar}» للإصدار في ${toDateInput(scheduledFor)} / Scheduled “${label.en}” to issue on ${toDateInput(scheduledFor)}`
        : `حفظ مسودة «${label.ar}» / Saved a “${label.en}” draft`,
    });
    refreshAll();
    if (problem) go(`/letters/drafts/${saved.id}#preview`, { error: t(`حُفظ في المسودات ولم يُجدول: ${problem}`, `Saved to drafts but not scheduled: ${problem}`) });
    if (intent === "draft") go("/letters?view=drafts#drafts", { message: t("حُفظ الخطاب في المسودات دون إصدار", "Saved to drafts without issuing") });
    go(`/letters/drafts/${saved.id}#preview`, {
      message: scheduledFor
        ? t(`سيصدر الخطاب موقّعاً صباح ${formatDate(scheduledFor)}`, `The letter will be issued and signed on the morning of ${formatDate(scheduledFor)}`)
        : t("معاينة الخطاب قبل الإصدار — محفوظ في المسودات", "Letter preview before issuing — kept in drafts"),
    });
  }

  const request = requestId
    ? await prisma.employeeRequest.findFirst({ where: { id: requestId, companyId: user.companyId, status: "PENDING", type: "LETTER" } })
    : null;
  if (requestId && (!request || form.employeeIds.length !== 1 || form.employeeIds[0] !== request.employeeId)) {
    go("/approvals#requests", { error: t("الطلب غير موجود أو سبق البتّ فيه", "The request is missing or already decided") });
  }
  const composed = await composeFor(user, form);
  if ("error" in composed) go(back, { error: composed.error[lang] });
  const created = await issueComposed(composed as Exclude<typeof composed, { error: unknown }>, {
    companyId: user.companyId,
    issuedAt: parseDateInput(form.content.issuedAt) || new Date(),
    content: form.content,
    user,
    requestId: request?.id,
  });

  if (request) {
    await prisma.employeeRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), decisionNote: clip(str(formData, "decisionNote"), 500) },
    });
  }
  if (draft) await prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedAt: new Date(), letterIds: created, error: null } });
  if (form.content.channels.length) await sendPendingCopies(user.companyId, await requestOrigin(), created);
  issuedMessage(t, created);
}

async function openDraft(formData: FormData) {
  const user = await requirePermission("letters.create", "/letters");
  const { lang, t } = await getI18n();
  const draft = await prisma.letterDraft.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId, status: { in: OPEN_DRAFT } } });
  if (!draft) go("/letters?view=drafts", { error: t("المسودة غير موجودة أو صدرت", "The draft is missing or already issued") });
  return { user, lang, t, draft: draft!, back: `/letters/drafts/${draft!.id}` };
}

/** Draft page: sign and issue now, dated today. */
export async function issueLetterDraft(formData: FormData) {
  const { user, lang, t, draft, back } = await openDraft(formData);
  const content = readDraftContent(draft.content);
  const composed = await composeFor(user, { kind: draft.kind, employeeIds: draft.employeeIds, content });
  if ("error" in composed) go(back, { error: composed.error[lang] });
  const claim = await prisma.letterDraft.updateMany({ where: { id: draft.id, status: draft.status, updatedAt: draft.updatedAt }, data: { status: "ISSUING" } });
  if (!claim.count) go(back, { error: t("تغيّرت المسودة للتو، حدّث الصفحة", "The draft just changed; refresh the page") });
  const created = await issueComposed(composed as Exclude<typeof composed, { error: unknown }>, { companyId: user.companyId, issuedAt: muscatToday(), content, user });
  await prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedAt: new Date(), letterIds: created, error: null, scheduledFor: null } });
  if (content.channels.length) await sendPendingCopies(user.companyId, await requestOrigin(), created);
  issuedMessage(t, created);
}

/** Draft page: issue on a later day, or back to a plain draft when no day is sent. */
export async function scheduleLetterDraft(formData: FormData) {
  const { user, lang, t, draft, back } = await openDraft(formData);
  if (formData.get("unschedule") === "1") {
    await prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "DRAFT", scheduledFor: null, error: null } });
    refreshAll();
    go(back, { message: t("أُلغيت الجدولة، والخطاب باقٍ في المسودات", "Schedule removed; the letter stays in drafts") });
  }
  const scheduledFor = scheduleDay(formData);
  if (!scheduledFor) go(back, { error: t("اختر يوم الإصدار بعد اليوم", "Choose an issue day after today") });
  const composed = await composeFor(user, { kind: draft.kind, employeeIds: draft.employeeIds, content: readDraftContent(draft.content) });
  if ("error" in composed) go(back, { error: composed.error[lang] });
  await prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "SCHEDULED", scheduledFor, error: null, createdById: user.id, createdByName: user.name } });
  const label = LETTER_KIND[draft.kind as LetterKind]?.label || LETTER_KIND.GENERAL.label;
  await writeAudit({
    userId: user.id,
    action: "LETTER_SCHEDULE",
    message: `جدول «${label.ar}» للإصدار في ${toDateInput(scheduledFor)} / Scheduled “${label.en}” to issue on ${toDateInput(scheduledFor)}`,
  });
  refreshAll();
  go(back, { message: t(`سيصدر الخطاب موقّعاً صباح ${formatDate(scheduledFor!)}`, `The letter will be issued and signed on the morning of ${formatDate(scheduledFor!)}`) });
}

export async function deleteLetterDraft(formData: FormData) {
  const { t, draft } = await openDraft(formData);
  await prisma.letterDraft.delete({ where: { id: draft.id } });
  refreshAll();
  go("/letters?view=drafts", { message: t("حُذفت المسودة", "Draft deleted") });
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

export type SavedLetterTemplate = { id: string; kind: string; title: string; subject: string; subjectEn: string; body: string; bodyEn: string; createdByName: string | null };

const MAX_COMPANY_TEMPLATES = 200;

/** /letters/new: keep the text in the form as one of the company's own templates for that kind. */
export async function saveLetterTemplate(input: { kind: string; title: string; subject: string; subjectEn: string; body: string; bodyEn: string }): Promise<{ template?: SavedLetterTemplate; error?: string }> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user || !can(user, "letters.create")) return { error: t("ليست لديك صلاحية إصدار الخطابات", "You cannot issue letters") };
  if (!isLetterKind(input.kind) || LETTER_KIND[input.kind].auto) return { error: t("النماذج للخطابات التي تُكتب يدوياً فقط", "Templates are for written letters only") };
  const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
  const title = text(input.title, 80);
  const subject = text(input.subject, 200);
  const body = text(input.body, 8000);
  if (title.length < 2) return { error: t("اكتب اسماً للنموذج", "Name the template") };
  if (subject.length < 2 || body.length < 5) return { error: t("اكتب موضوع الخطاب ونصه أولاً", "Write the letter subject and text first") };
  const count = await prisma.letterTemplate.count({ where: { companyId: user.companyId } });
  if (count >= MAX_COMPANY_TEMPLATES) return { error: t(`بلغت منشأتك ${MAX_COMPANY_TEMPLATES} نموذجاً؛ احذف ما لا تحتاجه أولاً`, `Your company has ${MAX_COMPANY_TEMPLATES} templates; delete some first`) };
  const saved = await prisma.letterTemplate.create({
    data: {
      companyId: user.companyId,
      kind: input.kind,
      title,
      subject,
      subjectEn: text(input.subjectEn, 200) || null,
      body,
      bodyEn: text(input.bodyEn, 8000) || null,
      createdById: user.id,
      createdByName: user.name,
    },
  });
  await writeAudit({ userId: user.id, action: "LETTER_TEMPLATE", message: t(`حفظ نموذج خطاب «${title}» (${LETTER_KIND[input.kind].label.ar})`, `Saved letter template “${title}” (${LETTER_KIND[input.kind].label.en})`) });
  return { template: { id: saved.id, kind: saved.kind, title: saved.title, subject: saved.subject, subjectEn: saved.subjectEn || "", body: saved.body, bodyEn: saved.bodyEn || "", createdByName: saved.createdByName } };
}

export async function deleteLetterTemplate(id: string): Promise<{ ok?: boolean; error?: string }> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user || !can(user, "letters.create")) return { error: t("ليست لديك صلاحية إصدار الخطابات", "You cannot issue letters") };
  const removed = await prisma.letterTemplate.deleteMany({ where: { id: String(id || ""), companyId: user.companyId } });
  if (!removed.count) return { error: t("النموذج غير موجود", "Template not found") };
  await writeAudit({ userId: user.id, action: "LETTER_TEMPLATE_DELETE", message: t("حذف نموذج خطاب من نماذج المنشأة", "Deleted a company letter template") });
  return { ok: true };
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
