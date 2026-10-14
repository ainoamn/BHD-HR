"use server";

import { after } from "next/server";
import { writeAudit } from "@/lib/audit";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { notifyEmployee } from "@/lib/notify";
import { findPortalEmployee } from "@/lib/portal";
import { answerMatches, deviceChallenge, rememberDevice } from "@/lib/portal-device";
import { LIMITS, clearLimit, clientIp, hitLimit, limitKey, waitText } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { req } from "@/lib/utils";

/** The new-device question: right answer remembers the browser; wrong answers are limited per employee and per IP. */
export async function verifyPortalDevice(formData: FormData) {
  const { lang, t } = await getI18n();
  const token = req(formData, "token");
  const employee = await findPortalEmployee(token);
  if (!employee) go("/portal/invalid", { error: t("الرابط غير صالح أو أُوقف", "This link is invalid or was turned off") });
  const back = `/portal/${token}/verify`;
  const challenge = deviceChallenge(employee!);
  if (!challenge) go(`/portal/${token}`);
  const employeeKey = limitKey("deviceEmployee", employee!.id);
  const ipKey = limitKey("deviceIp", await clientIp());
  const [perEmployee, perIp] = await Promise.all([hitLimit(employeeKey, LIMITS.deviceEmployee), hitLimit(ipKey, LIMITS.deviceIp)]);
  if (!perEmployee.ok || !perIp.ok) {
    const wait = waitText(Math.max(perEmployee.ok ? 0 : perEmployee.retryAfter, perIp.ok ? 0 : perIp.retryAfter), lang);
    go(back, { error: t(`محاولات كثيرة. حاول بعد ${wait}، أو اطلب من الموارد البشرية رابطاً جديداً.`, `Too many attempts. Try again in ${wait}, or ask HR for a new link.`) });
  }
  if (!answerMatches(challenge!.answer, req(formData, "answer"))) {
    const left = Math.max(0, LIMITS.deviceEmployee.limit - perEmployee.count);
    go(back, { error: t(`الإجابة غير صحيحة. بقيت ${left} محاولات.`, `That is not right. ${left} attempt(s) left.`) });
  }
  await clearLimit(employeeKey);
  await rememberDevice(employee!);
  await writeAudit({
    companyId: employee!.companyId,
    employeeId: employee!.id,
    action: "PORTAL_DEVICE",
    message: `فُتحت بوابة ${employee!.fullName} من جهاز جديد بعد التحقق`,
  });
  const origin = await requestOrigin();
  after(() =>
    notifyEmployee(
      employee!.id,
      {
        ar: { title: "دخول من جهاز جديد", body: "فُتحت بوابتك الآن من جهاز جديد. إن لم تكن أنت، اطلب من الموارد البشرية تجديد رابطك." },
        en: { title: "Sign-in from a new device", body: "Your portal was just opened on a new device. If this was not you, ask HR to renew your link." },
        path: "",
      },
      origin,
    ),
  );
  go(`/portal/${token}`);
}
