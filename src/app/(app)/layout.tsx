import { cookies } from "next/headers";
import Link from "next/link";
import { CreditCard, KeyRound, Megaphone } from "lucide-react";
import { TranslateToggle } from "@/components/ai-translate";
import { AiWriteAssist } from "@/components/ai-write";
import { AppFrame } from "@/components/app-frame";
import { BhdPrivacyGate } from "@/components/bhd/BhdPrivacyGate";
import { BhdSessionMenu } from "@/components/bhd/BhdSessionMenu";
import { CompanySwitcher } from "@/components/company-switcher";
import { SiteFooter } from "@/components/bhd/site-footer";
import { LangToggle } from "@/components/lang-provider";
import { LiveUpdates } from "@/components/live-updates";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAlerts } from "@/lib/alerts";
import { redirect } from "next/navigation";
import { can, homePath, isStaffRole, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { MODULES, MODULE_HREF } from "@/lib/permissions";
import { platformConfig } from "@/lib/platform";
import { decidableTypes } from "@/lib/requests";
import { hasFeature } from "@/lib/subscription";
import { SIDEBAR_COOKIE, THEME_COOKIE, formatLongDate, normalizeTheme } from "@/lib/utils";
import { switchCompany } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.username && user.mustChangePassword) redirect("/password");
  if (!isStaffRole(user.role)) redirect(homePath(user));
  if (!user.access.active) redirect("/billing");
  const { lang, t } = await getI18n();
  const [alerts, config] = await Promise.all([getAlerts(), platformConfig()]);
  const jar = await cookies();
  const sidebarCollapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const theme = normalizeTheme(jar.get(THEME_COOKIE)?.value);
  const urgent = alerts.filter((item) => item.severity !== "info").length;
  const roleName =
    user.role === "ADMIN"
      ? t("مسؤول", "Admin")
      : user.role === "MANAGER"
        ? t("مدير الموارد البشرية", "HR manager")
        : user.role === "CUSTOM"
          ? t("صلاحيات مخصصة", "Custom permissions")
          : t("مستخدم — عرض فقط", "User — view only");
  const allowed = MODULES.filter((module) => can(user, `${module}.view`)).map((module) => MODULE_HREF[module]);
  if (can(user, "salaries.view")) allowed.push("/pay-items");
  if (can(user, "employees.view")) allowed.push("/org");
  if (can(user, "attendance.view") || can(user, "documents.view") || can(user, "expenses.view") || decidableTypes(user).length) allowed.push("/approvals");
  if (can(user, "reports.view")) allowed.push("/analytics");
  if (can(user, "reports.view") || can(user, "documents.view") || can(user, "employees.view")) allowed.push("/compliance");
  if (can(user, "letters.view") || can(user, "employees.view") || can(user, "attendance.view")) allowed.push("/regulations");
  if (user.role === "ADMIN") allowed.push("/billing");
  if (hasFeature(user.access, "ai")) allowed.push("/assistant");
  const companyName = (company: { name: string; nameEn: string | null }) => (lang === "en" && company.nameEn ? company.nameEn : company.name);
  const { access } = user;
  const billingLink =
    user.role === "ADMIN" ? (
      <Link href="/billing" className="font-bold underline underline-offset-4">
        {access.state === "TRIAL" ? t("اختر باقتك", "Choose your plan") : t("جدّد الاشتراك", "Renew now")}
      </Link>
    ) : null;
  const subscriptionNote =
    access.state === "TRIAL"
      ? t(`تجربتك المجانية تنتهي خلال ${access.daysLeft} يوم.`, `Your free trial ends in ${access.daysLeft} day(s).`)
      : access.state === "GRACE"
        ? t(`انتهت مدة اشتراكك. لديك ${access.daysLeft} يوم لتجديده قبل إيقاف الحساب.`, `Your subscription period has ended. You have ${access.daysLeft} day(s) to renew before the account stops.`)
        : access.state === "ACTIVE" && access.daysLeft !== null && access.daysLeft <= 7
          ? t(`ينتهي اشتراكك خلال ${access.daysLeft} يوم.`, `Your subscription ends in ${access.daysLeft} day(s).`)
          : null;
  const banners = [
    config.announcement ? (
      <div key="announcement" className="no-print flex items-center justify-center gap-2 bg-navy-50 px-4 py-2 text-center text-sm text-navy-700 ring-1 ring-inset ring-navy-100">
        <Megaphone size={15} className="shrink-0" />
        <span className="min-w-0 break-words">{config.announcement}</span>
      </div>
    ) : null,
    subscriptionNote ? (
      <div
        key="subscription"
        className={`no-print flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-sm ring-1 ring-inset ${access.state === "TRIAL" ? "bg-teal-50 text-teal-800 ring-teal-100" : "bg-amber-50 text-amber-800 ring-amber-200/70"}`}
      >
        <CreditCard size={15} className="shrink-0" />
        <span>{subscriptionNote}</span>
        {billingLink}
      </div>
    ) : null,
    user.mustChangePassword ? (
      <div key="password" className="no-print flex items-center justify-center gap-2 bg-gold-50 px-4 py-2 text-center text-sm text-gold-700 ring-1 ring-inset ring-gold-100">
        <KeyRound size={15} className="shrink-0" />
        <span>
          {t("كلمة المرور ما زالت الافتراضية.", "You are still using the default password.")}{" "}
          <Link href="/settings" className="font-bold underline underline-offset-4">
            {t("غيّرها من الإعدادات", "Change it in Settings")}
          </Link>
        </span>
      </div>
    ) : null,
  ].filter(Boolean);

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
      banner={banners.length ? <>{banners}</> : null}
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
          <TranslateToggle compact />
          <ThemeToggle initial={theme} />
          <LangToggle />
          <BhdSessionMenu
            user={{
              id: user.bhdSub ?? undefined,
              name: user.name,
              email: user.email,
              username: user.username,
              picture: user.picture,
              hasPassword: Boolean(user.password),
            }}
            platformAdmin={user.platformAdmin}
            locale={lang}
            identityLinked={Boolean(user.bhdSub)}
          />
        </>
      }
      footer={<SiteFooter locale={lang} />}
    >
      <BhdPrivacyGate productSub={user.bhdSub} productEmail={user.email} />
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
      {hasFeature(user.access, "ai") ? <AiWriteAssist /> : null}
      <LiveUpdates />
    </AppFrame>
  );
}
