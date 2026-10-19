import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { requirePermission } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { normalizeSearchText } from "@/lib/search";
import { money, readPeriod } from "@/lib/utils";

export default async function SalariesOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employerId?: string; q?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const { year, month } = readPeriod(sp);
  const currency = user.company.currency;
  const q = (sp.q || "").trim().slice(0, 100);
  const needle = normalizeSearchText(q);

  const employers = await prisma.employer.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, nameEn: true },
  });
  const employerId = sp.employerId === "none" || employers.some((item) => item.id === sp.employerId) ? sp.employerId || "" : "";
  const employerFilter = employerId === "none" ? { employerId: null } : employerId ? { employerId } : {};

  const salaries = await prisma.salary.findMany({
    where: { year, month, employee: { companyId: user.companyId }, ...employerFilter },
    orderBy: [{ employerName: "asc" }, { employeeName: "asc" }],
  });

  const listed = salaries.filter((salary) => {
    if (!needle) return true;
    return [salary.employeeName, salary.employeeNameEn, salary.employeeNumber, salary.employerName, salary.employerNameEn].some(
      (value) => value && normalizeSearchText(value).includes(needle),
    );
  });

  const selected = employers.find((item) => item.id === employerId);
  const scope = selected
    ? lang === "en" && selected.nameEn
      ? selected.nameEn
      : selected.name
    : employerId === "none"
      ? t("بدون صاحب عمل", "No employer")
      : t("كل أصحاب العمل", "All employers");
  const subtitle = [`${monthName(month, lang)} ${year}`, scope, q ? t(`بحث: ${q}`, `Search: ${q}`) : ""].filter(Boolean).join(" · ");

  const live = new URLSearchParams({ year: String(year), month: String(month) });
  if (employerId) live.set("employerId", employerId);
  if (q) live.set("q", q);
  const liveHref = `/salaries?${live}`;
  const origin = await requestOrigin();
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${liveHref}`, user.name);

  const columns = [
    { key: "index", ar: "#", en: "#" },
    { key: "employee", ar: "الموظف", en: "Employee" },
    { key: "no", ar: "الرقم", en: "No." },
    { key: "employer", ar: "صاحب العمل", en: "Employer" },
    { key: "basic", ar: "الأساسي", en: "Basic" },
    { key: "net", ar: "الصافي", en: "Net" },
    { key: "status", ar: "الحالة", en: "Status" },
  ];
  const rows: OfficialDocRow[] = listed.map((salary) => ({
    key: salary.id,
    employee: lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName,
    no: salary.employeeNumber,
    employer: (lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName) || null,
    basic: money(salary.basicSalary, currency),
    net: money(salary.netSalary, currency),
    status: salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid"),
  }));

  const fileName = `salaries-${year}-${String(month).padStart(2, "0")}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={liveHref} backLabel={t("رجوع للرواتب", "Back to payroll")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="كشف الرواتب"
        titleEn="Payroll register"
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا توجد رواتب لهذه الفترة.", en: "No salaries for this period." }}
        orient={orient}
      />
    </div>
  );
}
