"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COMPANY_COOKIE, SESSION_COOKIE, readSession, requireUser, sessionCookieOptions, signSession } from "@/lib/auth";
import { endSessionUrl, isSsoConfigured, safeReturnPath } from "@/lib/bhd/identity";
import { requestOrigin } from "@/lib/request-origin";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { recordLogin } from "@/lib/login-events";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { LIMITS, clearLimit, clientIp, hitLimit, isLimited, limitKey, waitText } from "@/lib/rate-limit";
import { req, str } from "@/lib/utils";
import { ensureWorkspace } from "@/lib/workspace";

/** Email or the username of an account opened for an employee or sponsor. */
export async function login(formData: FormData) {
  const login = req(formData, "email").toLowerCase();
  const password = req(formData, "password");
  const next = safeReturnPath(str(formData, "next"));
  const back = `/login?local=1${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`;
  const { lang, t } = await getI18n();
  const ipKey = limitKey("loginIp", await clientIp());
  const accountKey = limitKey("loginAccount", login);
  const tooMany = (seconds: number) =>
    go(back, {
      error: t(
        `محاولات دخول خاطئة كثيرة. حاول بعد ${waitText(seconds, lang)}.`,
        `Too many wrong sign-in attempts. Try again in ${waitText(seconds, lang)}.`,
      ),
    });
  if ((await isLimited(ipKey, LIMITS.loginIp)) || (await isLimited(accountKey, LIMITS.loginAccount))) tooMany(LIMITS.loginAccount.windowSeconds);
  const user = login.includes("@") ? await prisma.user.findUnique({ where: { email: login } }) : await prisma.user.findUnique({ where: { username: login } });
  if (user?.bhdSub && !user.password) {
    go(back, {
      error: t(
        "هذا الحساب مربوط بحساب BHD الموحّد. اضغط «الدخول بحساب BHD» وادخل ببريدك وكلمة مرور حساب BHD.",
        "This account is linked to a BHD account. Press “Sign in with BHD account” and use your BHD email and password.",
      ),
    });
  }
  if (!user || !verifyPassword(password, user.password)) {
    const count = await prisma.user.count();
    if (count === 0) {
      go(back, { error: t("النظام غير مُعد بعد. من مجلد المشروع شغّل الأمر: npm run db:setup", "System not set up. Run: npm run db:setup") });
    }
    const [perIp, perAccount] = await Promise.all([hitLimit(ipKey, LIMITS.loginIp), hitLimit(accountKey, LIMITS.loginAccount)]);
    if (!perIp.ok || !perAccount.ok) tooMany(Math.max(perIp.ok ? 0 : perIp.retryAfter, perAccount.ok ? 0 : perAccount.retryAfter));
    go(back, { error: t("اسم المستخدم أو كلمة المرور غير صحيحة", "Wrong username or password") });
  }
  await clearLimit(accountKey);
  if (user!.disabledAt) go(back, { error: t("هذا الحساب موقوف من إدارة المنصة.", "This account was suspended by the platform administration.") });
  const meta = { ip: await clientIp(), userAgent: (await headers()).get("user-agent") };
  if (user!.username) {
    if (!(await prisma.membership.count({ where: { userId: user!.id } }))) {
      go(back, { error: t("هذا الحساب موقوف. تواصل مع الموارد البشرية.", "This account is closed. Contact HR.") });
    }
    await recordLogin(user!.id, "LOCAL", meta);
    const jar = await cookies();
    jar.delete(COMPANY_COOKIE);
    jar.set(SESSION_COOKIE, signSession(user!.id), sessionCookieOptions());
    redirect(user!.mustChangePassword ? "/password" : next);
  }
  if (process.env.NODE_ENV === "production" && user!.mustChangePassword) {
    go(back, {
      error: t(
        "كلمة المرور الافتراضية لا تعمل على النسخة المنشورة. ادخل بحساب BHD، أو غيّر كلمة المرور من نسخة التشغيل المحلية.",
        "The default password is disabled on the published site. Sign in with your BHD account, or change the password from a local run.",
      ),
    });
  }
  await ensureWorkspace(user!, meta.ip);
  await recordLogin(user!.id, "LOCAL", meta);
  const jar = await cookies();
  jar.delete(COMPANY_COOKIE);
  jar.set(SESSION_COOKIE, signSession(user!.id), sessionCookieOptions());
  redirect(next);
}

/** Switch the active company; only companies the user is a member of are accepted. */
export async function switchCompany(formData: FormData) {
  const user = await requireUser();
  const companyId = req(formData, "companyId");
  if (!user.memberships.some((item) => item.companyId === companyId)) redirect("/");
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyId, sessionCookieOptions());
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  const userId = readSession(jar.get(SESSION_COOKIE)?.value);
  const local = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { username: true, bhdSub: true } }) : null;
  jar.delete(SESSION_COOKIE);
  jar.delete(COMPANY_COOKIE);
  if (local?.username && !local.bhdSub) redirect("/login?local=1");
  if (isSsoConfigured()) redirect(endSessionUrl(await requestOrigin()));
  redirect("/login?local=1");
}
