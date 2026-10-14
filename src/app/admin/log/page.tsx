import Link from "next/link";
import { History } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function AdminLog() {
  const { t } = await getI18n();
  const logs = await prisma.platformLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const companies = await prisma.company.findMany({ where: { id: { in: [...new Set(logs.map((log) => log.companyId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true } });
  const nameOf = new Map(companies.map((company) => [company.id, company.name]));

  return (
    <div className="space-y-5">
      <PageHeader icon={History} title={t("سجل الإدارة", "Admin log")} description={t("كل ما فعله مديرو المنصة وطلبات الدفع الواردة، مع عنوان IP.", "Everything platform admins did and incoming payment requests, with IP address.")} />
      {logs.length ? (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="break-words font-medium text-slate-800">{log.message}</p>
                  <p className="text-xs text-slate-500">
                    <span dir="ltr">{log.action}</span> · {log.userName || "—"}
                    {log.companyId ? (
                      <>
                        {" · "}
                        <Link href={`/admin/companies/${log.companyId}`} className="font-semibold text-teal-700 hover:underline">
                          {nameOf.get(log.companyId) || t("شركة محذوفة", "Deleted company")}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-slate-500" dir="ltr">
                  {log.ip ? `${log.ip} · ` : ""}
                  {formatDateTime(log.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={History} title={t("السجل فارغ", "The log is empty")} text={t("ستظهر هنا إجراءات الإدارة.", "Admin actions appear here.")} />
      )}
    </div>
  );
}
