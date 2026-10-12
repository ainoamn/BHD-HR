"use server";

import type { Prisma } from "@prisma/client";
import { aiDraftReview, isRateLimited } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { DEFAULT_CRITERIA, type Criterion, overallOf, parseCriteria, parseScores, reviewFacts } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { clip, formatDate, parseDateInput, req, str } from "@/lib/utils";

const LIST = "/performance";
const MAX_EXTRA_CRITERIA = 5;

export async function createCycle(formData: FormData) {
  const user = await requirePermission("performance.create", LIST);
  const { t } = await getI18n();
  const name = clip(str(formData, "name"), 120) || "";
  if (name.length < 3) go(LIST, { error: t("اكتب اسماً للتقييم، مثل «تقييم النصف الأول 2026»", "Name the review, e.g. “H1 2026 review”") });
  const periodStart = parseDateInput(req(formData, "periodStart"));
  const periodEnd = parseDateInput(req(formData, "periodEnd"));
  if (!periodStart || !periodEnd || periodEnd < periodStart) go(LIST, { error: t("حدد بداية الفترة ونهايتها", "Choose the period start and end") });
  const chosen = new Set(formData.getAll("criteria").map(String));
  const criteria: Criterion[] = DEFAULT_CRITERIA.filter((item) => chosen.has(item.key));
  const extra = (str(formData, "extraCriteria") || "")
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, 80))
    .filter((line) => line.length >= 2)
    .slice(0, MAX_EXTRA_CRITERIA);
  extra.forEach((line, index) => criteria.push({ key: `custom${index + 1}`, ar: line, en: line }));
  if (!criteria.length) go(LIST, { error: t("اختر معياراً واحداً على الأقل", "Choose at least one criterion") });
  const departmentId = req(formData, "departmentId");
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, ...(departmentId ? { departmentId } : {}) },
    select: { id: true },
  });
  if (!employees.length) go(LIST, { error: t("لا يوجد موظفون نشطون في هذا النطاق", "No active employees in this scope") });
  const cycle = await prisma.reviewCycle.create({
    data: {
      companyId: user.companyId,
      name,
      periodStart: periodStart!,
      periodEnd: periodEnd!,
      dueDate: parseDateInput(str(formData, "dueDate")),
      criteria: criteria as unknown as Prisma.InputJsonValue,
      createdByName: user.name,
      reviews: { create: employees.map((employee) => ({ companyId: user.companyId, employeeId: employee.id })) },
    },
  });
  await writeAudit({
    userId: user.id,
    action: "REVIEW_CYCLE_CREATE",
    message: t(`بدأ تقييم الأداء «${name}» لـ ${employees.length} موظف`, `Started the performance review "${name}" for ${employees.length} employee(s)`),
  });
  refreshAll();
  go(`${LIST}/${cycle.id}`, { message: t(`أُنشئ التقييم لـ ${employees.length} موظف`, `Review created for ${employees.length} employee(s)`) });
}

export async function addMissingEmployees(formData: FormData) {
  const user = await requirePermission("performance.create", LIST);
  const { t } = await getI18n();
  const cycle = await prisma.reviewCycle.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId }, include: { reviews: { select: { employeeId: true } } } });
  if (!cycle) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  const existing = cycle!.reviews.map((review) => review.employeeId);
  const missing = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, id: { notIn: existing } },
    select: { id: true },
  });
  if (missing.length) {
    await prisma.performanceReview.createMany({ data: missing.map((employee) => ({ companyId: user.companyId, cycleId: cycle!.id, employeeId: employee.id })), skipDuplicates: true });
  }
  refreshAll();
  go(`${LIST}/${cycle!.id}`, { message: missing.length ? t(`أُضيف ${missing.length} موظف`, `${missing.length} employee(s) added`) : t("كل الموظفين النشطين مضافون", "Every active employee is already included") });
}

export async function setCycleStatus(formData: FormData) {
  const user = await requirePermission("performance.edit", LIST);
  const { t } = await getI18n();
  const cycle = await prisma.reviewCycle.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!cycle) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  const status = cycle!.status === "OPEN" ? "CLOSED" : "OPEN";
  await prisma.reviewCycle.update({ where: { id: cycle!.id }, data: { status } });
  await writeAudit({
    userId: user.id,
    action: status === "CLOSED" ? "REVIEW_CYCLE_CLOSE" : "REVIEW_CYCLE_OPEN",
    message: t(`${status === "CLOSED" ? "أغلق" : "أعاد فتح"} تقييم الأداء «${cycle!.name}»`, `${status === "CLOSED" ? "Closed" : "Reopened"} the review "${cycle!.name}"`),
  });
  refreshAll();
  go(`${LIST}/${cycle!.id}`, { message: status === "CLOSED" ? t("أُغلق التقييم", "Review closed") : t("أُعيد فتح التقييم", "Review reopened") });
}

export async function deleteCycle(formData: FormData) {
  const user = await requirePermission("performance.delete", LIST);
  const { t } = await getI18n();
  const cycle = await prisma.reviewCycle.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId } });
  if (!cycle) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  await prisma.reviewCycle.delete({ where: { id: cycle!.id } });
  await writeAudit({ userId: user.id, action: "REVIEW_CYCLE_DELETE", message: t(`حذف تقييم الأداء «${cycle!.name}» وكل تقييماته`, `Deleted the review "${cycle!.name}" and all its reviews`) });
  refreshAll();
  go(LIST, { message: t("حُذف التقييم", "Review deleted") });
}

async function ownReview(id: string, companyId: string) {
  return prisma.performanceReview.findFirst({
    where: { id, companyId },
    include: { cycle: true, employee: { select: { id: true, fullName: true, nameEn: true, jobTitle: true, jobTitleEn: true } } },
  });
}

export async function saveReview(formData: FormData) {
  const user = await requirePermission("performance.edit", LIST);
  const { t } = await getI18n();
  const review = await ownReview(req(formData, "id"), user.companyId);
  if (!review) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  const back = `${LIST}/reviews/${review!.id}`;
  if (review!.cycle.status === "CLOSED") go(back, { error: t("التقييم مغلق؛ أعد فتحه للتعديل", "This review round is closed; reopen it to edit") });
  const criteria = parseCriteria(review!.cycle.criteria);
  const scores = parseScores(Object.fromEntries(criteria.map((item) => [item.key, req(formData, `score_${item.key}`)])));
  const decision = req(formData, "decision");
  const finish = decision === "finish";
  if (finish && criteria.some((item) => !scores[item.key])) go(back, { error: t("قيّم كل المعايير قبل الاعتماد", "Score every criterion before completing") });
  const overall = overallOf(scores, criteria);
  await prisma.performanceReview.update({
    where: { id: review!.id },
    data: {
      scores,
      overall,
      strengths: clip(str(formData, "strengths"), 2000),
      improvements: clip(str(formData, "improvements"), 2000),
      goals: clip(str(formData, "goals"), 2000),
      comment: clip(str(formData, "comment"), 2000),
      reviewerName: user.name,
      status: finish ? "DONE" : "DRAFT",
      completedAt: finish ? (review!.completedAt ?? new Date()) : null,
      sharedAt: finish ? review!.sharedAt : null,
    },
  });
  if (finish || review!.status === "DONE") {
    await writeAudit({
      userId: user.id,
      employeeId: review!.employeeId,
      action: finish ? "REVIEW_COMPLETE" : "REVIEW_REOPEN",
      message: finish
        ? t(`اعتمد تقييم أداء ${review!.employee.fullName} في «${review!.cycle.name}»: ${overall} من 5`, `Completed ${review!.employee.fullName}'s review in "${review!.cycle.name}": ${overall} of 5`)
        : t(`أعاد تقييم ${review!.employee.fullName} إلى المسودة`, `Moved ${review!.employee.fullName}'s review back to draft`),
    });
  }
  refreshAll();
  go(finish ? `${LIST}/${review!.cycleId}` : back, { message: finish ? t(`اعتُمد تقييم ${review!.employee.fullName}`, `${review!.employee.fullName}'s review completed`) : t("حُفظت المسودة", "Draft saved") });
}

/** Fills the empty text fields of a review with an AI draft built from the employee's file. */
export async function draftReview(formData: FormData) {
  const user = await requirePermission("performance.edit", LIST);
  const { lang, t } = await getI18n();
  const review = await ownReview(req(formData, "id"), user.companyId);
  if (!review) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  const back = `${LIST}/reviews/${review!.id}`;
  if (review!.cycle.status === "CLOSED" || review!.status === "DONE") go(back, { error: t("أعد التقييم إلى المسودة أولاً", "Move the review back to draft first") });
  const criteria = parseCriteria(review!.cycle.criteria);
  const facts = await reviewFacts(review!.employeeId, user.companyId, review!.cycle.periodStart, review!.cycle.periodEnd, lang);
  const scores = parseScores(review!.scores);
  const scored = criteria.filter((item) => scores[item.key]).map((item) => `${lang === "en" ? item.en : item.ar}: ${scores[item.key]}/5`);
  let draft: Awaited<ReturnType<typeof aiDraftReview>> = null;
  try {
    draft = await aiDraftReview({
      lang,
      employeeName: lang === "en" && review!.employee.nameEn ? review!.employee.nameEn : review!.employee.fullName,
      jobTitle: lang === "en" ? review!.employee.jobTitleEn || review!.employee.jobTitle : review!.employee.jobTitle,
      period: `${formatDate(review!.cycle.periodStart)} – ${formatDate(review!.cycle.periodEnd)}`,
      criteria: criteria.map((item) => (lang === "en" ? item.en : item.ar)),
      facts: [...facts, ...(scored.length ? [`${t("درجات المدير حتى الآن", "Manager's scores so far")}: ${scored.join("; ")}`] : [])],
    });
  } catch (error) {
    console.error("AI review draft failed", error);
    go(back, { error: isRateLimited(error) ? t("الذكاء الاصطناعي مشغول الآن، حاول بعد دقيقة", "The AI is busy; try again in a minute") : t("تعذرت الصياغة الآن، حاول لاحقاً", "Drafting is unavailable right now") });
  }
  if (!draft) go(back, { error: t("لم تُرجِع الصياغة نصاً، حاول مجدداً", "The draft came back empty; try again") });
  await prisma.performanceReview.update({
    where: { id: review!.id },
    data: {
      strengths: review!.strengths || draft!.strengths || null,
      improvements: review!.improvements || draft!.improvements || null,
      goals: review!.goals || draft!.goals || null,
    },
  });
  refreshAll();
  go(back, { message: t("كُتبت مسودة في الحقول الفارغة — راجعها وعدّلها قبل الاعتماد", "A draft was written into the empty fields — review and edit it before completing") });
}

export async function shareReview(formData: FormData) {
  const user = await requirePermission("performance.edit", LIST);
  const { t } = await getI18n();
  const review = await ownReview(req(formData, "id"), user.companyId);
  if (!review) go(LIST, { error: t("التقييم غير موجود", "Review not found") });
  const back = `${LIST}/reviews/${review!.id}`;
  if (review!.status !== "DONE") go(back, { error: t("اعتمد التقييم قبل مشاركته", "Complete the review before sharing it") });
  const sharing = !review!.sharedAt;
  await prisma.performanceReview.update({ where: { id: review!.id }, data: { sharedAt: sharing ? new Date() : null } });
  await writeAudit({
    userId: user.id,
    employeeId: review!.employeeId,
    action: sharing ? "REVIEW_SHARE" : "REVIEW_UNSHARE",
    message: t(`${sharing ? "شارك" : "أخفى"} تقييم ${review!.employee.fullName} ${sharing ? "في" : "من"} بوابة الموظف`, `${sharing ? "Shared" : "Hid"} ${review!.employee.fullName}'s review ${sharing ? "in" : "from"} the employee portal`),
  });
  refreshAll();
  go(back, { message: sharing ? t("يظهر التقييم الآن في بوابة الموظف", "The review now shows in the employee portal") : t("أُخفي التقييم من البوابة", "Review hidden from the portal") });
}
