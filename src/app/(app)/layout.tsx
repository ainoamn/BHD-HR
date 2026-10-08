import Link from "next/link";
import { BhdAppSwitcher } from "@/components/bhd/BhdAppSwitcher";
import { CompanySwitcher } from "@/components/company-switcher";
import { SiteFooter } from "@/components/bhd/site-footer";
import { LangToggle } from "@/components/lang-provider";
import { SideNav } from "@/components/side-nav";
import { getAlerts } from "@/lib/alerts";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { MODULES, MODULE_HREF } from "@/lib/permissions";
import { formatLongDate } from "@/lib/utils";
import { logout, switchCompany } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const alerts = await getAlerts();
  const urgent = alerts.filter((item) => item.severity !== "info").length;
  const roleName =
    user.role === "ADMIN"
      ? t("مسؤول", "Admin")
      : user.role === "MANAGER"
        ? t("مدير", "Manager")
        : user.role === "CUSTOM"
          ? t("صلاحيات مخصصة", "Custom permissions")
          : t("مستخدم — عرض فقط", "User — view only");
  const allowed = MODULES.filter((module) => can(user, `${module}.view`)).map((module) => MODULE_HREF[module]);

  return (
    <div className="app-shell min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <SideNav companyName={lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name} alertCount={alerts.length} allowed={allowed} />
      <div className="flex min-h-screen min-w-0 flex-col">
        {user.mustChangePassword ? (
          <div className="no-print bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
            {t("كلمة المرور ما زالت الافتراضية.", "You are still using the default password.")}{" "}
            <Link href="/settings" className="font-bold underline">
              {t("غيّرها من الإعدادات", "Change it in Settings")}
            </Link>
          </div>
        ) : null}
        <header className="app-header no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 md:px-8 md:py-3">
          <div className="min-w-0">
            <p className="hidden text-xs text-slate-500 sm:block">{formatLongDate(lang)}</p>
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {t("مرحباً،", "Welcome,")} {user.name}
            </p>
            {user.memberships.length > 1 ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <CompanySwitcher
                  action={switchCompany}
                  activeId={user.companyId}
                  label={t("المنشأة", "Company")}
                  companies={user.memberships.map((item) => ({
                    id: item.companyId,
                    name: lang === "en" && item.company.nameEn ? item.company.nameEn : item.company.name,
                  }))}
                />
                <span>{roleName}</span>
              </div>
            ) : user.role !== "ADMIN" ? (
              <p className="text-xs text-slate-500">{roleName}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LangToggle />
            <Link href="/notifications" className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              {t("التنبيهات", "Alerts")}
              {urgent > 0 ? <span className="ms-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{urgent}</span> : null}
            </Link>
            <BhdAppSwitcher user={{ name: user.name, email: user.email, picture: user.picture }} onSignOut={logout} locale={lang} />
          </div>
        </header>
        <main className="flex-1 px-3 py-5 sm:px-4 md:px-8 md:py-8">{children}</main>
        <SiteFooter locale={lang} />
      </div>
    </div>
  );
}
