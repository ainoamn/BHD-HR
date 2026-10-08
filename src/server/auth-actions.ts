"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import { endSessionUrl, isSsoConfigured, safeReturnPath } from "@/lib/bhd/identity";
import { requestOrigin } from "@/lib/request-origin";
import { go } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { req, str } from "@/lib/utils";

export async function login(formData: FormData) {
  const email = req(formData, "email").toLowerCase();
  const password = req(formData, "password");
  const next = safeReturnPath(str(formData, "next"));
  const back = `/login?local=1${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`;
  const { t } = await getI18n();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.password)) {
    const count = await prisma.user.count();
    if (count === 0) {
      go(back, { error: t("النظام غير مُعد بعد. من مجلد المشروع شغّل الأمر: npm run db:setup", "System not set up. Run: npm run db:setup") });
    }
    go(back, { error: t("البريد أو كلمة المرور غير صحيحة", "Wrong email or password") });
  }
  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user!.id), sessionCookieOptions());
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  if (isSsoConfigured()) redirect(endSessionUrl(await requestOrigin()));
  redirect("/login?local=1");
}
