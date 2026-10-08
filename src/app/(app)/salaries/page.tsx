import Link from "next/link";
import { Flash } from "@/components/flash";
import { PeriodFilter } from "@/components/period-filter";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, ToneBadge, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { PAYMENT_LABEL, monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { daysLabel, money, readPeriod, round3, todayInputValue } from "@/lib/utils";
import { createSalary, deleteUnpaidSalary, generatePayroll, payAll } from "@/server/salary-actions";

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employerId?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const currency = user.company.currency;
  const employers = await prisma.employer.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, nameEn: true },
    orderBy: { name: "asc" },
  });
  const employerId = sp.employerId === "none" || employers.some((item) => item.id === sp.employerId) ? sp.employerId || "" : "";
  const employerFilter = employerId === "none" ? { employerId: null } : employerId ? { employerId } : {};
  const [salaries, activeCount] = await Promise.all([
    prisma.salary.findMany({
      where: { year, month, employee: { companyId: user.companyId }, ...employerFilter },
      include: { employee: true },
      orderBy: [{ employerName: "asc" }, { employeeName: "asc" }],
    }),
    prisma.employee.count({ where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, ...employerFilter } }),
  ]);
  const allow = {
    create: can(user, "salaries.create"),
    edit: can(user, "salaries.edit"),
    remove: can(user, "salaries.delete"),
    pay: can(user, "salaries.pay"),
  };
  const withRecord = new Set(salaries.map((salary) => salary.employeeId));
  const missing = allow.create
    ? (
        await prisma.employee.findMany({
          where: { companyId: user.companyId, status: { not: "TERMINATED" } },
          select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
          orderBy: { fullName: "asc" },
        })
      ).filter((employee) => !withRecord.has(employee.id))
    : [];
  const liveDays = new Map<string, number>();
  await Promise.all(
    salaries.map(async (salary) => {
      liveDays.set(salary.employeeId, await countAbsenceDays(salary.employeeId, year, month));
    }),
  );
  const totalNet = salaries.reduce((sum, row) => sum + row.netSalary, 0);
  const totalGross = salaries.reduce((sum, row) => sum + packageGross(row), 0);
  const totalDeduction = salaries.reduce((sum, row) => sum + row.absenceDeduction + row.otherDeduction, 0);
  const unpaid = salaries.filter((row) => !row.paid);
  const unpaidTotal = round3(unpaid.reduce((sum, row) => sum + row.netSalary, 0));
  const selected = employers.find((item) => item.id === employerId);
  const scope = selected
    ? lang === "en" && selected.nameEn
      ? selected.nameEn
      : selected.name
    : employerId === "none"
      ? t("بدون صاحب عمل", "No employer")
      : t("كل أصحاب العمل", "All employers");
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const stats = [
    [t("المسيرات", "Records"), String(salaries.length)],
    [t("الإجمالي", "Gross"), money(totalGross, currency)],
    [t("الخصومات", "Deductions"), money(totalDeduction, currency)],
    [t("الصافي", "Net"), money(totalNet, currency)],
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("الرواتب", "Payroll")}
        description={t(
          `مسير ${monthName(month, "ar")} ${year} — ${scope}. إنشاء الرواتب ينسخ راتب الموظف الحالي ولا يغيّر الشهور السابقة.`,
          `${monthName(month, "en")} ${year} payroll — ${scope}. Generating copies each employee's current salary and never changes past months.`,
        )}
      >
        <PeriodFilter year={year} month={month} employers={employers} employerId={employerId} />
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <h2 className="font-bold">{t("1. إنشاء الرواتب", "1. Generate payroll")}</h2>
          <p className="text-sm text-slate-600">
            {t(
              `الموظفون النشطون (${scope}): ${activeCount}. لديهم مسير: ${salaries.length}.`,
              `Active employees (${scope}): ${activeCount}. With a record: ${salaries.length}.`,
            )}
          </p>
          {allow.create ? (
            <>
              <form action={generatePayroll}>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="employerId" value={employerId} />
                <SubmitButton>{t(`إنشاء رواتب ${scope}`, `Generate for ${scope}`)}</SubmitButton>
              </form>
              {missing.length ? (
                <form action={createSalary} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />
                  <label className="min-w-0 flex-1 space-y-1 text-xs text-slate-500">
                    {t("أو أضف راتب موظف واحد", "Or add one employee")}
                    <select name="employeeId" className={`${fieldClass} w-full`} required>
                      {missing.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName} — {employee.employeeNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton variant="secondary">{t("إضافة", "Add")}</SubmitButton>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-slate-400">{t("لا تملك صلاحية إنشاء الرواتب.", "You cannot create salaries.")}</p>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">{t("2. صرف الكل", "2. Pay all")}</h2>
          <p className="text-sm text-slate-600">
            {t(
              `غير المصروف: ${unpaid.length} بمجموع ${money(unpaidTotal, currency)}. بعد الصرف تُفتح الإيصالات للطباعة.`,
              `Unpaid: ${unpaid.length}, total ${money(unpaidTotal, currency)}. Receipts open for printing after payment.`,
            )}
          </p>
          {unpaid.length && allow.pay ? (
            <form action={payAll} className="space-y-2">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="employerId" value={employerId} />
              <select name="paymentMethod" className={`${fieldClass} w-full`} defaultValue="BANK_TRANSFER">
                {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label[lang]}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className={fieldClass} type="date" name="paidAt" defaultValue={todayInputValue()} required />
                <input className={fieldClass} name="paymentReference" placeholder={t("رقم العملية (اختياري)", "Reference (optional)")} />
              </div>
              <SubmitButton pendingLabel={t("جارٍ الصرف...", "Paying...")}>{t(`صرف ${unpaid.length} راتب`, `Pay ${unpaid.length} salaries`)}</SubmitButton>
            </form>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">{t("3. الطباعة", "3. Print")}</h2>
          <form method="get" action="/salaries/sheet" target="_blank" className="space-y-2">
            <input type="hidden" name="employerId" value={employerId} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                {t("من شهر", "From")}
                <input className={`${fieldClass} mt-1 w-full`} type="month" name="from" defaultValue={period} />
              </label>
              <label className="text-xs text-slate-500">
                {t("إلى شهر", "To")}
                <input className={`${fieldClass} mt-1 w-full`} type="month" name="to" defaultValue={period} />
              </label>
            </div>
            <select name="docs" className={`${fieldClass} w-full`} defaultValue="none">
              <option value="none">{t("الكشف فقط", "Sheet only")}</option>
              <option value="slips">{t("الكشف + قسيمة لكل موظف", "Sheet + payslips")}</option>
              <option value="receipts">{t("الكشف + إيصالات المصروف", "Sheet + receipts (paid)")}</option>
              <option value="both">{t("الكشف + القسيمة + الإيصال", "Sheet + payslips + receipts")}</option>
            </select>
            <select name="status" className={`${fieldClass} w-full`} defaultValue="all">
              <option value="all">{t("كل الحالات", "All statuses")}</option>
              <option value="paid">{t("المصروف فقط", "Paid only")}</option>
              <option value="unpaid">{t("غير المصروف فقط", "Unpaid only")}</option>
            </select>
            <button type="submit" className={secondaryBtn}>
              {t(`طباعة كشف ${scope}`, `Print ${scope}`)}
            </button>
          </form>
          <p className="text-xs text-slate-400">
            {t("لطباعة كشف موظف واحد افتح ملفه ← تبويب الرواتب.", "For one employee, open their profile → Salaries tab.")}
          </p>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-start text-xs font-semibold text-slate-500">
              <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-3 text-start">{t("صاحب العمل", "Employer")}</th>
              <th className="px-4 py-3 text-start">{t("الأساسي", "Basic")}</th>
              <th className="px-4 py-3 text-start">{t("البدلات", "Allowances")}</th>
              <th className="px-4 py-3 text-start">{t("الخصومات", "Deductions")}</th>
              <th className="px-4 py-3 text-start">{t("الصافي", "Net")}</th>
              <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {salaries.map((salary) => {
              const allowances = round3(salary.housingAllowance + salary.transportAllowance + salary.otherAllowance);
              const deductions = round3(salary.absenceDeduction + salary.otherDeduction);
              const live = liveDays.get(salary.employeeId) ?? 0;
              const stale = !salary.paid && round3(live) !== round3(salary.absenceDays);
              const name = lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName;
              const employerName = lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName;
              return (
                <tr key={salary.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-slate-500">
                      {salary.employeeNumber} · {t("غياب", "Absence")} {daysLabel(salary.absenceDays)}
                      {stale ? t(" · تغيّر الغياب", " · absence changed") : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {salary.employerId ? (
                      <Link href={`/employers/${salary.employerId}`} className="text-teal-800 hover:underline">
                        {employerName}
                      </Link>
                    ) : (
                      employerName || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{money(salary.basicSalary, currency)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{money(allowances, currency)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{money(deductions, currency)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold">{money(salary.netSalary, currency)}</td>
                  <td className="px-4 py-3">
                    <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link className="font-semibold text-teal-800" href={`/salaries/${salary.id}`}>
                      {salary.paid || !(allow.pay || allow.edit) ? t("عرض", "View") : allow.pay ? t("صرف", "Pay") : t("تعديل", "Edit")}
                    </Link>
                    <Link className="ms-3 font-semibold text-slate-700" href={`/salaries/${salary.id}/print?doc=slip`}>
                      {t("القسيمة", "Payslip")}
                    </Link>
                    {salary.paid ? (
                      <Link className="ms-3 font-semibold text-slate-700" href={`/salaries/${salary.id}/print?doc=receipt`}>
                        {t("إيصال", "Receipt")}
                      </Link>
                    ) : null}
                    {!salary.paid && allow.remove ? (
                      <span className="ms-3 inline-block">
                        <DeleteButton
                          action={deleteUnpaidSalary}
                          fields={{ id: salary.id }}
                          confirm={t(`حذف مسير ${name} غير المصروف؟`, `Delete the unpaid record of ${name}?`)}
                        />
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {salaries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {t("لا توجد رواتب لهذا الشهر. اضغط إنشاء الرواتب.", "No salaries for this month. Click Generate payroll.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
