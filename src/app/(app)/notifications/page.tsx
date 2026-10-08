import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeader, ToneBadge, secondaryBtn } from "@/components/ui";
import { getAlerts } from "@/lib/alerts";
import { getI18n } from "@/lib/lang";

export default async function NotificationsPage() {
  const alerts = await getAlerts();
  const { t } = await getI18n();
  const groups = [
    { key: "danger" as const, title: t("عاجل: منتهٍ أو متأخر أو تجاوز الإجازة", "Urgent: expired, overdue or leave exceeded"), tone: "red", badge: t("عاجل", "Urgent") },
    { key: "warning" as const, title: t("قريب: مستندات وتذكيرات ورواتب وغياب", "Soon: documents, reminders, payroll & absence"), tone: "orange", badge: t("تنبيه", "Notice") },
    { key: "info" as const, title: t("للمتابعة: تنبيه مبكر وأعياد ميلاد ورواتب غير مصروفة", "Follow up: early notices, birthdays & unpaid salaries"), tone: "sky", badge: t("متابعة", "Follow up") },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
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
      {alerts.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">{t("لا توجد تنبيهات حالياً.", "No alerts right now.")}</p>
      ) : null}
      <div className="space-y-6">
        {groups.map((group) => {
          const items = alerts.filter((item) => item.severity === group.key);
          if (!items.length) return null;
          return (
            <section key={group.key}>
              <h2 className="mb-3 font-bold">{group.title}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={
                      group.key === "danger"
                        ? "flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 hover:border-red-300"
                        : "flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-teal-200"
                    }
                  >
                    <div className="min-w-0">
                      <p className={group.key === "danger" ? "font-semibold text-red-800" : "font-semibold"}>{item.title}</p>
                      <p className={group.key === "danger" ? "break-words text-sm text-red-700" : "break-words text-sm text-slate-500"}>{item.message}</p>
                    </div>
                    <ToneBadge tone={group.tone}>{group.badge}</ToneBadge>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
