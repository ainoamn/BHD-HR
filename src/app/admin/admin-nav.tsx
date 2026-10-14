"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, History, LayoutDashboard, Layers, Settings2, Users } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", ar: "نظرة عامة", en: "Overview", icon: LayoutDashboard },
  { href: "/admin/companies", ar: "الشركات", en: "Companies", icon: Building2 },
  { href: "/admin/payments", ar: "المدفوعات", en: "Payments", icon: CreditCard },
  { href: "/admin/plans", ar: "الباقات", en: "Plans", icon: Layers },
  { href: "/admin/users", ar: "المستخدمون", en: "Users", icon: Users },
  { href: "/admin/log", ar: "سجل الإدارة", en: "Admin log", icon: History },
  { href: "/admin/settings", ar: "إعدادات المنصة", en: "Platform settings", icon: Settings2 },
];

export function AdminNav({ pendingPayments }: { pendingPayments: number }) {
  const pathname = usePathname();
  const { t } = useLang();
  return (
    <nav className="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t("أقسام الإدارة", "Admin sections")}>
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
              active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon size={16} className={active ? "text-gold-300" : undefined} />
            {t(item.ar, item.en)}
            {item.href === "/admin/payments" && pendingPayments > 0 ? (
              <span className="tabular rounded-full bg-gold-400 px-1.5 text-[0.7rem] font-bold leading-5 text-ink-900">{pendingPayments}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
