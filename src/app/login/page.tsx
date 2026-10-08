import { redirect } from "next/navigation";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { fieldClass } from "@/components/ui";
import { isSsoConfigured, safeReturnPath } from "@/lib/bhd/identity";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { login } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; local?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeReturnPath(sp.next);
  const sso = isSsoConfigured();
  const startHref = `/api/auth/bhd/start?returnTo=${encodeURIComponent(next)}`;

  if (sso && sp.local !== "1") redirect(startHref);
  if (sso && sp.local === "1" && /^\/(admin|settings)(\/|\?|$)/.test(next)) {
    redirect(`/api/auth/admin-entry?next=${encodeURIComponent(next)}`);
  }

  const { t } = await getI18n();
  const firstRun = await prisma.user.findFirst({ where: { email: "admin@bhd.local", mustChangePassword: true }, select: { id: true } });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex justify-end">
          <LangToggle />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <span className="official-logo official-logo-mark official-logo-ink w-16" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("نظام الموظفين والرواتب", "HR & Payroll System")}</h1>
            <p className="text-sm text-slate-500">{t("بيانات العمال، الغياب، المستندات، وصرف الرواتب", "Employees, attendance, documents and payroll")}</p>
          </div>
        </div>
        <Flash error={sp.error} />
        {sso ? (
          <div className="mb-5 space-y-3">
            <a href={startHref} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-900">
              {t("الدخول بحساب BHD", "Sign in with BHD account")}
            </a>
            <p className="text-center text-xs text-slate-500">{t("دخول طوارئ محلي للمسؤول فقط", "Local emergency sign-in for administrators only")}</p>
          </div>
        ) : null}
        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t("البريد", "Email")}</span>
            <input className={`${fieldClass} w-full`} name="email" type="email" autoComplete="username" required defaultValue={firstRun ? "admin@bhd.local" : undefined} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t("كلمة المرور", "Password")}</span>
            <input className={`${fieldClass} w-full`} name="password" type="password" autoComplete="current-password" required />
          </label>
          <SubmitButton>{t("دخول", "Sign in")}</SubmitButton>
        </form>
        {firstRun ? (
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
            {t("أول تشغيل: البريد", "First run: email")} <strong>admin@bhd.local</strong> {t("وكلمة المرور", "and password")} <strong>admin123</strong>.{" "}
            {t("غيّرها من الإعدادات بعد الدخول.", "Change it in Settings after signing in.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
