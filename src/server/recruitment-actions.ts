"use server";

import path from "path";
import { openAndSend, sendSummary } from "@/lib/accounts";
import { aiScreenCandidate, isRateLimited } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, requirePermission } from "@/lib/auth";
import { newBadgeToken } from "@/lib/badge";
import { nextEmployeeNumber } from "@/lib/employee-number";
import { getHrCatalog } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STAGES, EMPLOYMENT_TYPES, JOB_STATUSES, STAGES, STAGE_LABEL, newApplyToken } from "@/lib/recruitment";
import { requestOrigin } from "@/lib/request-origin";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { clip, intValue, num, parseDateInput, req, round3, safeReturn, str, todayInputValue } from "@/lib/utils";

const LIST = "/recruitment";
const SCREEN_BATCH = 5;

function optionalAmount(formData: FormData, key: string) {
  const value = round3(num(formData, key));
  return value > 0 && value < 10_000_000 ? value : null;
}

async function ownJob(id: string, companyId: string) {
  return prisma.jobOpening.findFirst({ where: { id, companyId } });
}

async function ownCandidate(id: string, companyId: string) {
  return prisma.candidate.findFirst({ where: { id, companyId }, include: { job: true } });
}

/** A CV stays while an employee document (copied on hiring) still points at it. */
async function removeCvIfUnused(url: string | null) {
  if (!url) return;
  const used = await prisma.employeeDocument.count({ where: { fileUrl: url } });
  if (!used) await removeUpload(url);
}

export async function saveJob(formData: FormData) {
  const id = req(formData, "id");
  const user = await requirePermission(id ? "recruitment.edit" : "recruitment.create", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), id ? `${LIST}/${id}` : LIST);
  const catalog = await getHrCatalog(user.companyId);
  const jobTitle = catalog.jobTitles.find((item) => item.id === req(formData, "jobTitleId")) || null;
  const department = catalog.departments.find((item) => item.id === req(formData, "departmentId")) || null;
  const title = clip(str(formData, "title"), 120) || jobTitle?.nameAr || "";
  if (title.length < 2) go(back, { error: t("اكتب المسمى الوظيفي للشاغر", "Enter the vacancy's job title") });
  const type = req(formData, "employmentType");
  const status = req(formData, "status");
  const salaryMin = optionalAmount(formData, "salaryMin");
  const salaryMax = optionalAmount(formData, "salaryMax");
  if (salaryMin && salaryMax && salaryMax < salaryMin) go(back, { error: t("الحد الأعلى للراتب أقل من الحد الأدنى", "The salary maximum is below the minimum") });
  const data = {
    title,
    titleEn: clip(str(formData, "titleEn"), 120) || jobTitle?.nameEn || null,
    jobTitleId: jobTitle?.id ?? null,
    departmentId: department?.id ?? null,
    department: department?.nameAr ?? null,
    departmentEn: department?.nameEn ?? null,
    description: clip(str(formData, "description"), 6000),
    location: clip(str(formData, "location"), 120),
    employmentType: (EMPLOYMENT_TYPES as readonly string[]).includes(type) ? type : "FULL_TIME",
    openings: Math.min(Math.max(intValue(formData, "openings") || 1, 1), 500),
    salaryMin,
    salaryMax,
    closesAt: parseDateInput(str(formData, "closesAt")),
    status: (JOB_STATUSES as readonly string[]).includes(status) ? status : "OPEN",
  };
  let jobId = id;
  if (id) {
    const job = await ownJob(id, user.companyId);
    if (!job) go(LIST, { error: t("الشاغر غير موجود", "Vacancy not found") });
    await prisma.jobOpening.update({ where: { id }, data });
  } else {
    const created = await prisma.jobOpening.create({
      data: { ...data, companyId: user.companyId, createdByName: user.name, applyToken: req(formData, "publicLink") === "1" ? newApplyToken() : null },
    });
    jobId = created.id;
  }
  await writeAudit({
    userId: user.id,
    action: id ? "JOB_UPDATE" : "JOB_CREATE",
    message: t(`${id ? "عدّل" : "أضاف"} الشاغر «${title}»`, `${id ? "Edited" : "Added"} the vacancy "${title}"`),
  });
  refreshAll();
  go(`${LIST}/${jobId}`, { message: id ? t("تم حفظ الشاغر", "Vacancy saved") : t("أُضيف الشاغر", "Vacancy added") });
}

export async function setApplyLink(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { t } = await getI18n();
  const job = await ownJob(req(formData, "id"), user.companyId);
  if (!job) go(LIST, { error: t("الشاغر غير موجود", "Vacancy not found") });
  const enable = req(formData, "mode") !== "off";
  await prisma.jobOpening.update({ where: { id: job!.id }, data: { applyToken: enable ? newApplyToken() : null } });
  await writeAudit({
    userId: user.id,
    action: enable ? "JOB_LINK_RENEW" : "JOB_LINK_OFF",
    message: t(`${enable ? "أنشأ رابط تقديم جديداً" : "أوقف رابط التقديم"} للشاغر «${job!.title}»`, `${enable ? "Created a new apply link" : "Turned off the apply link"} for "${job!.title}"`),
  });
  refreshAll();
  go(`${LIST}/${job!.id}#share`, { message: enable ? t("رابط التقديم جاهز؛ الرابط السابق لم يعد يعمل", "The apply link is ready; any previous link stopped working") : t("أُوقف رابط التقديم", "Apply link turned off") });
}

export async function deleteJob(formData: FormData) {
  const user = await requirePermission("recruitment.delete", LIST);
  const { t } = await getI18n();
  const job = await prisma.jobOpening.findFirst({ where: { id: req(formData, "id"), companyId: user.companyId }, include: { candidates: { select: { cvUrl: true } } } });
  if (!job) go(LIST, { error: t("الشاغر غير موجود", "Vacancy not found") });
  await prisma.jobOpening.delete({ where: { id: job!.id } });
  for (const candidate of job!.candidates) await removeCvIfUnused(candidate.cvUrl);
  await writeAudit({
    userId: user.id,
    action: "JOB_DELETE",
    message: t(`حذف الشاغر «${job!.title}» و${job!.candidates.length} مرشحاً`, `Deleted the vacancy "${job!.title}" and ${job!.candidates.length} candidate(s)`),
  });
  refreshAll();
  go(LIST, { message: t("حُذف الشاغر", "Vacancy deleted") });
}

function candidateFields(formData: FormData) {
  const years = num(formData, "experienceYears");
  const email = clip(str(formData, "email"), 120)?.toLowerCase() || null;
  return {
    fullName: clip(str(formData, "fullName"), 120) || "",
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: clip(normalizePhone(str(formData, "phone")), 30),
    currentTitle: clip(str(formData, "currentTitle"), 120),
    experienceYears: years > 0 && years < 60 ? round3(years) : null,
    expectedSalary: optionalAmount(formData, "expectedSalary"),
  };
}

export async function addCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.create", LIST);
  const { lang, t } = await getI18n();
  const job = await ownJob(req(formData, "jobId"), user.companyId);
  if (!job) go(LIST, { error: t("الشاغر غير موجود", "Vacancy not found") });
  const back = `${LIST}/${job!.id}`;
  const fields = candidateFields(formData);
  const file = formData.get("cv");
  const hasCv = file instanceof File && file.size > 0;
  if (fields.fullName.length < 2 && !hasCv) go(back, { error: t("اكتب اسم المرشح أو أرفق سيرته الذاتية", "Enter the candidate's name or attach the CV") });
  let cvUrl: string | null = null;
  if (hasCv) {
    try {
      cvUrl = await saveUpload(file as File, user.companyId, lang);
    } catch (error) {
      go(back, { error: error instanceof Error ? error.message : t("تعذر رفع الملف", "Could not upload the file") });
    }
  }
  const candidate = await prisma.candidate.create({
    data: {
      ...fields,
      fullName: fields.fullName || t("مرشح جديد", "New candidate"),
      companyId: user.companyId,
      jobId: job!.id,
      cvUrl,
      notes: clip(str(formData, "notes"), 2000),
      source: "HR",
    },
  });
  await writeAudit({
    userId: user.id,
    action: "CANDIDATE_CREATE",
    message: t(`أضاف المرشح ${candidate.fullName} للشاغر «${job!.title}»`, `Added candidate ${candidate.fullName} to "${job!.title}"`),
  });
  let note = "";
  if (cvUrl && req(formData, "screen") === "1") {
    const result = await runScreening(candidate.id, user.companyId, lang);
    note = result.ok ? t(" وقُيّمت سيرته بالذكاء الاصطناعي", "; the CV was screened by AI") : ` — ${result.error}`;
  }
  refreshAll();
  go(`${LIST}/candidates/${candidate.id}`, { message: `${t("أُضيف المرشح", "Candidate added")}${note}` });
}

export async function updateCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { lang, t } = await getI18n();
  const candidate = await ownCandidate(req(formData, "id"), user.companyId);
  if (!candidate) go(LIST, { error: t("المرشح غير موجود", "Candidate not found") });
  const back = `${LIST}/candidates/${candidate!.id}`;
  const fields = candidateFields(formData);
  if (fields.fullName.length < 2) go(back, { error: t("اكتب اسم المرشح", "Enter the candidate's name") });
  const rating = intValue(formData, "rating");
  const file = formData.get("cv");
  let cvUrl = candidate!.cvUrl;
  if (file instanceof File && file.size > 0) {
    try {
      cvUrl = await saveUpload(file, user.companyId, lang);
    } catch (error) {
      go(back, { error: error instanceof Error ? error.message : t("تعذر رفع الملف", "Could not upload the file") });
    }
  }
  const interview = str(formData, "interviewAt");
  const interviewAt = interview && !Number.isNaN(Date.parse(`${interview}:00+04:00`)) ? new Date(`${interview}:00+04:00`) : null;
  await prisma.candidate.update({
    where: { id: candidate!.id },
    data: {
      ...fields,
      cvUrl,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      interviewAt,
      notes: clip(str(formData, "notes"), 2000),
      ...(cvUrl !== candidate!.cvUrl ? { aiScore: null, aiSummary: null, aiStrengths: [], aiGaps: [], aiAt: null } : {}),
    },
  });
  if (cvUrl !== candidate!.cvUrl) await removeCvIfUnused(candidate!.cvUrl);
  await writeAudit({ userId: user.id, action: "CANDIDATE_UPDATE", message: t(`عدّل بيانات المرشح ${fields.fullName}`, `Edited candidate ${fields.fullName}`) });
  refreshAll();
  go(back, { message: t("تم الحفظ", "Saved") });
}

export async function moveCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { t } = await getI18n();
  const candidate = await ownCandidate(req(formData, "id"), user.companyId);
  if (!candidate) go(LIST, { error: t("المرشح غير موجود", "Candidate not found") });
  const back = safeReturn(formData.get("returnTo"), `${LIST}/candidates/${candidate!.id}`);
  const stage = req(formData, "stage");
  if (!(STAGES as readonly string[]).includes(stage) || stage === "HIRED") go(back, { error: t("اختر مرحلة صحيحة", "Choose a valid stage") });
  if (candidate!.stage === "HIRED") go(back, { error: t("هذا المرشح عُيّن بالفعل", "This candidate has already been hired") });
  await prisma.candidate.update({
    where: { id: candidate!.id },
    data: { stage, rejectReason: stage === "REJECTED" ? clip(str(formData, "rejectReason"), 500) : null },
  });
  await writeAudit({
    userId: user.id,
    action: "CANDIDATE_STAGE",
    message: t(
      `نقل المرشح ${candidate!.fullName} إلى «${STAGE_LABEL[stage].ar}» (${candidate!.job.title})`,
      `Moved candidate ${candidate!.fullName} to "${STAGE_LABEL[stage].en}" (${candidate!.job.title})`,
    ),
  });
  refreshAll();
  go(back, { message: t(`نُقل إلى «${STAGE_LABEL[stage].ar}»`, `Moved to "${STAGE_LABEL[stage].en}"`) });
}

/** Reads the stored CV and saves the AI's match score; contact fields are filled only where empty. */
async function runScreening(candidateId: string, companyId: string, lang: "ar" | "en"): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId }, include: { job: true } });
  if (!candidate) return { ok: false, error: t("المرشح غير موجود", "Candidate not found") };
  const file = candidate.cvUrl?.startsWith("/files/")
    ? await prisma.storedFile.findFirst({ where: { name: path.basename(candidate.cvUrl), companyId }, select: { data: true, mime: true } })
    : null;
  const profile = [
    candidate.currentTitle ? `Current title: ${candidate.currentTitle}` : "",
    candidate.experienceYears !== null ? `Years of experience: ${candidate.experienceYears}` : "",
    candidate.coverNote ? `Cover note: ${candidate.coverNote}` : "",
    candidate.notes ? `HR notes: ${candidate.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!file && !profile) return { ok: false, error: t("أرفق السيرة الذاتية أولاً", "Attach the CV first") };
  try {
    const result = await aiScreenCandidate({
      lang,
      job: { title: candidate.job.title, description: candidate.job.description, employmentType: candidate.job.employmentType, location: candidate.job.location },
      cv: file ? { data: new Uint8Array(file.data), mediaType: file.mime } : null,
      profile,
    });
    if (!result) return { ok: false, error: t("لم يُرجِع الذكاء الاصطناعي تقييماً مفهوماً، حاول مجدداً", "The AI did not return a usable rating; try again") };
    const placeholder = candidate.fullName === "مرشح جديد" || candidate.fullName === "New candidate";
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        aiScore: result.score,
        aiSummary: result.summary,
        aiStrengths: result.strengths,
        aiGaps: result.gaps,
        aiAt: new Date(),
        fullName: placeholder && result.fullName.length >= 2 ? result.fullName : candidate.fullName,
        email: candidate.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) ? result.email : null),
        phone: candidate.phone || clip(normalizePhone(result.phone), 30),
        currentTitle: candidate.currentTitle || result.currentTitle || null,
        experienceYears: candidate.experienceYears ?? result.experienceYears,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("AI screening failed", error);
    return {
      ok: false,
      error: isRateLimited(error)
        ? t("الذكاء الاصطناعي مشغول الآن، حاول بعد دقيقة", "The AI is busy right now; try again in a minute")
        : t("تعذر تقييم السيرة الآن، حاول لاحقاً", "CV screening is unavailable right now; try later"),
    };
  }
}

export async function screenCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { lang, t } = await getI18n();
  const id = req(formData, "id");
  const back = safeReturn(formData.get("returnTo"), `${LIST}/candidates/${id}`);
  const result = await runScreening(id, user.companyId, lang);
  if (!result.ok) go(back, { error: result.error });
  refreshAll();
  go(back, { message: t("تم تقييم السيرة الذاتية", "CV screened") });
}

/** Screens the job's candidates that have a CV and no score yet, a few per press to stay inside the AI rate limit. */
export async function screenJobCandidates(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { lang, t } = await getI18n();
  const job = await ownJob(req(formData, "jobId"), user.companyId);
  if (!job) go(LIST, { error: t("الشاغر غير موجود", "Vacancy not found") });
  const back = `${LIST}/${job!.id}`;
  const waiting = await prisma.candidate.findMany({
    where: { jobId: job!.id, aiAt: null, cvUrl: { not: null }, stage: { in: [...ACTIVE_STAGES] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!waiting.length) go(back, { message: t("كل السير الذاتية مقيّمة", "Every CV is already screened") });
  let done = 0;
  let error = "";
  for (const candidate of waiting.slice(0, SCREEN_BATCH)) {
    const result = await runScreening(candidate.id, user.companyId, lang);
    if (result.ok) done += 1;
    else {
      error = result.error;
      break;
    }
  }
  refreshAll();
  const left = waiting.length - done;
  const message = t(`قُيّمت ${done} سيرة`, `${done} CV(s) screened`) + (left > 0 ? t(` — بقي ${left}، اضغط مرة أخرى`, ` — ${left} left, press again`) : "");
  go(back, done ? { message, ...(error ? { error } : {}) } : { error: error || t("تعذر التقييم", "Screening failed") });
}

/** Creates the employee record from the candidate and opens it for the remaining details. */
export async function hireCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.edit", LIST);
  const { t } = await getI18n();
  const candidate = await ownCandidate(req(formData, "id"), user.companyId);
  if (!candidate) go(LIST, { error: t("المرشح غير موجود", "Candidate not found") });
  const back = `${LIST}/candidates/${candidate!.id}`;
  if (!can(user, "employees.create")) go(back, { error: t("تعيين المرشح يحتاج صلاحية إضافة الموظفين", "Hiring needs the right to add employees") });
  if (candidate!.stage === "HIRED" || candidate!.employeeId) go(back, { error: t("هذا المرشح عُيّن بالفعل", "This candidate has already been hired") });
  const catalog = await getHrCatalog(user.companyId);
  const job = candidate!.job;
  const jobTitle = catalog.jobTitles.find((item) => item.id === job.jobTitleId) || null;
  const joiningDate = parseDateInput(str(formData, "joiningDate")) || parseDateInput(todayInputValue())!;
  const basicSalary = can(user, "salaries.edit") ? optionalAmount(formData, "basicSalary") || 0 : 0;
  const employeeNumber = await nextEmployeeNumber(user.companyId);
  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        companyId: user.companyId,
        employeeNumber,
        badgeToken: newBadgeToken(),
        fullName: candidate!.fullName,
        email: candidate!.email,
        phone: candidate!.phone,
        nationality: candidate!.nationality,
        jobTitleId: jobTitle?.id ?? null,
        jobTitle: jobTitle?.nameAr ?? job.title,
        jobTitleEn: jobTitle?.nameEn ?? job.titleEn,
        departmentId: job.departmentId,
        department: job.department,
        departmentEn: job.departmentEn,
        joiningDate,
        basicSalary,
        status: "ACTIVE",
        notes: t(`عُيّن من التوظيف — شاغر «${job.title}»`, `Hired through recruitment — "${job.title}"`),
      },
    });
    if (candidate!.cvUrl) {
      await tx.employeeDocument.create({
        data: { employeeId: created.id, type: "CERTIFICATE", fileUrl: candidate!.cvUrl, notes: t("السيرة الذاتية (من التوظيف)", "CV (from recruitment)"), reviewedAt: new Date() },
      });
    }
    await tx.candidate.update({ where: { id: candidate!.id }, data: { stage: "HIRED", employeeId: created.id } });
    const hired = await tx.candidate.count({ where: { jobId: job.id, stage: "HIRED" } });
    if (hired >= job.openings && job.status === "OPEN") await tx.jobOpening.update({ where: { id: job.id }, data: { status: "CLOSED", applyToken: null } });
    return created;
  });
  await writeAudit({
    userId: user.id,
    employeeId: employee.id,
    action: "CANDIDATE_HIRE",
    message: t(
      `عيّن المرشح ${candidate!.fullName} برقم ${employee.employeeNumber} (شاغر «${job.title}»)`,
      `Hired candidate ${candidate!.fullName} as ${employee.employeeNumber} ("${job.title}")`,
    ),
  });
  const { sent } = await openAndSend({
    companyId: user.companyId,
    role: "EMPLOYEE",
    person: { name: employee.fullName, email: employee.email, phone: employee.phone },
    employeeId: employee.id,
    actorId: user.id,
    companyName: user.company.name,
    origin: await requestOrigin(),
    label: "موظف",
  });
  refreshAll();
  go(`/employees/${employee.id}/edit`, {
    message: t("أُنشئ ملف الموظف من المرشح وفُتح له حساب دخول — أكمل بياناته", "Employee created from the candidate with a sign-in account — complete the details") + sendSummary(sent, t),
  });
}

export async function deleteCandidate(formData: FormData) {
  const user = await requirePermission("recruitment.delete", LIST);
  const { t } = await getI18n();
  const candidate = await ownCandidate(req(formData, "id"), user.companyId);
  if (!candidate) go(LIST, { error: t("المرشح غير موجود", "Candidate not found") });
  await prisma.candidate.delete({ where: { id: candidate!.id } });
  await removeCvIfUnused(candidate!.cvUrl);
  await writeAudit({ userId: user.id, action: "CANDIDATE_DELETE", message: t(`حذف المرشح ${candidate!.fullName}`, `Deleted candidate ${candidate!.fullName}`) });
  refreshAll();
  go(`${LIST}/${candidate!.jobId}`, { message: t("حُذف المرشح", "Candidate deleted") });
}
