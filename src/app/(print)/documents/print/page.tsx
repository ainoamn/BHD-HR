import { OfficialDocSheet } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { requirePermission } from "@/lib/auth";
import { collectDocuments } from "@/lib/documents";
import { describeExpiry } from "@/lib/expiry";
import { getI18n } from "@/lib/lang";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";

const VIEW_IDS = ["all", "expired", "warning", "early"];

export default async function DocumentsOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; employerId?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("documents.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const view = VIEW_IDS.includes(sp.view || "") ? sp.view || "all" : "all";
  const employers = await prisma.employer.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, nameEn: true },
    orderBy: { name: "asc" },
  });
  const employerId = sp.employerId === "none" || employers.some((item) => item.id === sp.employerId) ? sp.employerId || "" : "";
  const employerFilter = employerId === "none" ? { employerId: null } : employerId ? { employerId } : {};
  const selected = employers.find((item) => item.id === employerId);
  const employerLabel = selected
    ? lang === "en" && selected.nameEn
      ? selected.nameEn
      : selected.name
    : employerId === "none"
      ? t("بدون كفيل", "No sponsor")
      : "";
  const viewLabel =
    view === "expired"
      ? t("منتهية", "Expired")
      : view === "warning"
        ? t("خلال فترة التحذير", "Within warning")
        : view === "early"
          ? t("خلال التنبيه المبكر", "Within early notice")
          : t("الكل", "All");
  const subtitle = [viewLabel, employerLabel].filter(Boolean).join(" · ");

  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" }, ...employerFilter },
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
  const back = new URLSearchParams();
  if (view !== "all") back.set("view", view);
  if (employerId) back.set("employerId", employerId);
  const backQuery = back.toString();
  const backHref = backQuery ? `/documents?${backQuery}` : "/documents";
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${backHref}`, user.name);
  const fileName = `documents-${printedAt.toISOString().slice(0, 10)}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={backHref} backLabel={t("رجوع للمستندات", "Back to documents")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="كشف مستندات الموظفين"
        titleEn="Employee documents register"
        subtitle={subtitle}
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
        seal={seal}
        orient={orient}
      />
    </div>
  );
}
