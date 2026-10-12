import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, ChevronDown, CircleDollarSign, HandCoins, PencilLine, Printer, ReceiptText, RefreshCw, Trash2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, InfoItem, PageHeader, SectionTitle, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { PAYMENT_LABEL, PAY_KIND_LABEL, monthName } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { packageGross, totalEarnings } from "@/lib/salary";
import { daysLabel, formatDate, money, round3, todayInputValue } from "@/lib/utils";
import { savePayItem } from "@/server/pay-item-actions";
import { deleteUnpaidSalary, paySalary, recalculateSalary, unpaySalary, updateSalaryAdjustments } from "@/server/salary-actions";
import { PayItemForm } from "@/components/pay-item-form";

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
    include: { employee: true, lines: { orderBy: { title: "asc" } } },
  });
  if (!salary) notFound();
  const earningLines = salary.lines.filter((line) => !line.deduct);
  const deductionLines = salary.lines.filter((line) => line.deduct);
  const lineLabel = (line: (typeof salary.lines)[number]) => (
    <>
      <span className="me-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">{pick(PAY_KIND_LABEL[line.kind], lang, line.kind)}</span>
      {line.payItemId ? (
        <Link href={`/employees/${salary.employeeId}?tab=pay#item-${line.payItemId}`} className="text-teal-700 hover:underline">
          {line.title}
        </Link>
      ) : (
        line.title
      )}
    </>
  );
  const allow = { edit: can(user, "salaries.edit"), remove: can(user, "salaries.delete"), pay: can(user, "salaries.pay"), addItem: can(user, "salaries.create") };
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
  const row = "flex items-center justify-between gap-4 py-2.5";

  return (
    <div className="page-wide space-y-5">
      <Link
        href={`/salaries?year=${salary.year}&month=${salary.month}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700"
      >
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("رواتب", "Payroll")} {monthName(salary.month, lang)} {salary.year}
      </Link>

      <PageHeader
        icon={ReceiptText}
        title={name}
        description={[salary.employeeNumber, `${monthName(salary.month, lang)} ${salary.year}`, employerName, salary.receiptNo].filter(Boolean).join(" · ")}
      >
        <ToneBadge tone={salary.paid ? "green" : "amber"} className="px-3 py-1 text-sm">
          {salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}
        </ToneBadge>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/90 bg-surface shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="font-bold text-slate-900">{t("تفاصيل الراتب", "Salary breakdown")}</h2>
            <span className="tabular text-xs text-slate-500">
              {monthName(salary.month, lang)} {salary.year}
            </span>
          </div>
          <div className="px-5 py-2 text-sm sm:px-6">
            <div className="divide-y divide-slate-100">
              {rows.map(([label, value]) => (
                <div key={label} className={row}>
                  <span className="text-slate-600">{label}</span>
                  <span className="tabular font-medium text-slate-900">{money(value, currency)}</span>
                </div>
              ))}
              {earningLines.map((line) => (
                <div key={line.id} className={row}>
                  <span className="min-w-0 text-slate-700">{lineLabel(line)}</span>
                  <span className="tabular shrink-0 font-medium text-emerald-700">+{money(line.amount, currency)}</span>
                </div>
              ))}
              <div className={`${row} font-semibold`}>
                <span className="text-slate-900">{earningLines.length ? t("إجمالي الاستحقاقات", "Total earnings") : t("إجمالي الراتب", "Gross salary")}</span>
                <span className="tabular text-slate-900">{money(totalEarnings(salary), currency)}</span>
              </div>
              <div className={row}>
                <span className="text-slate-600">{t(`خصم الغياب (${daysLabel(salary.absenceDays)} يوم)`, `Absence deduction (${daysLabel(salary.absenceDays)} days)`)}</span>
                <span className={`tabular font-medium ${salary.absenceDeduction ? "text-red-700" : "text-slate-400"}`}>
                  {salary.absenceDeduction ? "−" : ""}
                  {money(salary.absenceDeduction, currency)}
                </span>
              </div>
              <div className={row}>
                <span className="text-slate-600">{t("خصومات أخرى", "Other deductions")}</span>
                <span className={`tabular font-medium ${salary.otherDeduction ? "text-red-700" : "text-slate-400"}`}>
                  {salary.otherDeduction ? "−" : ""}
                  {money(salary.otherDeduction, currency)}
                </span>
              </div>
              {deductionLines.map((line) => (
                <div key={line.id} className={row}>
                  <span className="min-w-0 text-slate-700">{lineLabel(line)}</span>
                  <span className="tabular shrink-0 font-medium text-red-700">−{money(line.amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-3 mb-3 flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-l from-ink-900 to-teal-900 px-5 py-4 text-white shadow-raised sm:mx-4 sm:mb-4">
            <span className="text-sm font-medium text-white/75">{t("صافي الراتب", "Net salary")}</span>
            <span className="tabular text-2xl font-bold tracking-tight">{money(salary.netSalary, currency)}</span>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
            <p className="text-xs leading-5 text-slate-500">
              {t(
                `قيمة اليوم = ${money(daily, currency)} بناءً على ${user.company.salaryDays} يوماً. يُخصم فقط ما سُجّل بخصم من الراتب.`,
                `Daily rate = ${money(daily, currency)} based on ${user.company.salaryDays} days. Only entries marked as salary-deducting are deducted.`,
              )}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <Link href={`/salaries/${salary.id}/print?doc=slip`} className={secondaryBtn}>
                <Printer size={16} />
                {t("طباعة قسيمة الراتب", "Print payslip")}
              </Link>
              {salary.paid ? (
                <Link href={`/salaries/${salary.id}/print?doc=receipt`} className={primaryBtn}>
                  <ReceiptText size={16} />
                  {t("طباعة إيصال الاستلام", "Print receipt")}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          {salary.paid ? (
            <Card>
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck size={18} className="text-emerald-600" />
                  {t("تم الصرف", "Paid")}
                </span>
              </SectionTitle>
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <InfoItem label={t("طريقة الدفع", "Payment method")} value={pick(PAYMENT_LABEL[salary.paymentMethod || ""], lang, "—")} />
                <InfoItem label={t("تاريخ الصرف", "Pay date")} value={formatDate(salary.paidAt)} />
                <InfoItem label={t("رقم العملية", "Reference")} value={salary.paymentReference || "—"} />
                <InfoItem label={t("بواسطة", "By")} value={salary.paidByName || "—"} />
                {salary.notes ? <InfoItem label={t("ملاحظات", "Notes")} value={salary.notes} wide /> : null}
              </dl>
              {allow.pay ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
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
                </div>
              ) : null}
            </Card>
          ) : (
            <>
              {allow.pay ? (
                <Card className="border-teal-200/80 ring-1 ring-teal-100">
                  <SectionTitle hint={t("بعد التأكيد يُفتح إيصال الاستلام للطباعة وتوقيع العامل، ويُقفل هذا المسير.", "After confirming, the receipt opens for printing and signature, and this record is locked.")}>
                    <span className="inline-flex items-center gap-2">
                      <HandCoins size={18} className="text-teal-700" />
                      {t("صرف الراتب", "Pay salary")}
                    </span>
                  </SectionTitle>
                  {stale ? (
                    <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-inset ring-amber-200/70">
                      {t("تغيّر الغياب منذ إنشاء المسير. أعد الاحتساب قبل الصرف.", "Absence changed since this record was created. Recalculate before paying.")}
                    </p>
                  ) : null}
                  <form action={paySalary} className="space-y-3">
                    <input type="hidden" name="id" value={salary.id} />
                    <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      <legend className="sr-only">{t("طريقة الدفع", "Payment method")}</legend>
                      {Object.entries(PAYMENT_LABEL).map(([value, label], index) => (
                        <label
                          key={value}
                          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-900"
                        >
                          <input type="radio" name="paymentMethod" value={value} defaultChecked={index === 0} />
                          {label[lang]}
                        </label>
                      ))}
                    </fieldset>
                    <Field label={t("رقم العملية", "Reference")}>
                      <input className={`${fieldClass} w-full`} name="paymentReference" placeholder={t("اختياري", "Optional")} />
                    </Field>
                    <Field label={t("تاريخ الصرف", "Pay date")}>
                      <input className={`${fieldClass} w-full`} type="date" name="paidAt" defaultValue={todayInputValue()} required />
                    </Field>
                    <SubmitButton className="w-full" pendingLabel={t("جارٍ الصرف...", "Paying...")}>
                      <CircleDollarSign size={16} />
                      {t("تأكيد صرف الراتب", "Confirm payment")}
                    </SubmitButton>
                  </form>
                </Card>
              ) : null}

              {allow.edit ? (
                <Card>
                  <SectionTitle
                    hint={t(
                      `الغياب المسجّل حالياً: ${daysLabel(liveDays)} يوم. المحفوظ في المسير: ${daysLabel(salary.absenceDays)} يوم.`,
                      `Absence recorded now: ${daysLabel(liveDays)} days. Saved in this record: ${daysLabel(salary.absenceDays)} days.`,
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PencilLine size={18} className="text-teal-700" />
                      {t("تعديل الراتب والخصومات", "Edit salary and deductions")}
                    </span>
                  </SectionTitle>
                  <form action={recalculateSalary} className="mb-4">
                    <input type="hidden" name="id" value={salary.id} />
                    <SubmitButton variant="secondary" className="w-full sm:w-auto">
                      <RefreshCw size={15} />
                      {t("إعادة احتساب الغياب والسلف والمكافآت", "Recalculate absence and pay items")}
                    </SubmitButton>
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
                      <Field key={name} label={label}>
                        <input className={`${fieldClass} tabular w-full`} type="number" min="0" step="0.001" name={name} defaultValue={value} />
                      </Field>
                    ))}
                    <Field label={t("ملاحظات", "Notes")}>
                      <input className={`${fieldClass} w-full`} name="notes" defaultValue={salary.notes || ""} />
                    </Field>
                    <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                      {t(
                        "يُعاد حساب خصم الغياب والصافي تلقائياً. التعديل يخص هذا الشهر فقط ولا يغيّر راتب الموظف في ملفه.",
                        "Absence deduction and net are recalculated. This changes this month only, not the employee's salary in their record.",
                      )}
                    </p>
                    <div className="sm:col-span-2">
                      <SubmitButton variant="secondary" className="w-full sm:w-auto">
                        {t("حفظ التعديلات", "Save changes")}
                      </SubmitButton>
                    </div>
                  </form>
                </Card>
              ) : null}

              {allow.addItem ? (
                <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
                    <span className="flex items-center gap-3 text-sm font-bold text-slate-900">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-100">
                        <HandCoins size={18} />
                      </span>
                      {t("مكافأة أو بدل أو خصم أو سلفة لهذا الراتب", "Bonus, allowance, deduction or advance for this salary")}
                    </span>
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                    <p className="mb-3 text-xs leading-5 text-slate-500">
                      {t(
                        "يُحفظ في «السلف والمكافآت» للموظف ويُطبّق على هذا الشهر فوراً. اختر التكرار إن أردت تطبيقه على الأشهر القادمة أيضاً.",
                        "Saved under the employee's advances & bonuses and applied to this month at once. Choose a repeat to apply it to coming months too.",
                      )}
                    </p>
                    <PayItemForm
                      action={savePayItem}
                      returnTo={`/salaries/${salary.id}`}
                      employeeId={salary.employeeId}
                      defaultKind="BONUS"
                      defaultStart={`${salary.year}-${String(salary.month).padStart(2, "0")}`}
                      today={todayInputValue()}
                      currency={currency}
                    />
                  </div>
                </details>
              ) : null}

              {allow.remove ? (
                <Card className="border-red-100 bg-red-50/30">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
                      <Trash2 size={17} />
                    </span>
                    <div className="min-w-0 space-y-3">
                      <p className="text-sm leading-6 text-slate-600">
                        {t(
                          "لنسخ راتب الموظف الحالي من ملفه من جديد، احذف هذا المسير ثم أضفه أو أنشئ الرواتب مرة أخرى.",
                          "To copy the employee's current salary again, delete this record and add it or generate again.",
                        )}
                      </p>
                      <DeleteButton
                        action={deleteUnpaidSalary}
                        fields={{ id: salary.id }}
                        variant="danger"
                        label={t("حذف المسير غير المصروف", "Delete unpaid record")}
                        confirm={t("حذف هذا المسير غير المصروف؟", "Delete this unpaid record?")}
                      />
                    </div>
                  </div>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
