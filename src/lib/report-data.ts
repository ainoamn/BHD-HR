import { can, type SessionUser } from "./auth";
import { PAYMENT_LABEL, STATUS_LABEL, localizeTerm, monthName } from "./constants";
import { collectDocuments } from "./documents";
import { describeExpiry } from "./expiry";
import { pick, type Lang } from "./i18n";
import { salaryDayWeight } from "./leave";
import { prisma } from "./prisma";
import { packageGross } from "./salary";
import { monthRange, round3 } from "./utils";

/**
 * One monthly report for the page, the Excel file and the PDF. Each section is filled only when the
 * member may view that module, so an export never carries more than the screen shows.
 */
export async function buildMonthlyReport(user: SessionUser, year: number, month: number, lang: Lang) {
  const show = {
    employees: can(user, "employees.view"),
    salaries: can(user, "salaries.view"),
    attendance: can(user, "attendance.view"),
    documents: can(user, "documents.view"),
  };
  const { start, end } = monthRange(year, month);
  const limits = { urgent: user.company.alertUrgentDays, warning: user.company.alertWarningDays, early: user.company.alertEarlyDays };
  const [employees, salaries, attendance] = await Promise.all([
    prisma.employee.findMany({ where: { companyId: user.companyId }, include: { documents: true, employer: true }, orderBy: { fullName: "asc" } }),
    show.salaries
      ? prisma.salary.findMany({ where: { year, month, companyId: user.companyId }, orderBy: [{ employerName: "asc" }, { employeeName: "asc" }] })
      : Promise.resolve([]),
    show.attendance ? prisma.attendance.findMany({ where: { date: { gte: start, lt: end }, employee: { companyId: user.companyId } } }) : Promise.resolve([]),
  ]);
  const nameOf = (row: { fullName: string; nameEn: string | null }) => (lang === "en" && row.nameEn ? row.nameEn : row.fullName);

  const statusCounts = Object.keys(STATUS_LABEL).map((status) => ({
    status,
    label: pick(STATUS_LABEL[status], lang),
    count: employees.filter((employee) => employee.status === status).length,
  }));

  const payroll = salaries.map((salary) => ({
    id: salary.id,
    employeeNumber: salary.employeeNumber,
    name: lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName,
    employer: (lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName) || "",
    basic: salary.basicSalary,
    allowances: round3(salary.housingAllowance + salary.transportAllowance + salary.otherAllowance),
    gross: packageGross(salary),
    absenceDays: salary.absenceDays,
    absenceDeduction: salary.absenceDeduction,
    otherDeduction: salary.otherDeduction,
    net: salary.netSalary,
    paid: salary.paid,
    paidAt: salary.paidAt,
    method: salary.paymentMethod ? pick(PAYMENT_LABEL[salary.paymentMethod], lang, salary.paymentMethod) : "",
    receiptNo: salary.receiptNo || "",
  }));
  const totals = {
    gross: round3(payroll.reduce((sum, row) => sum + row.gross, 0)),
    deductions: round3(payroll.reduce((sum, row) => sum + row.absenceDeduction + row.otherDeduction, 0)),
    net: round3(payroll.reduce((sum, row) => sum + row.net, 0)),
    paid: payroll.filter((row) => row.paid).length,
    unpaid: payroll.filter((row) => !row.paid).length,
  };

  const absence = show.attendance
    ? employees
        .map((employee) => {
          const rows = attendance.filter((row) => row.employeeId === employee.id);
          const salary = salaries.find((row) => row.employeeId === employee.id);
          return {
            id: employee.id,
            employeeNumber: employee.employeeNumber,
            name: nameOf(employee),
            days: round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0)),
            deduction: show.salaries ? salary?.absenceDeduction || 0 : null,
          };
        })
        .filter((row) => row.days > 0)
    : [];

  const documents = show.documents
    ? collectDocuments(
        employees.filter((employee) => employee.status !== "TERMINATED"),
        lang,
      )
        .map((row) => ({ ...row, employeeName: nameOf(employees.find((employee) => employee.id === row.employeeId)!), status: describeExpiry(row.expiry, limits, lang) }))
        .sort((a, b) => a.status.days - b.status.days)
    : [];

  const staff = show.employees
    ? employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: nameOf(employee),
        nationality: localizeTerm(employee.nationality, lang) || "",
        jobTitle: localizeTerm(employee.jobTitle, lang) || "",
        employer: employee.employer ? (lang === "en" && employee.employer.nameEn ? employee.employer.nameEn : employee.employer.name) : "",
        status: pick(STATUS_LABEL[employee.status], lang, employee.status),
        joiningDate: employee.joiningDate,
        phone: employee.phone || "",
        gross: show.salaries ? packageGross(employee) : null,
      }))
    : [];

  return {
    show,
    year,
    month,
    title: `${monthName(month, lang)} ${year}`,
    company: lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name,
    currency: user.company.currency,
    statusCounts,
    payroll,
    totals,
    absence,
    documents,
    documentCounts: {
      expired: documents.filter((row) => row.status.key === "expired" || row.status.key === "today").length,
      soon: documents.filter((row) => row.status.key === "urgent" || row.status.key === "warning").length,
    },
    staff,
  };
}

export type MonthlyReport = Awaited<ReturnType<typeof buildMonthlyReport>>;
