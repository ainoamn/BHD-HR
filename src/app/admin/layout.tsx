import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, LogOut } from "lucide-react";
import { LangToggle } from "@/components/lang-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getI18n } from "@/lib/lang";
import { requirePlatformAdmin } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";
import { cookies } from "next/headers";
import { logout } from "@/server/auth-actions";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** The platform console: every company, plan and payment. Only platform admins get past the layout. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const pendingPayments = await prisma.payment.count({ where: { provider: "MANUAL", status: "PENDING" } });
  const toolClass = "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20";

  return (
    <div className="min-h-dvh bg-sand-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-ink-950 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-10 end-0 h-40 w-80 bg-[length:100%] opacity-[0.08]" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="official-logo official-logo-mark official-logo-light w-10 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-bold">
                <Crown size={16} className="shrink-0 text-gold-300" />
                {t("إدارة المنصة", "Platform admin")}
              </p>
              <p className="truncate text-xs text-white/60">{admin.email}</p>
            </div>
            <Link href="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/20">
              <ArrowRight size={15} className="ltr:rotate-180" />
              <span className="hidden sm:inline">{t("النظام", "The app")}</span>
            </Link>
            <ThemeToggle initial={theme} className={toolClass} />
            <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            <form action={logout}>
              <button type="submit" className={toolClass} aria-label={t("خروج", "Sign out")} title={t("خروج", "Sign out")}>
                <LogOut size={16} />
              </button>
            </form>
          </div>
          <div className="mt-4 pb-3">
            <AdminNav pendingPayments={pendingPayments} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
