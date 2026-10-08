import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { PAYMENT_LABEL, monthName } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { daysLabel, formatDate, money, round3, todayInputValue } from "@/lib/utils";
import { deleteUnpaidSalary, paySalary, recalculateSalary, unpaySalary, updateSalaryAdjustments } from "@/server/salary-actions";

export default async function SalaryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { lang, t } = await getI18n();
  const salary = await prisma.salary.findFirst({
    where: { id, employee: { companyId: user.companyId } },
    include: { employee: true },
  });
  if (!salary) notFound();
  const allow = { edit: can(user, "salaries.edit"), remove: can(user, "salaries.delete"), pay: can(user, "salaries.pay") };
  const currency = user.company.currency;
  const gross = packageGross(salary);
  const daily = user.company.salaryDays > 0 ? gross / user.company.salaryDays : 0;
  const liveDays = salary.paid ? salary.absenceDays : await countAbsenceDays(salary.employeeId, salary.year, salary.month);
  const stale = !salary.paid && round3(liveDays) !== round3(salary.absenceDays);
  const name = lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName;
  const employerName = lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName;
  const rows: [string, number][] = [
    [t("الراتب الأساسي", "Basic salary"), salary.basicSalary],
    [t("بدل السكن", "Housing allowance"), salary.housingAllowance],
    [t("بدل النقل", "Transport allowance"), salary.transportAllowance],
    [t("بدلات أخرى", "Other allowances"), salary.otherAllowance],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={name}
        description={[salary.employeeNumber, `${monthName(salary.month, lang)} ${salary.year}`, employerName, salary.receiptNo].filter(Boolean).join(" — ")}
      >
        <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <Card>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-slate-100">
                <td className="py-2">{label}</td>
                <td className="py-2 text-end">{money(value, currency)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-100 font-semibold">
              <td className="py-2">{t("إجمالي الراتب", "Gross salary")}</td>
              <td className="py-2 text-end">{money(gross, currency)}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2">
                {t(`خصم الغياب (${daysLabel(salary.absenceDays)} يوم)`, `Absence deduction (${daysLabel(salary.absenceDays)} days)`)}
              </td>
              <td className="py-2 text-end">{money(salary.absenceDeduction, currency)}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2">{t("خصومات أخرى", "Other deductions")}</td>
              <td className="py-2 text-end">{money(salary.otherDeduction, currency)}</td>
            </tr>
            <tr className="text-base font-bold text-teal-900">
              <td className="pt-3">{t("صافي الراتب", "Net salary")}</td>
              <td className="pt-3 text-end">{money(salary.netSalary, currency)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {t(
            `قيمة اليوم = ${money(daily, currency)} بناءً على ${user.company.salaryDays} يوماً. يُخصم فقط ما سُجّل بخصم من الراتب.`,
            `Daily rate = ${money(daily, currency)} based on ${user.company.salaryDays} days. Only entries marked as salary-deducting are deducted.`,
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/salaries/${salary.id}/print?doc=slip`} className={secondaryBtn}>
            {t("طباعة قسيمة الراتب", "Print payslip")}
          </Link>
          {salary.paid ? (
            <Link href={`/salaries/${salary.id}/print?doc=receipt`} className={primaryBtn}>
              {t("طباعة إيصال الاستلام", "Print receipt")}
            </Link>
          ) : null}
        </div>
      </Card>

      {salary.paid ? (
        <Card className="mt-4 space-y-2 text-sm">
          <p>
            {t("طريقة الدفع", "Payment method")}: {pick(PAYMENT_LABEL[salary.paymentMethod || ""], lang, "—")}
          </p>
          <p>
            {t("تاريخ الصرف", "Pay date")}: {formatDate(salary.paidAt)}
          </p>
          <p>
            {t("رقم العملية", "Reference")}: {salary.paymentReference || "—"}
          </p>
          <p>
            {t("بواسطة", "By")}: {salary.paidByName || "—"}
          </p>
          {salary.notes ? (
            <p>
              {t("ملاحظات", "Notes")}: {salary.notes}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/salaries?year=${salary.year}&month=${salary.month}`} className={secondaryBtn}>
              {t("رجوع", "Back")}
            </Link>
            {allow.pay ? (
              <DeleteButton
                action={unpaySalary}
                fields={{ id: salary.id }}
                variant="danger"
                label={t("إلغاء الصرف", "Cancel payment")}
                confirm={t(
                  "إلغاء صرف هذا الراتب وإعادته غير مصروف؟ يبقى رقم الإيصال محفوظاً ويُسجّل الإلغاء في سجل العمليات.",
                  "Cancel this payment and mark the salary unpaid? The receipt number is kept and the change is logged.",
                )}
              />
            ) : null}
          </div>
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {allow.edit ? (
          <Card className="space-y-3">
            <h2 className="font-bold">{t("تعديل الراتب والخصومات", "Edit salary and deductions")}</h2>
            <p className="text-sm text-slate-500">
              {t(
                `الغياب المسجّل حالياً: ${daysLabel(liveDays)} يوم. المحفوظ في المسير: ${daysLabel(salary.absenceDays)} يوم.`,
                `Absence recorded now: ${daysLabel(liveDays)} days. Saved in this record: ${daysLabel(salary.absenceDays)} days.`,
              )}
              {stale ? t(" أعد الاحتساب قبل الصرف.", " Recalculate before paying.") : ""}
            </p>
            <form action={recalculateSalary}>
              <input type="hidden" name="id" value={salary.id} />
              <SubmitButton variant="secondary">{t("إعادة احتساب الغياب", "Recalculate absence")}</SubmitButton>
            </form>
            <form action={updateSalaryAdjustments} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={salary.id} />
              {(
                [
                  ["basicSalary", t("الراتب الأساسي", "Basic salary"), salary.basicSalary],
                  ["housingAllowance", t("بدل السكن", "Housing allowance"), salary.housingAllowance],
                  ["transportAllowance", t("بدل النقل", "Transport allowance"), salary.transportAllowance],
                  ["otherAllowance", t("بدلات أخرى", "Other allowances"), salary.otherAllowance],
                  ["otherDeduction", t("خصومات أخرى", "Other deductions"), salary.otherDeduction],
                ] as const
              ).map(([name, label, value]) => (
                <label key={name} className="text-sm">
                  {label}
                  <input className={`${fieldClass} mt-1 w-full`} type="number" min="0" step="0.001" name={name} defaultValue={value} />
                </label>
              ))}
              <label className="text-sm">
                {t("ملاحظات", "Notes")}
                <input className={`${fieldClass} mt-1 w-full`} name="notes" defaultValue={salary.notes || ""} />
              </label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                {t(
                  "يُعاد حساب خصم الغياب والصافي تلقائياً. التعديل يخص هذا الشهر فقط ولا يغيّر راتب الموظف في ملفه.",
                  "Absence deduction and net are recalculated. This changes this month only, not the employee's salary in their record.",
                )}
              </p>
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary">{t("حفظ التعديلات", "Save changes")}</SubmitButton>
              </div>
            </form>
          </Card>
          ) : null}

          {allow.pay ? (
          <Card>
            <h2 className="font-bold">{t("صرف الراتب", "Pay salary")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("بعد التأكيد يُفتح إيصال الاستلام للطباعة وتوقيع العامل، ويُقفل هذا المسير.", "After confirming, the receipt opens for printing and signature, and this record is locked.")}
            </p>
            <form action={paySalary} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={salary.id} />
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(PAYMENT_LABEL).map(([value, label], index) => (
                  <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input type="radio" name="paymentMethod" value={value} defaultChecked={index === 0} />
                    {label[lang]}
                  </label>
                ))}
              </div>
              <label className="block text-sm">
                {t("رقم العملية", "Reference")}
                <input className={`${fieldClass} mt-1 w-full`} name="paymentReference" placeholder={t("اختياري", "Optional")} />
              </label>
              <label className="block text-sm">
                {t("تاريخ الصرف", "Pay date")}
                <input className={`${fieldClass} mt-1 w-full`} type="date" name="paidAt" defaultValue={todayInputValue()} required />
              </label>
              <SubmitButton pendingLabel={t("جارٍ الصرف...", "Paying...")}>{t("تأكيد صرف الراتب", "Confirm payment")}</SubmitButton>
            </form>
          </Card>
          ) : null}

          {allow.remove ? (
          <Card>
            <p className="mb-3 text-sm text-slate-500">
              {t("لنسخ راتب الموظف الحالي من ملفه من جديد، احذف هذا المسير ثم أضفه أو أنشئ الرواتب مرة أخرى.", "To copy the employee's current salary again, delete this record and add it or generate again.")}
            </p>
            <DeleteButton
              action={deleteUnpaidSalary}
              fields={{ id: salary.id }}
              variant="danger"
              label={t("حذف المسير غير المصروف", "Delete unpaid record")}
              confirm={t("حذف هذا المسير غير المصروف؟", "Delete this unpaid record?")}
            />
          </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
