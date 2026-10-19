import Link from "next/link";
import { OfficialDocSheet } from "@/components/official-doc-sheet";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { qrSvg } from "@/lib/badge";
import { collectDocuments } from "@/lib/documents";
import { describeExpiry } from "@/lib/expiry";
import { getI18n } from "@/lib/lang";
import { inlineLogo } from "@/lib/inline-logo";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";

const VIEW_IDS = ["all", "expired", "warning", "early"];

export default async function DocumentsOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("documents.view");
  const { lang, t } = await getI18n();
  const view = VIEW_IDS.includes(sp.view || "") ? sp.view || "all" : "all";
  const viewLabel =
    view === "expired"
      ? t("منتهية", "Expired")
      : view === "warning"
        ? t("خلال فترة التحذير", "Within warning")
        : view === "early"
          ? t("خلال التنبيه المبكر", "Within early notice")
          : t("الكل", "All");

  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" } },
    include: { documents: true, employer: true },
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

  const origin = await requestOrigin();
  const pageUrl = `${origin}/documents${view !== "all" ? `?view=${view}` : ""}`;
  const logo = (await inlineLogo(user.company.logoUrl, user.companyId)) || user.company.logoUrl;
  const qr = await qrSvg(pageUrl, logo);
  const printedAt = new Date();
  const serial = `DOC-${printedAt.getUTCFullYear()}-${String(printedAt.getUTCMonth() + 1).padStart(2, "0")}${String(printedAt.getUTCDate()).padStart(2, "0")}-${String(rows.length).padStart(4, "0")}`;
  const header = headerFor({}, user.company);
  if (logo) header.logoUrl = logo;

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/documents${view !== "all" ? `?view=${view}` : ""}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للمستندات", "Back to documents")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>
      <OfficialDocSheet
        header={header}
        titleAr="كشف مستندات الموظفين"
        titleEn="Employee documents register"
        subtitle={viewLabel}
        printedAt={printedAt}
        emptyText={{ ar: "لا توجد مستندات في هذه التصفية.", en: "No documents in this filter." }}
        columns={[
          { key: "index", ar: "#", en: "#" },
          { key: "employeeName", ar: "الموظف", en: "Employee" },
          { key: "employeeNumber", ar: "الرقم", en: "No." },
          { key: "label", ar: "المستند", en: "Document" },
          { key: "number", ar: "رقم المستند", en: "Doc no." },
          { key: "expiry", ar: "الانتهاء", en: "Expiry" },
          { key: "status", ar: "الحالة", en: "Status" },
        ]}
        rows={rows.map((row) => {
          const employee = employees.find((item) => item.id === row.employeeId);
          const name = lang === "en" && employee?.nameEn ? employee.nameEn : row.employeeName;
          return {
            key: row.key,
            employeeName: name,
            employeeNumber: row.employeeNumber,
            label: row.label,
            number: row.number,
            expiry: formatDate(row.expiry),
            status: row.status.label,
          };
        })}
        seal={{
          qr,
          url: pageUrl,
          signedBy: user.name,
          signedAt: printedAt,
          serial,
        }}
      />
    </div>
  );
}
