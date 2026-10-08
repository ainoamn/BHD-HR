import { redirect } from "next/navigation";
import { LangToggle } from "@/components/lang-provider";
import { getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { logout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "PENDING") redirect("/");
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-end">
          <LangToggle />
        </div>
        <span className="official-logo official-logo-mark official-logo-ink mx-auto mb-5 w-20" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900">{t("حسابك بانتظار التفعيل", "Your account is awaiting activation")}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {t(
            "تم الدخول بحساب BHD بنجاح، لكن نظام الموظفين والرواتب يحتوي بيانات سرية. اطلب من مسؤول النظام تفعيل حسابك من الإعدادات ← المستخدمون.",
            "You signed in with your BHD account, but HR & payroll data is confidential. Ask an administrator to activate you from Settings → Users.",
          )}
        </p>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800" dir="ltr">
          {user.email}
        </p>
        <form action={logout} className="mt-6">
          <button className="min-h-11 w-full rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-900">{t("خروج", "Sign out")}</button>
        </form>
      </div>
    </div>
  );
}
