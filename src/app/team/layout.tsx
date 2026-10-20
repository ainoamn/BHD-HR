import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound, LifeBuoy, LogOut, UserRound, Users } from "lucide-react";
import { TranslateToggle } from "@/components/ai-translate";
import { AiWriteAssist } from "@/components/ai-write";
import { BhdSessionMenu } from "@/components/bhd/BhdSessionMenu";
import { CompanySwitcher } from "@/components/company-switcher";
import { LangToggle } from "@/components/lang-provider";
import { LiveUpdates } from "@/components/live-updates";
import { ThemeToggle } from "@/components/theme-toggle";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { hasFeature } from "@/lib/subscription";
import { ACCOUNT_ROLE_LABEL, requireTeam } from "@/lib/team";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";
import { logout, switchCompany } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

const pill = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireTeam();
  const { lang, t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const companyName = (company: { name: string; nameEn: string | null }) => (lang === "en" && company.nameEn ? company.nameEn : company.name);

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="page-wide relative flex flex-wrap items-start justify-between gap-3 px-4 pb-5 pt-5 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/70">{companyName(user.company)}</p>
            <h1 className="break-words text-xl font-bold leading-tight">{user.name}</h1>
            <p className="mt-0.5 text-xs text-white/70">{pick(ACCOUNT_ROLE_LABEL[user.role], lang)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TranslateToggle tone="dark" compact />
            <ThemeToggle initial={theme} className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            {user.username && !user.bhdSub ? (
              <Link href="/password" className={pill} title={t("تغيير كلمة المرور", "Change password")}>
                <KeyRound size={15} />
                <span className="hidden sm:inline">{t("كلمة المرور", "Password")}</span>
              </Link>
            ) : null}
            {user.bhdSub ? (
              <BhdSessionMenu
                user={{ id: user.bhdSub, name: user.name, email: user.email, picture: user.picture }}
                locale={lang}
                identityLinked
              />
            ) : (
              <form action={logout}>
                <button type="submit" className={pill}>
                  <LogOut size={15} />
                  {t("خروج", "Sign out")}
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-surface/90 backdrop-blur-md" aria-label={t("التنقل", "Navigation")}>
        <div className="page-wide flex flex-wrap items-center gap-1 px-3 py-2 sm:px-5">
          <Link href="/team" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800">
            <Users size={16} />
            {user.role === "EMPLOYER" ? t("عمّالي", "My workers") : t("فريقي", "My team")}
          </Link>
          {user.employeeId ? (
            <Link href="/me" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800">
              <UserRound size={16} />
              {t("صفحتي", "My page")}
            </Link>
          ) : null}
          <Link href="/team/help" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800">
            <LifeBuoy size={16} />
            {t("المساعدة", "Help")}
          </Link>
          {user.memberships.length > 1 ? (
            <div className="ms-auto">
              <CompanySwitcher
                action={switchCompany}
                activeId={user.companyId}
                label={t("المنشأة", "Company")}
                companies={user.memberships.map((item) => ({ id: item.companyId, name: companyName(item.company) }))}
              />
            </div>
          ) : null}
        </div>
      </nav>
      <main className="page-wide px-4 py-5 sm:px-6">{children}</main>
      {hasFeature(user.access, "ai") ? <AiWriteAssist /> : null}
      <LiveUpdates />
    </div>
  );
}
