"use server";

import type { Prisma } from "@prisma/client";
import { aiPolishCv, isRateLimited } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, requirePermission } from "@/lib/auth";
import { readCv, sanitizeCv, hasCvContent, type CvContent } from "@/lib/cv";
import { go, refreshAll } from "@/lib/http";
import type { Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { req, safeReturn, str } from "@/lib/utils";

type Owner = { token?: string; employeeId?: string };

/** The employee whose CV is edited: by portal link (the employee) or by id (staff with employees.edit). */
async function cvEmployee(owner: Owner) {
  if (owner.token) {
    const employee = await portalEmployee(owner.token);
    return employee ? { employee, userId: null as string | null, byEmployee: true } : null;
  }
  if (!owner.employeeId) return null;
  const user = await getSessionUser();
  if (!user || !can(user, "employees.edit")) return null;
  const employee = await prisma.employee.findFirst({ where: { id: owner.employeeId, companyId: user.companyId }, include: { company: true, employer: true } });
  return employee ? { employee, userId: user.id as string | null, byEmployee: false } : null;
}

function langOf(value: string | null | undefined): Lang {
  return value === "en" ? "en" : "ar";
}

export async function saveCv(formData: FormData) {
  const { t } = await getI18n();
  const token = str(formData, "token") || undefined;
  const employeeId = str(formData, "employeeId") || undefined;
  if (employeeId && !token) await requirePermission("employees.edit");
  const found = await cvEmployee({ token, employeeId });
  const back = safeReturn(formData.get("back"), token ? `/portal/${token}` : `/employees/${employeeId}`);
  if (!found) go(token ? "/portal/invalid" : "/employees", { error: t("الرابط غير صالح أو لا تملك الصلاحية", "Invalid link or not allowed") });
  const { employee, userId, byEmployee } = found!;
  const lang = langOf(req(formData, "lang"));
  let content: CvContent;
  try {
    content = sanitizeCv(JSON.parse(String(formData.get("cv") || "{}")));
  } catch {
    go(back, { error: t("تعذّر قراءة البيانات، أعد المحاولة", "The data could not be read; try again") });
  }
  const cv = { ...readCv(employee.cv), [lang]: content! };
  await prisma.employee.update({ where: { id: employee.id }, data: { cv: cv as unknown as Prisma.InputJsonValue, cvUpdatedAt: new Date() } });
  await writeAudit({
    companyId: employee.companyId,
    userId,
    employeeId: employee.id,
    action: "CV_UPDATE",
    message: byEmployee ? `حدّث ${employee.fullName} سيرته الذاتية من البوابة (${lang === "ar" ? "العربية" : "الإنجليزية"})` : `تحديث السيرة الذاتية لـ ${employee.fullName} (${lang === "ar" ? "العربية" : "الإنجليزية"})`,
  });
  refreshAll();
  go(back, { message: t("حُفظت السيرة الذاتية", "CV saved") });
}

/**
 * Polishes the form's content in its language, or translates the saved other-language version into it.
 * Returns the content for the form to show; nothing is saved until the user presses save.
 */
export async function polishCv(input: Owner & { lang: string; mode: "polish" | "translate"; content: unknown }): Promise<{ content?: CvContent; error?: string }> {
  const { t } = await getI18n();
  const found = await cvEmployee({ token: input.token, employeeId: input.employeeId });
  if (!found) return { error: t("الرابط غير صالح أو لا تملك الصلاحية", "Invalid link or not allowed") };
  const { employee } = found;
  const lang = langOf(input.lang);
  const source = input.mode === "translate" ? readCv(employee.cv)[lang === "ar" ? "en" : "ar"] : sanitizeCv(input.content);
  if (!hasCvContent(source)) {
    return {
      error:
        input.mode === "translate"
          ? t("احفظ النسخة الأخرى أولاً ثم ترجمها", "Save the other version first, then translate it")
          : t("اكتب بعض بياناتك أولاً (النبذة أو الخبرات)", "Fill in some details first (summary or experience)"),
    };
  }
  try {
    const result = await aiPolishCv({
      to: lang,
      cv: source,
      jobTitle: lang === "en" ? employee.jobTitleEn || employee.jobTitle : employee.jobTitle,
      company: (lang === "en" && employee.company.nameEn) || employee.company.name,
    });
    if (!result) return { error: t("لم تُرجِع الصياغة نتيجة، حاول مرة أخرى", "The rewrite came back empty; try again") };
    const polished = sanitizeCv(result);
    if (!hasCvContent(polished)) return { error: t("لم تُرجِع الصياغة نتيجة، حاول مرة أخرى", "The rewrite came back empty; try again") };
    // The model may drop links or flags it was told to keep; restore them from the source.
    polished.linkedin = source!.linkedin;
    polished.website = source!.website;
    polished.experience = polished.experience.map((item, index) => ({
      ...item,
      from: source!.experience[index]?.from ?? item.from,
      to: source!.experience[index]?.to ?? item.to,
      current: source!.experience[index]?.current ?? item.current,
    }));
    polished.education = polished.education.map((item, index) => ({ ...item, from: source!.education[index]?.from ?? item.from, to: source!.education[index]?.to ?? item.to }));
    polished.languages = polished.languages.map((item, index) => ({ ...item, level: source!.languages[index]?.level ?? item.level }));
    return { content: polished };
  } catch (error) {
    console.error("AI CV polish failed", error);
    return {
      error: isRateLimited(error)
        ? t("المساعد مشغول الآن. حاول بعد دقيقة.", "The assistant is busy. Try again in a minute.")
        : t("تعذّرت الصياغة الآن. يمكنك الحفظ كما هي والمحاولة لاحقاً.", "Rewriting is unavailable right now. You can save as is and try later."),
    };
  }
}
