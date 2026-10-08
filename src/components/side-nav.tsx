"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, Bell, BookUser, CalendarClock, CalendarDays, Files, History, LayoutDashboard, Menu, PieChart, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./lang-provider";

const items = [
  { href: "/", ar: "الرئيسية", en: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", ar: "الموظفون", en: "Employees", icon: Users },
  { href: "/employers", ar: "دفتر العناوين", en: "Address book", icon: BookUser },
  { href: "/attendance", ar: "الحضور والغياب", en: "Attendance & leave", icon: CalendarDays },
  { href: "/salaries", ar: "الرواتب", en: "Payroll", icon: Banknote },
  { href: "/documents", ar: "المستندات", en: "Documents", icon: Files },
  { href: "/calendar", ar: "التقويم", en: "Calendar", icon: CalendarClock },
  { href: "/notifications", ar: "التنبيهات", en: "Alerts", icon: Bell },
  { href: "/reports", ar: "التقارير", en: "Reports", icon: PieChart },
  { href: "/activity", ar: "سجل العمليات", en: "Activity log", icon: History },
  { href: "/settings", ar: "الإعدادات", en: "Settings", icon: Settings },
];

export function SideNav({ companyName, alertCount }: { companyName: string; alertCount: number }) {
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <aside className="app-sidebar sticky top-0 z-30 border-b border-slate-200 bg-white lg:static lg:min-h-screen lg:border-b-0 lg:border-e">
      <div className="flex items-center gap-3 px-4 py-3 lg:py-4">
        <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-1.5 lg:h-11 lg:w-14">
          <span className="official-logo official-logo-mark official-logo-ink w-full" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{companyName}</p>
          <p className="text-xs text-slate-500">{t("الموظفون والرواتب", "Employees & payroll")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={t("القائمة", "Menu")}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
          {!open && alertCount > 0 ? <span className="absolute -top-1 -end-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-white" /> : null}
        </button>
      </div>
      <nav
        className={cn(
          "max-h-[calc(100dvh-4rem)] gap-1 overflow-y-auto px-3 pb-3 lg:flex lg:max-h-none lg:flex-col lg:overflow-visible",
          open ? "grid grid-cols-2 sm:grid-cols-3" : "hidden",
        )}
      >
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                active ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{t(item.ar, item.en)}</span>
              {item.href === "/notifications" && alertCount > 0 ? (
                <span className={cn("ms-auto rounded-full px-2 py-0.5 text-xs", active ? "bg-white/20" : "bg-red-100 text-red-700")}>{alertCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
