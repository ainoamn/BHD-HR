"use server";

import { writeAudit } from "@/lib/audit";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { MAX_PUBLIC_APPLICATIONS } from "@/lib/recruitment";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { clip, num, req, round3, str } from "@/lib/utils";

/** The public job page's form; the link token is the only key. */
export async function submitApplication(formData: FormData) {
  const { lang, t } = await getI18n();
  const token = req(formData, "token");
  const back = `/apply/${token}`;
  if (str(formData, "website")) go(`${back}?done=1`);
  const job = token.length >= 20 ? await prisma.jobOpening.findUnique({ where: { applyToken: token } }) : null;
  if (!job || job.status !== "OPEN" || (job.closesAt && job.closesAt.getTime() + 86400000 < Date.now())) {
    go(back, { error: t("هذا الشاغر لم يعد يستقبل طلبات", "This vacancy is no longer taking applications") });
  }
  const fullName = clip(str(formData, "fullName"), 120) || "";
  const email = clip(str(formData, "email"), 120)?.toLowerCase() || null;
  const phone = clip(normalizePhone(str(formData, "phone")), 30);
  if (fullName.length < 3) go(back, { error: t("اكتب اسمك الكامل", "Enter your full name") });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go(back, { error: t("البريد الإلكتروني غير صحيح", "The email address is not valid") });
  if (!email && !phone) go(back, { error: t("اكتب بريدك أو هاتفك للتواصل", "Enter your email or phone so we can reach you") });
  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) go(back, { error: t("أرفق سيرتك الذاتية", "Attach your CV") });
  const received = await prisma.candidate.count({ where: { jobId: job!.id, source: "APPLY_LINK" } });
  if (received >= MAX_PUBLIC_APPLICATIONS) go(back, { error: t("اكتمل عدد الطلبات لهذا الشاغر", "This vacancy has reached its application limit") });
  const duplicate = await prisma.candidate.count({
    where: { jobId: job!.id, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });
  if (duplicate) go(`${back}?done=1`);
  let cvUrl: string | null = null;
  try {
    cvUrl = await saveUpload(file as File, job!.companyId, lang);
  } catch (error) {
    go(back, { error: error instanceof Error ? error.message : t("تعذر رفع الملف", "Could not upload the file") });
  }
  const years = num(formData, "experienceYears");
  try {
    await prisma.candidate.create({
      data: {
        companyId: job!.companyId,
        jobId: job!.id,
        fullName,
        email,
        phone,
        currentTitle: clip(str(formData, "currentTitle"), 120),
        experienceYears: years > 0 && years < 60 ? round3(years) : null,
        coverNote: clip(str(formData, "coverNote"), 1500),
        cvUrl,
        source: "APPLY_LINK",
      },
    });
  } catch (error) {
    await removeUpload(cvUrl);
    console.error(error);
    go(back, { error: t("تعذر إرسال الطلب، حاول مجدداً", "Could not send the application; try again") });
  }
  await writeAudit({ companyId: job!.companyId, action: "JOB_APPLICATION", message: `تقدّم ${fullName} للشاغر «${job!.title}» من رابط التقديم` });
  refreshAll();
  go(`${back}?done=1`);
}
