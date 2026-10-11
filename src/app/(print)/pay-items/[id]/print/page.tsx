import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, headerFor, sheetClass } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { PAYMENT_LABEL, bothTerm, monthBoth, monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { keyToPeriod, monthKey, payItemProgress } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { currentPeriod, formatDate, money } from "@/lib/utils";

const cell = "border border-slate-200 px-3 py-2";

export default async function AdvanceReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("salaries.view");
  const { t } = await getI18n();
  const item = await prisma.payItem.findFirst({
    where: { id, companyId: user.companyId, kind: "ADVANCE" },
    include: {
      employee: { include: { employer: true } },
      lines: { select: { amount: true, salary: { select: { year: true, month: true, paid: true } } } },
    },
  });
  if (!item) notFound();
  const now = currentPeriod();
  const progress = payItemProgress(item, monthKey(now.year, now.month));
  const employee = item.employee;
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);
  const currency = user.company.currency;
  const count = item.months || 1;
  const first = keyToPeriod(progress.start);
  const last = keyToPeriod(progress.start + count - 1);
  const method = item.paymentMethod ? PAYMENT_LABEL[item.paymentMethod] : null;
  const info: [string, string, string][] = [
    ["اسم الموظف", "Employee name", employee.nameEn ? `${employee.fullName} — ${employee.nameEn}` : employee.fullName],
    ["الرقم الوظيفي", "Employee no.", employee.employeeNumber],
    ["الوظيفة", "Job title", bothTerm(employee.jobTitle) || "—"],
    ["تاريخ التسليم", "Date handed over", formatDate(item.issuedAt)],
    ["البيان", "Description", item.title],
    ["طريقة التسليم", "Handed over by", method ? `${method.ar} / ${method.en}` : "—"],
  ];

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/employees/${employee.id}?tab=pay#item-${item.id}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للسلف والمكافآت", "Back to advances & bonuses")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>

      <article className={sheetClass}>
        <HeaderBar header={header} titleAr="إيصال استلام سلفة" titleEn="Salary Advance Receipt" />
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 print:grid-cols-2">
          {info.map(([ar, en, value]) => (
            <div key={en} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <Bi ar={ar} en={en} className="text-slate-500" />
              <strong className="text-end">{value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border-2 border-teal-800 px-5 py-4 text-center">
          <p className="text-sm text-slate-600">مبلغ السلفة / Advance amount</p>
          <p className="mt-1 text-3xl font-bold text-teal-900">{money(item.amount, currency)}</p>
        </div>

        <table className="mt-5 w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className={cell}>
                <Bi ar="عدد الأقساط" en="Instalments" />
              </td>
              <td className={`${cell} text-end`}>{count}</td>
            </tr>
            <tr>
              <td className={cell}>
                <Bi ar="القسط الشهري" en="Monthly instalment" />
              </td>
              <td className={`${cell} text-end`}>{money(progress.instalment || 0, currency)}</td>
            </tr>
            <tr>
              <td className={cell}>
                <Bi ar="فترة الخصم من الراتب" en="Deducted from salaries" />
              </td>
              <td className={`${cell} text-end`}>
                {monthBoth(first.month)} {first.year}
                {count > 1 ? ` — ${monthBoth(last.month)} ${last.year}` : ""}
              </td>
            </tr>
            <tr>
              <td className={cell}>
                <Bi ar="المسدّد حتى اليوم" en="Repaid to date" />
              </td>
              <td className={`${cell} text-end`}>{money(progress.paidAmount, currency)}</td>
            </tr>
            <tr className="bg-slate-50 font-bold">
              <td className={cell}>
                <Bi ar="المتبقي" en="Outstanding" />
              </td>
              <td className={`${cell} text-end`}>{money(progress.remaining || 0, currency)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 space-y-3 text-sm leading-7">
          <p>
            أقر أنا الموقع أدناه <strong>{employee.fullName}</strong> بأنني استلمت مبلغ <strong>{money(item.amount, currency)}</strong> سلفةً على راتبي، وأوافق على
            خصمها من رواتبي على <strong>{count}</strong> {count === 1 ? "دفعة" : "أقساط شهرية"} ابتداءً من راتب شهر{" "}
            <strong>
              {monthName(first.month, "ar")} {first.year}
            </strong>
            ، وفي حال انتهاء خدمتي قبل السداد يُخصم المتبقي من مستحقاتي.
          </p>
          <p dir="ltr" className="text-start text-slate-600">
            I, the undersigned <strong>{employee.nameEn || employee.fullName}</strong>, acknowledge receiving <strong>{money(item.amount, currency)}</strong> as an
            advance on my salary, and agree to its deduction from my salaries in <strong>{count}</strong> monthly instalment(s) starting with the{" "}
            <strong>
              {monthName(first.month, "en")} {first.year}
            </strong>{" "}
            salary. If my service ends before it is repaid, the balance is deducted from my final dues.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 sm:gap-10 print:grid-cols-2 print:gap-10">
          <div>
            <Bi ar="توقيع الموظف" en="Employee signature" />
            <div className="mt-10 border-b border-slate-800" />
            <div className="mt-6">
              <Bi ar="التاريخ" en="Date" />
            </div>
            <div className="mt-8 border-b border-slate-800" />
          </div>
          <div>
            <Bi ar="المسؤول عن التسليم" en="Handed over by" />
            <p className="mt-2 font-semibold">{item.createdByName || ""}</p>
            <div className="mt-6 border-b border-slate-800" />
            <div className="mt-6 flex h-24 items-end justify-center rounded-lg border border-dashed border-slate-300 pb-2 text-xs text-slate-400">
              ختم المنشأة / Company stamp
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
