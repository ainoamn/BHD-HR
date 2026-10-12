import Link from "next/link";
import { Bell, BellOff, CalendarClock, CircleAlert, Clock, Info } from "lucide-react";
import { EmptyState, PageHeader, ToneBadge, secondaryBtn } from "@/components/ui";
import { getAlerts } from "@/lib/alerts";
import { getI18n } from "@/lib/lang";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const alerts = await getAlerts();
  const { t } = await getI18n();
  const groups = [
    {
      key: "danger" as const,
      title: t("عاجل: منتهٍ أو متأخر أو تجاوز الإجازة", "Urgent: expired, overdue or leave exceeded"),
      tone: "red",
      badge: t("عاجل", "Urgent"),
      icon: CircleAlert,
      iconClass: "bg-red-50 text-red-600 ring-red-100",
    },
    {
      key: "warning" as const,
      title: t("قريب: مستندات وتذكيرات ورواتب وغياب", "Soon: documents, reminders, payroll & absence"),
      tone: "orange",
      badge: t("تنبيه", "Notice"),
      icon: Clock,
      iconClass: "bg-orange-50 text-orange-600 ring-orange-100",
    },
    {
      key: "info" as const,
      title: t("للمتابعة: تنبيه مبكر وأعياد ميلاد ورواتب غير مصروفة", "Follow up: early notices, birthdays & unpaid salaries"),
      tone: "sky",
      badge: t("متابعة", "Follow up"),
      icon: Info,
      iconClass: "bg-navy-50 text-navy-500 ring-navy-100",
    },
  ];
  return (
    <div className="page-wide">
      <PageHeader
        icon={Bell}
        title={t("التنبيهات", "Alerts")}
        description={t(
          "تُحسب تلقائياً من تواريخ المستندات والعقود، وأرصدة الإجازات، والتذكيرات، وأعياد الميلاد، والغياب المسجّل هذا الشهر، واستحقاق الرواتب.",
          "Calculated automatically from document and contract dates, leave balances, reminders, birthdays, this month's absence and pay days.",
        )}
      >
        <Link href="/calendar" className={secondaryBtn}>
          <CalendarClock size={16} />
          {t("عرض التقويم", "Open calendar")}
        </Link>
      </PageHeader>
      {alerts.length === 0 ? <EmptyState icon={BellOff} title={t("لا توجد تنبيهات", "No alerts")} text={t("كل شيء على ما يرام حالياً.", "Everything is in order right now.")} /> : null}
      <div className="space-y-8">
        {groups.map((group) => {
          const items = alerts.filter((item) => item.severity === group.key);
          if (!items.length) return null;
          const Icon = group.icon;
          return (
            <section key={group.key}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-bold text-slate-900">{group.title}</h2>
                <span className="tabular rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{items.length}</span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
                {items.map((item) => (
                  <li key={item.id} className="border-t border-slate-100 first:border-t-0">
                    <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:gap-4">
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", group.iconClass)}>
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block font-semibold", group.key === "danger" ? "text-red-800" : "text-slate-900")}>{item.title}</span>
                        <span className="block break-words text-sm leading-6 text-slate-500">{item.message}</span>
                      </span>
                      <ToneBadge tone={group.tone} className="hidden sm:inline-flex">
                        {group.badge}
                      </ToneBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
