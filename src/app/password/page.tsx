import { cookies } from "next/headers";
import { KeyRound } from "lucide-react";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Field, fieldClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";
import { changeOwnPassword } from "@/server/account-actions";
import { logout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t } = await getI18n();
  const first = user.mustChangePassword;

  return (
    <main className="flex min-h-dvh flex-col bg-sand-50">
      <div className="flex items-center justify-end gap-2 px-5 pt-5 sm:px-8">
        <ThemeToggle initial={normalizeTheme((await cookies()).get(THEME_COOKIE)?.value)} />
        <LangToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
              <KeyRound size={20} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{first ? t(`أهلاً ${user.name}`, `Welcome, ${user.name}`) : t("تغيير كلمة المرور", "Change password")}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {first
                  ? t("هذه كلمة مرور مؤقتة. اختر كلمة مرور خاصة بك لتكمل الدخول.", "This is a temporary password. Choose your own to continue.")
                  : t("اكتب كلمة المرور الحالية ثم الجديدة.", "Enter your current password, then the new one.")}
              </p>
            </div>
          </div>
          <Flash error={sp.error} />
          <form action={changeOwnPassword} className="space-y-4 rounded-3xl border border-slate-200/90 bg-surface p-6 shadow-raised sm:p-8">
            {user.username ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-100">
                {t("اسم المستخدم:", "Username:")}{" "}
                <strong className="font-mono" dir="ltr">
                  {user.username}
                </strong>
              </p>
            ) : null}
            {first ? null : (
              <Field label={t("كلمة المرور الحالية", "Current password")}>
                <input className={`${fieldClass} w-full`} name="current" type="password" dir="ltr" autoComplete="current-password" required />
              </Field>
            )}
            <Field label={t("كلمة المرور الجديدة", "New password")} hint={t("8 أحرف على الأقل", "At least 8 characters")}>
              <input className={`${fieldClass} w-full`} name="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label={t("تأكيد كلمة المرور", "Confirm password")}>
              <input className={`${fieldClass} w-full`} name="confirm" type="password" dir="ltr" autoComplete="new-password" minLength={8} required />
            </Field>
            <SubmitButton className="w-full" pendingLabel={t("جارٍ الحفظ...", "Saving...")}>
              {t("حفظ والمتابعة", "Save and continue")}
            </SubmitButton>
          </form>
          <form action={logout} className="mt-4 text-center">
            <button type="submit" className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline">
              {t("تسجيل الخروج", "Sign out")}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
