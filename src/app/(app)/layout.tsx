import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { BhdAppSwitcher } from "@/components/bhd/BhdAppSwitcher";
import { CompanySwitcher } from "@/components/company-switcher";
import { SiteFooter } from "@/components/bhd/site-footer";
import { LangToggle } from "@/components/lang-provider";
import { getAlerts } from "@/lib/alerts";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { MODULES, MODULE_HREF } from "@/lib/permissions";
import { SIDEBAR_COOKIE, formatLongDate } from "@/lib/utils";
import { logout, switchCompany } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const alerts = await getAlerts();
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
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
  if (can(user, "salaries.view")) allowed.push("/pay-items");
  if (can(user, "employees.view")) allowed.push("/org");
  if (can(user, "attendance.view") || can(user, "documents.view")) allowed.push("/approvals");
  const companyName = (company: { name: string; nameEn: string | null }) => (lang === "en" && company.nameEn ? company.nameEn : company.name);

  return (
    <AppFrame
      companyName={companyName(user.company)}
      roleName={roleName}
      userName={user.name}
      dateLabel={formatLongDate(lang)}
      alertCount={alerts.length}
      urgentCount={urgent}
      allowed={allowed}
      sidebarCollapsed={sidebarCollapsed}
      banner={
        user.mustChangePassword ? (
          <div className="no-print flex items-center justify-center gap-2 bg-gold-50 px-4 py-2 text-center text-sm text-gold-700 ring-1 ring-inset ring-gold-100">
            <KeyRound size={15} className="shrink-0" />
            <span>
              {t("كلمة المرور ما زالت الافتراضية.", "You are still using the default password.")}{" "}
              <Link href="/settings" className="font-bold underline underline-offset-4">
                {t("غيّرها من الإعدادات", "Change it in Settings")}
              </Link>
            </span>
          </div>
        ) : null
      }
      headerTools={
        <>
          {user.memberships.length > 1 ? (
            <div className="hidden md:block">
              <CompanySwitcher
                action={switchCompany}
                activeId={user.companyId}
                label={t("المنشأة", "Company")}
                companies={user.memberships.map((item) => ({ id: item.companyId, name: companyName(item.company) }))}
              />
            </div>
          ) : null}
          <LangToggle />
          <BhdAppSwitcher user={{ name: user.name, email: user.email, picture: user.picture }} onSignOut={logout} locale={lang} />
        </>
      }
      footer={<SiteFooter locale={lang} />}
    >
      {user.memberships.length > 1 ? (
        <div className="no-print mb-4 md:hidden">
          <CompanySwitcher
            action={switchCompany}
            activeId={user.companyId}
            label={t("المنشأة", "Company")}
            companies={user.memberships.map((item) => ({ id: item.companyId, name: companyName(item.company) }))}
          />
        </div>
      ) : null}
      {children}
    </AppFrame>
  );
}
