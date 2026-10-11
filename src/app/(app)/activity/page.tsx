import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState, PageHeader, linkAction } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function ActivityPage() {
  const user = await requirePermission("activity.view");
  const { t } = await getI18n();
  const logs = await prisma.auditLog.findMany({
    where: { companyId: user.companyId },
    include: { user: true, employee: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={History}
        title={t("سجل العمليات", "Activity log")}
        description={t("من أضاف موظفاً، ومن عدّل راتباً، ومن صرف إيصالاً.", "Who added an employee, changed a salary, or paid a receipt.")}
      />
      {logs.length === 0 ? (
        <EmptyState icon={History} title={t("لا توجد عمليات بعد", "No activity yet")} text={t("تظهر هنا كل عملية إضافة أو تعديل أو صرف.", "Every addition, change and payment appears here.")} />
      ) : (
        <ol className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-6">
          {logs.map((log) => {
            const actor = log.user?.name || t("النظام", "System");
            return (
              <li key={log.id} className="relative flex gap-3 pb-5 last:pb-0 sm:gap-4">
                <span className="absolute top-10 bottom-0 start-[1.1rem] w-px bg-slate-200 [li:last-child_&]:hidden" aria-hidden="true" />
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800 ring-4 ring-white">
                  {actor.trim().slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-semibold text-slate-900">{actor}</p>
                    <time className="tabular text-xs text-slate-500" dateTime={log.createdAt.toISOString()}>
                      {formatDateTime(log.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 break-words text-sm leading-6 text-slate-600">
                    {log.message}
                    {log.employee ? (
                      <>
                        {" "}
                        <Link href={`/employees/${log.employeeId}`} className={linkAction}>
                          {t("فتح الملف", "Open profile")}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
