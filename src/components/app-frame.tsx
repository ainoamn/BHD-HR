"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Bell,
  BookUser,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Files,
  HandCoins,
  History,
  Inbox,
  LaptopMinimal,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Menu,
  MoreHorizontal,
  Network,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  Target,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { helpHrefFor } from "@/lib/help-search";
import { SIDEBAR_COOKIE, cn } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { NavSpeed } from "./nav-speed";

type NavItem = { href: string; ar: string; en: string; icon: LucideIcon; short?: { ar: string; en: string } };

const GROUPS: { ar: string; en: string; items: NavItem[] }[] = [
  {
    ar: "عام",
    en: "General",
    items: [
      { href: "/", ar: "الرئيسية", en: "Dashboard", icon: LayoutDashboard },
      { href: "/notifications", ar: "التنبيهات", en: "Alerts", icon: Bell },
      { href: "/assistant", ar: "المساعد الذكي", en: "AI assistant", icon: Sparkles, short: { ar: "المساعد", en: "Assistant" } },
      { href: "/calendar", ar: "التقويم", en: "Calendar", icon: CalendarClock },
      { href: "/tasks", ar: "المهام", en: "Tasks", icon: ListTodo },
      { href: "/help", ar: "مركز المساعدة", en: "Help centre", icon: LifeBuoy, short: { ar: "المساعدة", en: "Help" } },
    ],
  },
  {
    ar: "الموارد البشرية",
    en: "People",
    items: [
      { href: "/employees", ar: "الموظفون", en: "Employees", icon: Users },
      { href: "/approvals", ar: "طلبات الموظفين", en: "Requests", icon: Inbox, short: { ar: "الطلبات", en: "Requests" } },
      { href: "/attendance", ar: "الحضور والغياب", en: "Attendance & leave", icon: CalendarDays, short: { ar: "الحضور", en: "Attendance" } },
      { href: "/documents", ar: "المستندات", en: "Documents", icon: Files },
      { href: "/letters", ar: "الإنذارات والخطابات", en: "Warnings & letters", icon: ScrollText, short: { ar: "الخطابات", en: "Letters" } },
      { href: "/recruitment", ar: "التوظيف", en: "Recruitment", icon: UserPlus },
      { href: "/performance", ar: "تقييم الأداء", en: "Performance", icon: Target, short: { ar: "الأداء", en: "Performance" } },
      { href: "/assets", ar: "العُهد والأصول", en: "Assets & custody", icon: LaptopMinimal, short: { ar: "العُهد", en: "Assets" } },
      { href: "/org", ar: "الهيكل التنظيمي", en: "Org chart", icon: Network },
      { href: "/employers", ar: "دفتر العناوين", en: "Address book", icon: BookUser },
    ],
  },
  {
    ar: "المالية",
    en: "Finance",
    items: [
      { href: "/salaries", ar: "الرواتب", en: "Payroll", icon: Banknote },
      { href: "/pay-items", ar: "السلف والمكافآت", en: "Advances & bonuses", icon: HandCoins, short: { ar: "السلف", en: "Advances" } },
      { href: "/expenses", ar: "المصروفات", en: "Expenses", icon: Receipt },
      { href: "/analytics", ar: "لوحة المالك", en: "Owner analytics", icon: ChartNoAxesCombined, short: { ar: "التحليلات", en: "Analytics" } },
      { href: "/reports", ar: "التقارير", en: "Reports", icon: PieChart },
    ],
  },
  {
    ar: "النظام",
    en: "System",
    items: [
      { href: "/activity", ar: "سجل العمليات", en: "Activity log", icon: History },
      { href: "/settings", ar: "الإعدادات", en: "Settings", icon: Settings },
    ],
  },
];

const ALWAYS = ["/", "/notifications", "/assistant", "/settings", "/help"];
/** Bottom bar on phones: the first four of these the user may open, then "More". */
const BOTTOM_PREFERENCE = ["/", "/assistant", "/employees", "/tasks", "/salaries", "/attendance", "/documents", "/pay-items", "/reports", "/employers", "/calendar", "/letters"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export type FrameProps = {
  companyName: string;
  roleName: string | null;
  userName: string;
  dateLabel: string;
  alertCount: number;
  urgentCount: number;
  /** Section paths the active membership can view; the server enforces the same rule. */
  allowed: string[];
  /** Desktop sidebar shown as an icon rail; read from the cookie so the first paint matches. */
  sidebarCollapsed: boolean;
  /** Company switcher, language toggle, BHD app switcher — rendered by the server layout. */
  headerTools: React.ReactNode;
  banner?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
};

export function AppFrame({
  companyName,
  roleName,
  userName,
  dateLabel,
  alertCount,
  urgentCount,
  allowed,
  sidebarCollapsed,
  headerTools,
  banner,
  footer,
  children,
}: FrameProps) {
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };
  const canSee = (href: string) => ALWAYS.includes(href) || allowed.includes(href);
  const groups = GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canSee(item.href)) })).filter((group) => group.items.length);
  const flat = groups.flatMap((group) => group.items);
  const bottom = BOTTOM_PREFERENCE.map((href) => flat.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item)).slice(0, 4);
  const current = flat.find((item) => isActive(pathname, item.href));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const hasBanner = Boolean(banner);
  const shellRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = shellRef.current;
    const element = bannerRef.current;
    if (!shell || !element) return;
    const observer = new ResizeObserver(() => shell.style.setProperty("--banner-height", `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--banner-height");
    };
  }, [hasBanner]);

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

  return (
    <div
      ref={shellRef}
      className="app-shell min-h-dvh transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:ps-[var(--sidebar-width)]"
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-banner={hasBanner ? "" : undefined}
    >
      <NavSpeed sections={flat.map((item) => item.href)} />
      <aside
        className="app-sidebar fixed inset-y-0 start-0 z-40 hidden w-[var(--sidebar-width)] transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block"
        aria-label={t("القائمة الرئيسية", "Main menu")}
      >
        <SidebarContent
          groups={groups}
          pathname={pathname}
          companyName={companyName}
          roleName={roleName}
          alertCount={alertCount}
          collapsed={collapsed}
          onToggle={toggleSidebar}
        />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="app-drawer"
        className={cn(
          "app-sidebar fixed inset-y-0 start-0 z-50 w-[min(19rem,86vw)] shadow-float transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] lg:hidden",
          open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
        )}
        aria-label={t("القائمة الرئيسية", "Main menu")}
        inert={!open}
      >
        <SidebarContent
          groups={groups}
          pathname={pathname}
          companyName={companyName}
          roleName={roleName}
          alertCount={alertCount}
          onClose={open ? () => setOpen(false) : undefined}
        />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {banner ? <div ref={bannerRef}>{banner}</div> : null}
        <header className="app-header no-print sticky top-0 z-30 border-b border-slate-200/70 bg-sand-50/85 backdrop-blur-md supports-[backdrop-filter]:bg-sand-50/70">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="app-drawer"
              aria-label={t("فتح القائمة", "Open menu")}
              className="relative -ms-1 flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
              {urgentCount > 0 ? <span className="absolute top-1.5 end-1.5 size-2.5 rounded-full bg-red-600 ring-2 ring-sand-50" /> : null}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] font-bold leading-tight text-slate-900 lg:hidden">{current ? t(current.ar, current.en) : companyName}</p>
              <p className="hidden truncate text-[0.95rem] font-semibold leading-tight text-slate-900 lg:block">
                {t("مرحباً،", "Welcome,")} {userName}
              </p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{dateLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link
                href={helpHrefFor(pathname)}
                aria-label={t("شرح هذه الصفحة", "Help for this page")}
                title={t("شرح هذه الصفحة", "Help for this page")}
                className={cn(
                  "hidden size-10 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900 sm:flex",
                  pathname.startsWith("/help") && "border-teal-200 text-teal-700",
                )}
              >
                <CircleHelp size={18} />
              </Link>
              <Link
                href="/notifications"
                prefetch
                aria-label={t(`التنبيهات (${alertCount})`, `Alerts (${alertCount})`)}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 shadow-card transition hover:border-slate-300 hover:text-slate-900",
                  pathname === "/notifications" && "border-teal-200 text-teal-700",
                )}
              >
                <Bell size={18} />
                {urgentCount > 0 ? (
                  <span className="tabular absolute -top-1.5 -end-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[0.68rem] font-bold text-white ring-2 ring-sand-50">
                    {urgentCount > 99 ? "99+" : urgentCount}
                  </span>
                ) : null}
              </Link>
              {headerTools}
            </div>
          </div>
        </header>

        <main className="w-full min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
        <div className="pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-0">{footer}</div>
      </div>

      <nav
        className="app-bottom-nav no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label={t("التنقل السريع", "Quick navigation")}
      >
        <div className="mx-auto grid h-[var(--bottom-nav-height)] max-w-xl" style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}>
          {bottom.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const label = item.short ? t(item.short.ar, item.short.en) : t(item.ar, item.en);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold transition",
                  active ? "text-teal-700" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-teal-700" aria-hidden="true" /> : null}
                <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <MoreHorizontal size={21} strokeWidth={1.8} />
            <span>{t("المزيد", "More")}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function SidebarContent({
  groups,
  pathname,
  companyName,
  roleName,
  alertCount,
  collapsed = false,
  onToggle,
  onClose,
}: {
  groups: { ar: string; en: string; items: NavItem[] }[];
  pathname: string;
  companyName: string;
  roleName: string | null;
  alertCount: number;
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLang();
  const toggleLabel = collapsed ? t("توسيع القائمة", "Expand menu") : t("طيّ القائمة", "Collapse menu");
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink-900 text-white">
      {collapsed ? null : (
        <div className="higher-horizon pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[length:22rem] bg-[position:bottom_-2rem_center] opacity-[0.05]" aria-hidden="true" />
      )}

      <div className={cn("relative flex items-center gap-3 pb-4 pt-5", collapsed ? "justify-center px-3" : "px-5")}>
        <Link href="/" className={cn("flex min-w-0 items-center gap-3 rounded-xl", !collapsed && "flex-1")} aria-label={t("الرئيسية", "Dashboard")} title={collapsed ? t("الرئيسية", "Dashboard") : undefined}>
          <span className={cn("official-logo official-logo-mark official-logo-light", collapsed ? "w-11" : "w-[3.25rem]")} aria-hidden="true" />
          {collapsed ? null : (
            <span className="min-w-0 border-s border-white/15 ps-3">
              <span className="block truncate text-[0.95rem] font-bold leading-tight">{t("الموظفون والرواتب", "HR & Payroll")}</span>
              <span className="block text-xs leading-5 text-white/60">{t("من منتجات BHD", "A BHD product")}</span>
            </span>
          )}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("إغلاق القائمة", "Close menu")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div
          className="relative mx-auto mb-3 flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-sm font-bold ring-1 ring-inset ring-white/10"
          title={roleName ? `${companyName} — ${roleName}` : companyName}
        >
          {companyName.trim().charAt(0)}
        </div>
      ) : (
        <div className="relative mx-4 mb-3 rounded-2xl bg-white/[0.06] px-3.5 py-3 ring-1 ring-inset ring-white/10">
          <p className="text-xs font-medium text-white/55">{t("المنشأة", "Company")}</p>
          <p className="truncate text-sm font-semibold leading-6">{companyName}</p>
          {roleName ? <p className="truncate text-xs text-gold-300">{roleName}</p> : null}
        </div>
      )}

      <nav className={cn("thin-scroll relative flex-1 overflow-y-auto pb-6 pt-2", collapsed ? "space-y-3 px-2" : "space-y-5 px-3")}>
        {groups.map((group, index) => (
          <div key={group.en}>
            {collapsed ? (
              <>
                <p className="sr-only">{t(group.ar, group.en)}</p>
                {index > 0 ? <div className="mx-auto mb-3 h-px w-8 bg-white/10" aria-hidden="true" /> : null}
              </>
            ) : (
              <p className="mb-1.5 px-3 text-xs font-semibold tracking-wide text-white/50 ltr:uppercase">{t(group.ar, group.en)}</p>
            )}
            <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const label = t(item.ar, item.en);
                const count = item.href === "/notifications" && alertCount > 0 ? alertCount : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "group relative flex items-center rounded-xl text-sm transition duration-150",
                        collapsed ? "mx-auto size-11 justify-center" : "min-h-10 gap-3 px-3 py-2",
                        active ? "bg-white/[0.1] font-semibold text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {active ? <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-gold-400" aria-hidden="true" /> : null}
                      <Icon size={collapsed ? 20 : 18} strokeWidth={active ? 2.1 : 1.8} className={cn("shrink-0", active ? "text-gold-300" : "text-white/50 group-hover:text-white/80")} />
                      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>
                      {count ? (
                        collapsed ? (
                          <span className="tabular absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white ring-2 ring-ink-900">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : (
                          <span className="tabular rounded-full bg-red-500/90 px-2 py-0.5 text-[0.68rem] font-bold leading-4 text-white">{count}</span>
                        )
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("relative flex items-center gap-2 border-t border-white/10 py-3", collapsed ? "justify-center px-2" : "ps-5 pe-3")}>
        {collapsed ? null : (
          <div className="min-w-0 flex-1 text-xs leading-5 text-white/50">
            <p className="truncate font-semibold text-white/60">BHD · Build Higher Dreams</p>
            <p className="truncate">{t("ابنِ أحلامًا أكبر.", "Build higher dreams.")}</p>
          </div>
        )}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            title={toggleLabel}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white/60 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            <ToggleIcon size={18} className="rtl:-scale-x-100" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

