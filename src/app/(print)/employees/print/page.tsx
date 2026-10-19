import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { can, requirePermission } from "@/lib/auth";
import { STATUS_LABEL, termText } from "@/lib/constants";
import { employeeFilterQuery, employeeWhere, readEmployeeFilter } from "@/lib/employee-filter";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { nationalityName } from "@/lib/nationalities";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { packageGross } from "@/lib/salary";
import { money } from "@/lib/utils";

export default async function EmployeesOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; employerId?: string; ids?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const filter = readEmployeeFilter(sp);
  const showSalary = can(user, "salaries.view");

  const [employees, employer] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere(user.companyId, filter),
      include: { employer: true },
      orderBy: { fullName: "asc" },
    }),
    filter.employerId && filter.employerId !== "none"
      ? prisma.employer.findFirst({ where: { id: filter.employerId, companyId: user.companyId }, select: { name: true, nameEn: true } })
      : Promise.resolve(null),
  ]);

  const filterParts: string[] = [];
  if (filter.q) filterParts.push(t(`بحث: ${filter.q}`, `Search: ${filter.q}`));
  if (filter.status !== "ALL") filterParts.push(pick(STATUS_LABEL[filter.status], lang, filter.status));
  if (filter.employerId === "none") filterParts.push(t("بدون كفيل", "No sponsor"));
  else if (employer) filterParts.push(lang === "en" && employer.nameEn ? employer.nameEn : employer.name);
  const subtitle = filterParts.length ? filterParts.join(" · ") : t("كل الموظفين", "All employees");

  const origin = await requestOrigin();
  const live = `/employees${employeeFilterQuery(filter)}`;
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${live}`, user.name);

  const columns = [
    { key: "index", ar: "#", en: "#" },
    { key: "name", ar: "الموظف", en: "Employee" },
    { key: "no", ar: "الرقم", en: "No." },
    { key: "nationality", ar: "الجنسية", en: "Nationality" },
    { key: "sponsor", ar: "الكفيل", en: "Sponsor" },
    { key: "job", ar: "الوظيفة", en: "Job" },
    ...(showSalary ? [{ key: "amount", ar: "الراتب", en: "Salary" }] : []),
    { key: "status", ar: "الحالة", en: "Status" },
  ];
  const rows: OfficialDocRow[] = employees.map((employee) => ({
    key: employee.id,
    name: lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName,
    no: employee.employeeNumber,
    nationality: nationalityName(employee.nationality, lang),
    sponsor: employee.employer ? (lang === "en" && employee.employer.nameEn ? employee.employer.nameEn : employee.employer.name) : null,
    job: termText(employee.jobTitle, employee.jobTitleEn, lang),
    amount: showSalary ? money(packageGross(employee), user.company.currency) : null,
    status: pick(STATUS_LABEL[employee.status], lang, employee.status),
  }));

  const fileName = `employees-${printedAt.toISOString().slice(0, 10)}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={live} backLabel={t("رجوع للموظفين", "Back to employees")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="كشف الموظفين"
        titleEn="Employees register"
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا يوجد موظفون في هذه التصفية.", en: "No employees in this filter." }}
        orient={orient}
      />
    </div>
  );
}
