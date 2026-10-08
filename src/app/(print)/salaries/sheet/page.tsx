import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, SalaryDocsList, headerFor, readDocsMode, sheetClass } from "@/components/salary-docs";
import { requireUser } from "@/lib/auth";
import { monthBoth } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { currentPeriod, formatLongDate, money, round3 } from "@/lib/utils";

function readMonth(value: string | undefined) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

const cell = "border border-slate-200 px-2 py-1.5";

export default async function PayrollSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; employerId?: string; docs?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t } = await getI18n();
  const now = currentPeriod();
  const fallback = now.year * 12 + (now.month - 1);
  let fromKey = readMonth(sp.from) ?? fallback;
  let toKey = readMonth(sp.to) ?? fromKey;
  if (toKey < fromKey) [fromKey, toKey] = [toKey, fromKey];
  const employerId = sp.employerId || "";
  const status = sp.status === "paid" || sp.status === "unpaid" ? sp.status : "all";
  const docs = readDocsMode(sp.docs, "none");

  const employer = employerId && employerId !== "none" ? await prisma.employer.findFirst({ where: { id: employerId, companyId: user.companyId } }) : null;

  const rows = await prisma.salary.findMany({
    where: {
      employee: { companyId: user.companyId },
      ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
      ...(status === "paid" ? { paid: true } : status === "unpaid" ? { paid: false } : {}),
      OR: Array.from({ length: toKey - fromKey + 1 }, (_, index) => {
        const key = fromKey + index;
        return { year: Math.floor(key / 12), month: (key % 12) + 1 };
      }),
    },
    include: { employer: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { employerName: "asc" }, { employeeName: "asc" }],
  });

  const months = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.year}-${row.month}`;
    months.set(key, [...(months.get(key) || []), row]);
  }
  const currency = user.company.currency;
  const sum = (list: typeof rows, pick: (row: (typeof rows)[number]) => number) => round3(list.reduce((total, row) => total + pick(row), 0));
  const header = employer ? headerFor({ employerName: employer.name, employerNameEn: employer.nameEn, employer }, user.company) : headerFor({}, user.company);
  const showEmployer = !employerId;
  const scope = employer
    ? `${employer.name}${employer.nameEn ? ` / ${employer.nameEn}` : ""}`
    : employerId === "none"
      ? "بدون كفيل / No sponsor"
      : "جميع أصحاب العمل / All employers";
  const fromLabel = `${monthBoth((fromKey % 12) + 1)} ${Math.floor(fromKey / 12)}`;
  const toLabel = `${monthBoth((toKey % 12) + 1)} ${Math.floor(toKey / 12)}`;
  const backQuery = new URLSearchParams({ year: String(Math.floor(toKey / 12)), month: String((toKey % 12) + 1) });
  if (employerId) backQuery.set("employerId", employerId);

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 10mm; } .slip-break { break-before: page; } .month-block { break-inside: avoid; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/salaries?${backQuery.toString()}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للرواتب", "Back to payroll")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>

      <article className={sheetClass}>
        <HeaderBar header={header} titleAr="كشف رواتب" titleEn="Payroll Sheet" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <p>
            <span className="text-slate-500">صاحب العمل / Employer: </span>
            <strong>{scope}</strong>
          </p>
          <p>
            <span className="text-slate-500">الفترة / Period: </span>
            <strong>{fromKey === toKey ? fromLabel : `${fromLabel} — ${toLabel}`}</strong>
          </p>
          <p>
            <span className="text-slate-500">الحالة / Status: </span>
            <strong>{status === "paid" ? "مصروف / Paid" : status === "unpaid" ? "غير مصروف / Unpaid" : "الكل / All"}</strong>
          </p>
          <p>
            <span className="text-slate-500">تاريخ الطباعة / Printed: </span>
            <strong>{formatLongDate("ar")}</strong>
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">لا توجد رواتب في هذه الفترة / No salaries in this period</p>
        ) : null}

        {[...months.entries()].map(([key, list]) => (
          <section key={key} className="month-block mt-6">
            <h3 className="mb-2 font-bold text-teal-900">
              {monthBoth(list[0].month)} {list[0].year}
            </h3>
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[620px] border-collapse text-xs print:min-w-0">
              <thead>
                <tr className="bg-slate-100">
                  <th className={`${cell} text-start`}>#</th>
                  <th className={`${cell} text-start`}><Bi ar="الموظف" en="Employee" /></th>
                  {showEmployer ? <th className={`${cell} text-start`}><Bi ar="صاحب العمل" en="Employer" /></th> : null}
                  <th className={`${cell} text-start`}><Bi ar="الإجمالي" en="Gross" /></th>
                  <th className={`${cell} text-start`}><Bi ar="الخصم" en="Deductions" /></th>
                  <th className={`${cell} text-start`}><Bi ar="الصافي" en="Net" /></th>
                  <th className={`${cell} text-start`}><Bi ar="الحالة" en="Status" /></th>
                  <th className={`${cell} w-24 text-start`}><Bi ar="التوقيع" en="Signature" /></th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, index) => (
                  <tr key={row.id}>
                    <td className={cell}>{index + 1}</td>
                    <td className={cell}>
                      <span className="block font-semibold">{row.employeeName}</span>
                      <span className="block text-[10px] text-slate-500" dir="ltr">
                        {[row.employeeNameEn, row.employeeNumber].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    {showEmployer ? <td className={cell}>{row.employerName || "—"}</td> : null}
                    <td className={`${cell} whitespace-nowrap`}>{money(packageGross(row), currency)}</td>
                    <td className={`${cell} whitespace-nowrap`}>{money(row.absenceDeduction + row.otherDeduction, currency)}</td>
                    <td className={`${cell} whitespace-nowrap font-semibold`}>{money(row.netSalary, currency)}</td>
                    <td className={cell}>{row.paid ? `مصروف / Paid${row.receiptNo ? ` — ${row.receiptNo}` : ""}` : "غير مصروف / Unpaid"}</td>
                    <td className={cell} />
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className={cell} colSpan={showEmployer ? 3 : 2}>
                    المجموع / Total ({list.length})
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{money(sum(list, packageGross), currency)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{money(sum(list, (row) => row.absenceDeduction + row.otherDeduction), currency)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{money(sum(list, (row) => row.netSalary), currency)}</td>
                  <td className={cell} colSpan={2} />
                </tr>
              </tbody>
            </table>
            </div>
          </section>
        ))}

        {months.size > 1 ? (
          <div className="mt-6 flex items-center justify-between rounded-xl bg-teal-800 px-5 py-3 text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <span className="font-bold">الإجمالي العام / Grand total ({rows.length})</span>
            <span className="text-lg font-bold">{money(sum(rows, (row) => row.netSalary), currency)}</span>
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 print:grid-cols-2 print:gap-10 text-sm">
          <div>
            <Bi ar="أعدّه" en="Prepared by" />
            <div className="mt-8 border-b border-slate-800" />
          </div>
          <div>
            <Bi ar="اعتمده" en="Approved by" />
            <div className="mt-8 border-b border-slate-800" />
          </div>
        </div>
      </article>

      <SalaryDocsList salaries={rows} docs={docs} company={user.company} />
    </div>
  );
}
