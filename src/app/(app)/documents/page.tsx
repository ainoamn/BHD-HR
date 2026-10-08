import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageHeader, ToneBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { collectDocuments } from "@/lib/documents";
import { describeExpiry } from "@/lib/expiry";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, text } from "@/lib/utils";

const VIEW_IDS = ["all", "expired", "warning", "early"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const views = [
    { id: "all", label: t("الكل", "All") },
    { id: "expired", label: t("منتهية", "Expired") },
    { id: "warning", label: t("خلال فترة التحذير", "Within warning period") },
    { id: "early", label: t("خلال التنبيه المبكر", "Within early notice") },
  ];
  const view = VIEW_IDS.includes(sp.view || "") ? sp.view || "all" : "all";
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" } },
    include: { documents: true },
    orderBy: { fullName: "asc" },
  });
  const rows = collectDocuments(employees, lang)
    .map((row) => ({ ...row, status: describeExpiry(row.expiry, limits, lang) }))
    .filter((row) => {
      if (view === "expired") return row.status.key === "expired" || row.status.key === "today";
      if (view === "warning") return ["expired", "today", "urgent", "warning"].includes(row.status.key);
      if (view === "early") return row.status.key !== "ok" && row.status.key !== "none";
      return true;
    })
    .sort((a, b) => a.status.days - b.status.days);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("المستندات", "Documents")}
        description={t("البطاقة والجواز والإقامة وبقية الوثائق، مع حالة الانتهاء.", "ID card, passport, residence and other documents, with expiry status.")}
      />
      <Flash error={sp.error} message={sp.message} />
      <div className="mb-4 flex flex-wrap gap-2">
        {views.map((item) => (
          <Link
            key={item.id}
            href={`/documents?view=${item.id}`}
            className={item.id === view ? "rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white" : "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-3 text-start">{t("المستند", "Document")}</th>
              <th className="px-4 py-3 text-start">{t("الرقم", "Number")}</th>
              <th className="px-4 py-3 text-start">{t("الانتهاء", "Expiry")}</th>
              <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/employees/${row.employeeId}?tab=docs`} className="font-semibold hover:text-teal-800">
                    {row.employeeName}
                  </Link>
                  <div className="text-xs text-slate-500">{row.employeeNumber}</div>
                </td>
                <td className="px-4 py-3">
                  {row.label}
                  {row.fileUrl ? (
                    <a href={row.fileUrl} target="_blank" className="ms-2 text-xs font-semibold text-teal-800">
                      {t("ملف", "File")}
                    </a>
                  ) : null}
                </td>
                <td className="px-4 py-3">{text(row.number)}</td>
                <td className="px-4 py-3">{formatDate(row.expiry)}</td>
                <td className="px-4 py-3">
                  <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{t("لا توجد مستندات في هذا العرض.", "No documents in this view.")}</p> : null}
      </div>
    </div>
  );
}
