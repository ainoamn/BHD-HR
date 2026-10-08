import type { Company, Employer } from "@prisma/client";
import { PAYMENT_LABEL, bothTerm, monthName } from "@/lib/constants";
import { packageGross } from "@/lib/salary";
import { daysLabel, formatDate, money, round3 } from "@/lib/utils";

export type DocHeader = {
  name: string;
  nameEn: string | null;
  logoUrl: string | null;
  idNumber: string | null;
  phone: string | null;
  address: string | null;
};

export type DocSalary = {
  receiptNo?: string | null;
  employerName?: string | null;
  employerNameEn?: string | null;
  employeeName: string;
  employeeNameEn?: string | null;
  employeeNumber: string;
  jobTitle?: string | null;
  department?: string | null;
  month: number;
  year: number;
  paid: boolean;
  paidAt?: Date | null;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  absenceDays: number;
  absenceDeduction: number;
  otherDeduction: number;
  netSalary: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  paidByName?: string | null;
};

export function headerFor(
  salary: { employerName?: string | null; employerNameEn?: string | null; employer?: Employer | null },
  company: Company,
): DocHeader {
  const employer = salary.employer;
  if (employer || salary.employerName) {
    return {
      name: salary.employerName || employer?.name || company.name,
      nameEn: salary.employerNameEn ?? employer?.nameEn ?? null,
      logoUrl: employer?.logoUrl || null,
      idNumber: employer?.idNumber || null,
      phone: employer?.phone || null,
      address: employer?.address || null,
    };
  }
  return {
    name: company.name,
    nameEn: company.nameEn,
    logoUrl: company.logoUrl,
    idNumber: company.crNumber,
    phone: company.phone,
    address: company.address,
  };
}

export function Bi({ ar, en, className }: { ar: string; en: string; className?: string }) {
  return (
    <span className={className}>
      <span className="block">{ar}</span>
      <span className="block text-[0.72em] font-normal text-slate-500" dir="ltr">
        {en}
      </span>
    </span>
  );
}

export function HeaderBar({ header, titleAr, titleEn, number }: { header: DocHeader; titleAr: string; titleEn: string; number?: string | null }) {
  return (
    <header
      className="flex flex-col gap-3 rounded-xl bg-teal-800 px-4 py-4 text-white sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 print:flex-row print:items-start print:justify-between print:px-5"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div className="flex items-center gap-3">
        {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" /> : null}
        <div>
          <h1 className="text-xl font-bold">{header.name}</h1>
          {header.nameEn && header.nameEn !== header.name ? (
            <p className="text-sm text-teal-100" dir="ltr">
              {header.nameEn}
            </p>
          ) : null}
          <p className="mt-1 text-xs leading-5 text-teal-50">
            {[header.address, header.phone, header.idNumber ? `CR / س.ت ${header.idNumber}` : null].filter(Boolean).join(" — ")}
          </p>
        </div>
      </div>
      <div className="sm:text-end print:text-end">
        <p className="text-sm font-bold">{titleAr}</p>
        <p className="text-xs text-teal-100" dir="ltr">
          {titleEn}
        </p>
        {number ? <p className="mt-1 font-bold">{number}</p> : null}
      </div>
    </header>
  );
}

function InfoGrid({ salary }: { salary: DocSalary }) {
  const rows: [string, string, string][] = [
    ["اسم الموظف", "Employee name", salary.employeeNameEn && salary.employeeNameEn !== salary.employeeName ? `${salary.employeeName} — ${salary.employeeNameEn}` : salary.employeeName],
    ["الرقم الوظيفي", "Employee no.", salary.employeeNumber],
    ["الوظيفة", "Job title", bothTerm(salary.jobTitle) || "—"],
    ["القسم", "Department", salary.department || "—"],
    ["الشهر", "Month", `${monthName(salary.month, "ar")} / ${monthName(salary.month, "en")} ${salary.year}`],
    ["تاريخ الصرف", "Pay date", salary.paid ? formatDate(salary.paidAt) : "—"],
  ];
  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {rows.map(([ar, en, value]) => (
        <div key={en} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
          <Bi ar={ar} en={en} className="text-slate-500" />
          <strong className="text-end">{value}</strong>
        </div>
      ))}
    </div>
  );
}

function AmountRow({ ar, en, value, currency, strong }: { ar: string; en: string; value: number; currency: string; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-slate-50 font-bold" : ""}>
      <td className="border border-slate-200 px-3 py-2">
        <Bi ar={ar} en={en} />
      </td>
      <td className="border border-slate-200 px-3 py-2 text-end whitespace-nowrap">{money(value, currency)}</td>
    </tr>
  );
}

export type DocsMode = "none" | "slips" | "receipts" | "both";

export function readDocsMode(value: string | undefined, fallback: DocsMode): DocsMode {
  return value === "none" || value === "slips" || value === "receipts" || value === "both" ? value : fallback;
}

export function SalaryDocsList({
  salaries,
  docs,
  company,
}: {
  salaries: (DocSalary & { id: string; employer?: Employer | null })[];
  docs: DocsMode;
  company: Company;
}) {
  if (docs === "none") return null;
  return (
    <>
      {salaries.map((salary) => {
        const header = headerFor(salary, company);
        const showSlip = docs === "slips" || docs === "both";
        const showReceipt = (docs === "receipts" || docs === "both") && salary.paid;
        return (
          <div key={salary.id}>
            {showSlip ? (
              <div className="slip-break mt-8 print:mt-0">
                <Payslip header={header} salary={salary} currency={company.currency} />
              </div>
            ) : null}
            {showReceipt ? (
              <div className="slip-break mt-8 print:mt-0">
                <SalaryReceipt header={header} salary={salary} currency={company.currency} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export const sheetClass =
  "sheet mx-auto w-full max-w-[190mm] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none";

export function Payslip({ header, salary, currency }: { header: DocHeader; salary: DocSalary; currency: string }) {
  const gross = packageGross(salary);
  const deductions = round3(salary.absenceDeduction + salary.otherDeduction);
  return (
    <article className={sheetClass}>
      <HeaderBar header={header} titleAr="قسيمة الراتب" titleEn="Payslip" />
      <InfoGrid salary={salary} />
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-teal-50">
              <th className="border border-slate-200 px-3 py-2 text-start" colSpan={2}>
                <Bi ar="الاستحقاقات" en="Earnings" />
              </th>
            </tr>
          </thead>
          <tbody>
            <AmountRow ar="الراتب الأساسي" en="Basic salary" value={salary.basicSalary} currency={currency} />
            <AmountRow ar="بدل السكن" en="Housing allowance" value={salary.housingAllowance} currency={currency} />
            <AmountRow ar="بدل النقل" en="Transport allowance" value={salary.transportAllowance} currency={currency} />
            <AmountRow ar="بدلات أخرى" en="Other allowances" value={salary.otherAllowance} currency={currency} />
            <AmountRow ar="إجمالي الاستحقاقات" en="Total earnings" value={gross} currency={currency} strong />
          </tbody>
        </table>
        <table className="w-full border-collapse self-start text-sm">
          <thead>
            <tr className="bg-red-50">
              <th className="border border-slate-200 px-3 py-2 text-start" colSpan={2}>
                <Bi ar="الاستقطاعات" en="Deductions" />
              </th>
            </tr>
          </thead>
          <tbody>
            <AmountRow
              ar={`غياب وإجازة بخصم (${daysLabel(salary.absenceDays)} يوم)`}
              en={`Absence / unpaid leave (${daysLabel(salary.absenceDays)} days)`}
              value={salary.absenceDeduction}
              currency={currency}
            />
            <AmountRow ar="خصومات أخرى" en="Other deductions" value={salary.otherDeduction} currency={currency} />
            <AmountRow ar="إجمالي الاستقطاعات" en="Total deductions" value={deductions} currency={currency} strong />
          </tbody>
        </table>
      </div>
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-800 px-4 py-4 text-white sm:px-5"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <span>
          <span className="block text-sm font-bold">صافي الراتب</span>
          <span className="block text-xs text-teal-100" dir="ltr">
            Net pay
          </span>
        </span>
        <span className="text-xl font-bold sm:text-2xl">{money(salary.netSalary, currency)}</span>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4 text-sm">
        <p>
          <span className="text-slate-500">طريقة الدفع / Payment method: </span>
          <strong>
            {salary.paymentMethod && PAYMENT_LABEL[salary.paymentMethod]
              ? `${PAYMENT_LABEL[salary.paymentMethod].ar} / ${PAYMENT_LABEL[salary.paymentMethod].en}`
              : "—"}
          </strong>
        </p>
        <p>
          <span className="text-slate-500">الحالة / Status: </span>
          <strong>{salary.paid ? "مصروف / Paid" : "غير مصروف / Unpaid"}</strong>
        </p>
      </div>
      {salary.notes ? <p className="mt-2 text-sm">ملاحظات / Notes: {salary.notes}</p> : null}
      <p className="mt-6 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
        قسيمة راتب صادرة من نظام الرواتب — System-generated payslip
      </p>
    </article>
  );
}

export function SalaryReceipt({ header, salary, currency }: { header: DocHeader; salary: DocSalary; currency: string }) {
  const month = `${monthName(salary.month, "ar")} ${salary.year}`;
  const monthEn = `${monthName(salary.month, "en")} ${salary.year}`;
  const method = salary.paymentMethod && PAYMENT_LABEL[salary.paymentMethod];
  return (
    <article className={sheetClass}>
      <HeaderBar header={header} titleAr="إيصال استلام راتب" titleEn="Salary Receipt" number={salary.receiptNo} />
      <InfoGrid salary={salary} />
      <div className="mt-6 rounded-xl border-2 border-teal-800 px-5 py-4 text-center">
        <p className="text-sm text-slate-600">المبلغ المستلم / Amount received</p>
        <p className="mt-1 text-3xl font-bold text-teal-900">{money(salary.netSalary, currency)}</p>
        <p className="mt-1 text-sm text-slate-600">
          {method ? `${method.ar} / ${method.en}` : "—"}
          {salary.paymentReference ? ` — ${salary.paymentReference}` : ""}
        </p>
      </div>
      <div className="mt-6 space-y-3 text-sm leading-7">
        <p>
          أقر أنا الموقع أدناه <strong>{salary.employeeName}</strong> بأنني استلمت صافي راتبي عن شهر <strong>{month}</strong> وقدره{" "}
          <strong>{money(salary.netSalary, currency)}</strong>، وهذا التوقيع حجة باستلام المبلغ.
        </p>
        <p dir="ltr" className="text-start text-slate-600">
          I, the undersigned <strong>{salary.employeeNameEn || salary.employeeName}</strong>, acknowledge receipt of my net salary for{" "}
          <strong>{monthEn}</strong> amounting to <strong>{money(salary.netSalary, currency)}</strong>. This signature is proof of receipt.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 print:grid-cols-2 print:gap-10 text-sm">
        <div>
          <Bi ar="توقيع الموظف" en="Employee signature" />
          <div className="mt-10 border-b border-slate-800" />
          <div className="mt-6">
            <Bi ar="التاريخ" en="Date" />
          </div>
          <div className="mt-8 border-b border-slate-800" />
        </div>
        <div>
          <Bi ar="المسؤول عن الصرف" en="Paid by" />
          <p className="mt-2 font-semibold">{salary.paidByName || ""}</p>
          <div className="mt-6 border-b border-slate-800" />
          <div className="mt-6 flex h-24 items-end justify-center rounded-lg border border-dashed border-slate-300 pb-2 text-xs text-slate-400">
            ختم المنشأة / Company stamp
          </div>
        </div>
      </div>
    </article>
  );
}
