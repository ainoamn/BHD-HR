import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function ActivityPage() {
  const user = await requireUser();
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
        title={t("سجل العمليات", "Activity log")}
        description={t("من أضاف موظفاً، ومن عدّل راتباً، ومن صرف إيصالاً.", "Who added an employee, changed a salary, or paid a receipt.")}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {logs.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{t("لا توجد عمليات بعد.", "No activity yet.")}</p> : null}
        {logs.map((log) => (
          <div key={log.id} className="grid gap-1 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[160px_140px_1fr]">
            <p className="text-slate-500">{formatDateTime(log.createdAt)}</p>
            <p className="font-semibold">{log.user?.name || t("النظام", "System")}</p>
            <p>
              {log.message}
              {log.employee ? (
                <>
                  {" "}
                  <Link href={`/employees/${log.employeeId}`} className="font-semibold text-teal-800">
                    {t("فتح الملف", "Open profile")}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
