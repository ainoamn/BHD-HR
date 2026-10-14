import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { LangToggle } from "@/components/lang-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getI18n } from "@/lib/lang";
import { requirePlatformAdmin } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";
import { logout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** The platform console: every company, plan and payment. Only platform admins get past the layout. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  const { t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const pendingPayments = await prisma.payment.count({ where: { provider: "MANUAL", status: "PENDING" } });
  const toolClass = "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900";

  return (
    <AdminShell
      adminName={admin.name}
      adminEmail={admin.email}
      pendingPayments={pendingPayments}
      tools={
        <>
          <ThemeToggle initial={theme} className={toolClass} />
          <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-700 shadow-card transition hover:border-slate-300 hover:text-slate-900" />
          <form action={logout}>
            <button type="submit" className={toolClass} aria-label={t("خروج", "Sign out")} title={t("خروج", "Sign out")}>
              <LogOut size={16} />
            </button>
          </form>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
