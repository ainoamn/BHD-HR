"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, ArrowRight, Building2, CreditCard, Crown, History, LayoutDashboard, Layers, Menu, Search, Settings2, Users, X } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { cn } from "@/lib/utils";

type Item = { href: string; ar: string; en: string; icon: LucideIcon; badge?: "payments" };

const GROUPS: { ar: string; en: string; items: Item[] }[] = [
  { ar: "لوحة القيادة", en: "Dashboard", items: [{ href: "/admin", ar: "نظرة عامة", en: "Overview", icon: LayoutDashboard }] },
  {
    ar: "العملاء",
    en: "Customers",
    items: [
      { href: "/admin/companies", ar: "الشركات", en: "Companies", icon: Building2 },
      { href: "/admin/users", ar: "المستخدمون", en: "Users", icon: Users },
    ],
  },
  {
    ar: "الإيرادات",
    en: "Revenue",
    items: [
      { href: "/admin/payments", ar: "المدفوعات", en: "Payments", icon: CreditCard, badge: "payments" },
      { href: "/admin/plans", ar: "الباقات", en: "Plans", icon: Layers },
    ],
  },
  {
    ar: "النظام",
    en: "System",
    items: [
      { href: "/admin/settings", ar: "إعدادات المنصة", en: "Platform settings", icon: Settings2 },
      { href: "/admin/log", ar: "سجل الإدارة", en: "Admin log", icon: History },
      { href: "/settings/system", ar: "صحة النظام", en: "System health", icon: Activity },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The platform console frame: dark sidebar on desktop, a drawer on phones, search and tools on top. */
export function AdminShell({ adminName, adminEmail, pendingPayments, tools, children }: { adminName: string; adminEmail: string; pendingPayments: number; tools: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const current = GROUPS.flatMap((group) => group.items).find((item) => isActive(pathname, item.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sidebar = (onClose?: () => void) => (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink-900 text-white">
      <div className="higher-horizon pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[length:22rem] bg-[position:bottom_-2rem_center] opacity-[0.05]" aria-hidden="true" />
      <div className="relative flex items-center gap-3 px-5 pb-4 pt-5">
        <Link href="/admin" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl">
          <span className="official-logo official-logo-mark official-logo-light w-[3.25rem]" aria-hidden="true" />
          <span className="min-w-0 border-s border-white/15 ps-3">
            <span className="flex items-center gap-1.5 truncate text-[0.95rem] font-bold leading-tight">
              <Crown size={15} className="shrink-0 text-gold-300" />
              {t("إدارة المنصة", "Platform admin")}
            </span>
            <span className="block truncate text-xs leading-5 text-white/60">{t("الموظفون والرواتب", "HR & Payroll")}</span>
          </span>
        </Link>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label={t("إغلاق القائمة", "Close menu")} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        ) : null}
      </div>

      <div className="relative mx-4 mb-3 rounded-2xl bg-white/[0.06] px-3.5 py-3 ring-1 ring-inset ring-white/10">
        <p className="truncate text-sm font-semibold leading-6">{adminName}</p>
        <p className="truncate text-xs text-white/55" dir="ltr">
          {adminEmail}
        </p>
      </div>

      <nav className="thin-scroll relative flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2" aria-label={t("أقسام الإدارة", "Admin sections")}>
        {GROUPS.map((group) => (
          <div key={group.en}>
            <p className="mb-1.5 px-3 text-xs font-semibold tracking-wide text-white/50 ltr:uppercase">{t(group.ar, group.en)}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const count = item.badge === "payments" ? pendingPayments : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm transition duration-150",
                        active ? "bg-white/[0.1] font-semibold text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {active ? <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-gold-400" aria-hidden="true" /> : null}
                      <Icon size={18} strokeWidth={active ? 2.1 : 1.8} className={cn("shrink-0", active ? "text-gold-300" : "text-white/50 group-hover:text-white/80")} />
                      <span className="min-w-0 flex-1 truncate">{t(item.ar, item.en)}</span>
                      {count ? (
                        <span className="tabular rounded-full bg-gold-400 px-2 py-0.5 text-[0.68rem] font-bold leading-4 text-ink-900" title={t("تحويلات بانتظار التأكيد", "Transfers awaiting confirmation")}>
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/10 p-3">
        <Link href="/" className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white">
          <ArrowRight size={17} className="shrink-0 ltr:rotate-180" />
          {t("العودة إلى النظام", "Back to the app")}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-sand-50 lg:ps-[17rem]">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[17rem] lg:block" aria-label={t("قائمة الإدارة", "Admin menu")}>
        {sidebar()}
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-sand-50/85 backdrop-blur-md supports-[backdrop-filter]:bg-sand-50/70">
          <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="admin-drawer"
              aria-label={t("فتح القائمة", "Open menu")}
              className="relative -ms-1 flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
              {pendingPayments ? <span className="absolute top-1.5 end-1.5 size-2.5 rounded-full bg-gold-400 ring-2 ring-sand-50" /> : null}
            </button>
            <p className="min-w-0 flex-1 truncate text-[0.95rem] font-bold text-slate-900 md:hidden">{current ? t(current.ar, current.en) : t("إدارة المنصة", "Platform admin")}</p>
            <form action="/admin/search" className="relative hidden min-w-0 max-w-md flex-1 md:block" role="search">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                type="search"
                className="h-10 w-full rounded-xl border border-slate-200 bg-surface ps-9 pe-3 text-sm text-slate-900 shadow-card outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                placeholder={t("ابحث عن شركة، مستخدم، إيصال…", "Find a company, user, receipt…")}
                aria-label={t("بحث في المنصة", "Search the platform")}
              />
            </form>
            <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link href="/admin/search" aria-label={t("بحث", "Search")} className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card md:hidden">
                <Search size={17} />
              </Link>
              {tools}
            </div>
          </div>
        </header>
        <main className="w-full min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <div className={cn("fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside
        id="admin-drawer"
        className={cn(
          "fixed inset-y-0 start-0 z-50 w-[min(19rem,86vw)] shadow-float transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] lg:hidden",
          open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
        )}
        aria-label={t("قائمة الإدارة", "Admin menu")}
        inert={!open}
      >
        {sidebar(() => setOpen(false))}
      </aside>
    </div>
  );
}
