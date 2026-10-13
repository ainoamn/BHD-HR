"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COMPANY_COOKIE, SESSION_COOKIE, readSession, requireUser, sessionCookieOptions, signSession } from "@/lib/auth";
import { endSessionUrl, isSsoConfigured, safeReturnPath } from "@/lib/bhd/identity";
import { requestOrigin } from "@/lib/request-origin";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { req, str } from "@/lib/utils";
import { ensureWorkspace, linkInvitations } from "@/lib/workspace";

/** Email or the username of an account opened for an employee or sponsor. */
export async function login(formData: FormData) {
  const login = req(formData, "email").toLowerCase();
  const password = req(formData, "password");
  const next = safeReturnPath(str(formData, "next"));
  const back = `/login?local=1${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`;
  const { t } = await getI18n();
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
    go(back, { error: t("اسم المستخدم أو كلمة المرور غير صحيحة", "Wrong username or password") });
  }
  if (user!.username) {
    if (!(await prisma.membership.count({ where: { userId: user!.id } }))) {
      go(back, { error: t("هذا الحساب موقوف. تواصل مع الموارد البشرية.", "This account is closed. Contact HR.") });
    }
    await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
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
  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  await linkInvitations(user!);
  await ensureWorkspace(user!);
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
