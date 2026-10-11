import { redirect } from "next/navigation";
import { BellRing, Banknote, Files, LogIn, ShieldCheck, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { Field, fieldClass } from "@/components/ui";
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
  const firstRun =
    process.env.NODE_ENV !== "production" &&
    (await prisma.user.findFirst({ where: { email: "admin@bhd.local", mustChangePassword: true }, select: { id: true } }));
  const features = [
    { icon: Users, text: t("ملفات الموظفين والكفلاء", "Employee and sponsor records") },
    { icon: Banknote, text: t("مسيرات الرواتب والإيصالات", "Payroll runs and receipts") },
    { icon: Files, text: t("الوثائق وتواريخ انتهائها", "Documents and expiry dates") },
    { icon: BellRing, text: t("تنبيهات ذكية في وقتها", "Timely smart alerts") },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -top-24 -end-24 size-80 rounded-full bg-teal-500/20 blur-3xl" aria-hidden="true" />
        <div className="higher-horizon pointer-events-none absolute -bottom-10 -end-10 h-80 w-[28rem] bg-[length:100%] opacity-[0.07]" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="official-logo official-logo-mark official-logo-light w-12" aria-hidden="true" />
          <div>
            <p className="font-bold">{t("الموظفون والرواتب", "HR & Payroll")}</p>
            <p className="text-xs text-white/60">{t("من منتجات BHD", "A BHD product")}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">{t("كل ما يخص فريقك، في مكان واحد.", "Everything about your team, in one place.")}</h2>
          <p className="mt-4 text-base leading-8 text-white/70">
            {t("بيانات العمال، الغياب، المستندات، وصرف الرواتب — بوضوح ودقة.", "Employees, attendance, documents and payroll — clear and precise.")}
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm ring-1 ring-inset ring-white/10">
                <Icon size={18} className="shrink-0 text-gold-300" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">BHD · Build Higher Dreams</p>
      </aside>

      <main className="flex min-w-0 flex-col bg-sand-50">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-8 sm:pt-8">
          <span className="flex items-center gap-2.5 lg:invisible">
            <span className="official-logo official-logo-mark official-logo-ink w-10" aria-hidden="true" />
            <span className="text-sm font-bold text-slate-900">{t("الموظفون والرواتب", "HR & Payroll")}</span>
          </span>
          <LangToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md animate-fade-up">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("أهلاً بعودتك", "Welcome back")}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t("سجّل الدخول لمتابعة الموظفين والرواتب.", "Sign in to manage your people and payroll.")}</p>
            </div>
            <Flash error={sp.error} />
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-raised sm:p-8">
              {sso ? (
                <div className="mb-6 space-y-3">
                  <a href={startHref} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800">
                    <ShieldCheck size={18} />
                    {t("الدخول بحساب BHD", "Sign in with BHD account")}
                  </a>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    {t("دخول طوارئ محلي للمسؤول فقط", "Local emergency sign-in for administrators only")}
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                </div>
              ) : null}
              <form action={login} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <Field label={t("البريد", "Email")}>
                  <input className={`${fieldClass} w-full`} name="email" type="email" dir="ltr" autoComplete="username" required defaultValue={firstRun ? "admin@bhd.local" : undefined} />
                </Field>
                <Field label={t("كلمة المرور", "Password")}>
                  <input className={`${fieldClass} w-full`} name="password" type="password" dir="ltr" autoComplete="current-password" required />
                </Field>
                <SubmitButton className="w-full" pendingLabel={t("جارٍ الدخول...", "Signing in...")}>
                  <LogIn size={16} />
                  {t("دخول", "Sign in")}
                </SubmitButton>
              </form>
              {firstRun ? (
                <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600 ring-1 ring-inset ring-slate-100">
                  {t("أول تشغيل: البريد", "First run: email")} <strong>admin@bhd.local</strong> {t("وكلمة المرور", "and password")} <strong>admin123</strong>.{" "}
                  {t("غيّرها من الإعدادات بعد الدخول.", "Change it in Settings after signing in.")}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <p className="px-5 pb-6 text-center text-xs text-slate-400 sm:px-8">© {new Date().getFullYear()} BHD · Build Higher Dreams</p>
      </main>
    </div>
  );
}
