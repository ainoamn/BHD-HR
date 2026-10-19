import Link from "next/link";
import { AlertTriangle, Banknote, CheckCircle2, Download, FileText, HandCoins, Info, Printer, ShieldAlert, Sparkles, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { Flash } from "@/components/flash";
import { PeriodFilter } from "@/components/period-filter";
import { DeleteButton } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, SectionTitle, Stat, ToneBadge, fieldClass, linkAction, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { PAYMENT_LABEL, monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { countAbsenceDays } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { payrollIssues } from "@/lib/payroll-check";
import { canEditPeriod, canPayPeriod, readStatus } from "@/lib/payroll-period";
import { PayrollPeriodBar } from "@/components/payroll-period-bar";
import { totalDeductions, totalEarnings } from "@/lib/salary";
import { daysLabel, money, readPeriod, round3, todayInputValue } from "@/lib/utils";
import { createSalary, deleteUnpaidSalary, generatePayroll, payAll } from "@/server/salary-actions";

const COLUMNS = ["name", "employer", "basic", "allow", "deduct", "net", "status"];

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    employerId?: string;
    sort?: string;
    dir?: string;
    fname?: string;
    femployer?: string;
    fbasic?: string;
    fallow?: string;
    fdeduct?: string;
    fnet?: string;
    fstatus?: string;
    error?: string;
    message?: string;
  }>;
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
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [payrollPeriod, salaries, activeCount, previousSalaries] = await Promise.all([
    prisma.payrollPeriod.findUnique({ where: { companyId_year_month: { companyId: user.companyId, year, month } } }),
    prisma.salary.findMany({
      where: { year, month, employee: { companyId: user.companyId }, ...employerFilter },
      include: { employee: true },
      orderBy: [{ employerName: "asc" }, { employeeName: "asc" }],
    }),
    prisma.employee.count({ where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, ...employerFilter } }),
    prisma.salary.findMany({ where: { companyId: user.companyId, ...previous, ...employerFilter }, select: { employeeId: true, netSalary: true } }),
  ]);
  const periodState = readStatus(payrollPeriod?.status);
  const editable = canEditPeriod(periodState);
  const payable = canPayPeriod(periodState, user.company.payrollApproval);
  const allow = {
    create: can(user, "salaries.create") && editable,
    edit: can(user, "salaries.edit") && editable,
    remove: can(user, "salaries.delete") && editable,
    pay: can(user, "salaries.pay") && payable,
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
  const activeWithout = await prisma.employee.count({
    where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] }, ...employerFilter, id: { notIn: [...withRecord] } },
  });
  const issues = payrollIssues({
    salaries,
    previousNet: new Map(previousSalaries.map((row) => [row.employeeId, row.netSalary])),
    liveAbsence: liveDays,
    withoutRecord: activeWithout,
    payer: { bankAccount: user.company.bankAccount, bankBic: user.company.bankBic },
    lang,
  });
  const spfTotals = {
    employee: round3(salaries.reduce((sum, row) => sum + row.spfEmployee, 0)),
    employer: round3(salaries.reduce((sum, row) => sum + row.spfEmployer, 0)),
  };
  const fileQuery = `year=${year}&month=${month}${employerId ? `&employerId=${employerId}` : ""}`;
  const totalNet = salaries.reduce((sum, row) => sum + row.netSalary, 0);
  const totalGross = salaries.reduce((sum, row) => sum + totalEarnings(row), 0);
  const totalDeduction = salaries.reduce((sum, row) => sum + totalDeductions(row), 0);
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
  const rows = salaries
    .map((salary) => ({
      salary,
      name: lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName,
      employerName: (lang === "en" && salary.employerNameEn ? salary.employerNameEn : salary.employerName) || "",
      allowances: round3(salary.housingAllowance + salary.transportAllowance + salary.otherAllowance + salary.extraEarnings),
      deductions: totalDeductions(salary),
      statusLabel: salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid"),
    }))
    .filter(
      (row) =>
        includesText(`${row.name} ${row.salary.employeeNumber}`, sp.fname) &&
        includesText(row.employerName, sp.femployer) &&
        includesText(`${row.salary.basicSalary} ${money(row.salary.basicSalary, currency)}`, sp.fbasic) &&
        includesText(`${row.allowances} ${money(row.allowances, currency)}`, sp.fallow) &&
        includesText(`${row.deductions} ${money(row.deductions, currency)}`, sp.fdeduct) &&
        includesText(`${row.salary.netSalary} ${money(row.salary.netSalary, currency)}`, sp.fnet) &&
        includesText(row.statusLabel, sp.fstatus),
    );
  const { sort, dir } = readSort(sp, COLUMNS, "name");
  const locale = lang === "en" ? "en" : "ar";
  rows.sort((a, b) => {
    if (!sp.sort) return 0; // keep the database order (employer, then employee)
    if (sort === "employer") return compareText(a.employerName, b.employerName, dir, locale);
    if (sort === "basic") return compareNumber(a.salary.basicSalary, b.salary.basicSalary, dir);
    if (sort === "allow") return compareNumber(a.allowances, b.allowances, dir);
    if (sort === "deduct") return compareNumber(a.deductions, b.deductions, dir);
    if (sort === "net") return compareNumber(a.salary.netSalary, b.salary.netSalary, dir);
    if (sort === "status") return compareText(a.statusLabel, b.statusLabel, dir, locale);
    return compareText(a.name, b.name, dir, locale);
  });
  const stats = [
    { label: t("المسيرات", "Records"), value: String(salaries.length), icon: FileText, tone: "navy" as const },
    { label: t("الإجمالي", "Gross"), value: money(totalGross, currency), icon: TrendingUp, tone: "teal" as const },
    { label: t("الخصومات", "Deductions"), value: money(totalDeduction, currency), icon: TrendingDown, tone: "red" as const },
    { label: t("الصافي", "Net"), value: money(totalNet, currency), icon: Wallet, tone: "gold" as const },
  ];
  const step = (number: number, title: string, Icon: typeof Wallet) => (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{t(`الخطوة ${number}`, `Step ${number}`)}</p>
        <h2 className="font-bold leading-tight text-slate-900">{title}</h2>
      </div>
    </div>
  );

  return (
    <div className="page-wide">
      <PageHeader
        icon={Banknote}
        title={t("الرواتب", "Payroll")}
        description={t(
          `مسير ${monthName(month, "ar")} ${year} — ${scope}. إنشاء الرواتب ينسخ راتب الموظف الحالي ولا يغيّر الشهور السابقة.`,
          `${monthName(month, "en")} ${year} payroll — ${scope}. Generating copies each employee's current salary and never changes past months.`,
        )}
      >
        <PeriodFilter year={year} month={month} employers={employers} employerId={employerId} />
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-bold text-slate-900">{t("معالج شهر الرواتب", "Payroll month")}</h2>
        <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            { n: "1", label: t("راجع الغياب والإضافي", "Review absence and overtime"), href: `/attendance?year=${year}&month=${month}`, done: true },
            { n: "2", label: t("أنشئ المسير", "Generate payroll"), href: "#generate", done: salaries.length > 0 },
            { n: "3", label: t("راجع الملاحظات والحسابات", "Review issues and bank accounts"), href: "#check", done: salaries.length > 0 && !issues.some((issue) => issue.level === "danger") },
            { n: "4", label: t("راجع الحماية وملف البنك", "Review social protection and the bank file"), href: `/salaries/review?${fileQuery}`, done: salaries.length > 0 && !issues.some((issue) => issue.level === "danger") },
            { n: "5", label: t("ملف البنك WPS", "Bank file (WPS)"), href: issues.some((issue) => issue.level === "danger") ? "#check" : `/salaries/wps?${fileQuery}`, done: unpaid.length === 0 && salaries.length > 0 },
            { n: "6", label: t("اعتماد وقفل الشهر", "Approve and lock the month"), href: "#period", done: periodState === "LOCKED" },
          ].map((item) => (
            <li key={item.n}>
              <Link href={item.href} className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>{item.n}</span>
                <span className="min-w-0">{item.label}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          <Link href={`/salaries/journal?${fileQuery}`} className="font-semibold text-teal-800 underline">
            {t("تصدير قيد محاسبي CSV", "Export an accounting journal CSV")}
          </Link>
        </p>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((item) => (
          <Stat key={item.label} label={item.label} value={item.value} icon={item.icon} tone={item.tone} />
        ))}
      </div>

      <div id="period" className="scroll-mt-24">
      <PayrollPeriodBar
        period={payrollPeriod}
        year={year}
        month={month}
        employerId={employerId}
        approvalRequired={user.company.payrollApproval}
        allow={{ edit: can(user, "salaries.edit"), pay: can(user, "salaries.pay"), admin: user.role === "ADMIN" }}
        unpaidCount={await prisma.salary.count({ where: { companyId: user.companyId, year, month, paid: false } })}
        salaryCount={await prisma.salary.count({ where: { companyId: user.companyId, year, month } })}
        lang={lang}
      />
      </div>

      {unpaid.length ? (
        <Card id="check" className="mb-4 scroll-mt-24 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              {issues.some((issue) => issue.level !== "info") ? <ShieldAlert size={18} className="text-amber-600" /> : <CheckCircle2 size={18} className="text-emerald-600" />}
              {t("مراجعة قبل الصرف", "Check before paying")}
            </h2>
            <span className="text-xs text-slate-500">
              {issues.some((issue) => issue.level !== "info")
                ? t(`${issues.filter((issue) => issue.level !== "info").length} ملاحظة تحتاج نظرة`, `${issues.filter((issue) => issue.level !== "info").length} item(s) to look at`)
                : t("لا ملاحظات على الرواتب غير المصروفة", "Nothing unusual in the unpaid salaries")}
            </span>
          </div>
          {issues.length ? (
            <ul className="space-y-1.5 text-sm">
              {issues.slice(0, 12).map((issue, index) => {
                const Icon = issue.level === "info" ? Info : AlertTriangle;
                const tone = issue.level === "danger" ? "bg-red-50 text-red-800 ring-red-100" : issue.level === "warning" ? "bg-amber-50 text-amber-900 ring-amber-100" : "bg-slate-50 text-slate-700 ring-slate-100";
                const body = (
                  <>
                    <Icon size={15} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 break-words">{issue.text}</span>
                  </>
                );
                return (
                  <li key={index}>
                    {issue.href ? (
                      <Link href={issue.href} className={`flex items-start gap-2 rounded-xl px-3 py-2 ring-1 ring-inset transition hover:brightness-95 ${tone}`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={`flex items-start gap-2 rounded-xl px-3 py-2 ring-1 ring-inset ${tone}`}>{body}</div>
                    )}
                  </li>
                );
              })}
              {issues.length > 12 ? <li className="px-3 text-xs text-slate-500">{t(`و${issues.length - 12} ملاحظة أخرى`, `and ${issues.length - 12} more`)}</li> : null}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card id="generate" className="scroll-mt-24 space-y-4">
          {step(1, t("إنشاء الرواتب", "Generate payroll"), Sparkles)}
          <p className="text-sm leading-6 text-slate-600">
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
                <SubmitButton className="w-full">
                  <Sparkles size={16} />
                  {t(`إنشاء رواتب ${scope}`, `Generate for ${scope}`)}
                </SubmitButton>
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
            <p className="text-xs text-slate-400">
              {editable ? t("لا تملك صلاحية إنشاء الرواتب.", "You cannot create salaries.") : t("المسير ليس مسودة؛ أعده إلى مسودة لإضافة رواتب.", "The payroll is not a draft; return it to draft to add salaries.")}
            </p>
          )}
        </Card>

        <Card className="space-y-4">
          {step(2, t("صرف الكل", "Pay all"), HandCoins)}
          <p className="text-sm leading-6 text-slate-600">
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
                <input className={`${fieldClass} w-full`} type="date" name="paidAt" defaultValue={todayInputValue()} required aria-label={t("تاريخ الصرف", "Payment date")} />
                <input className={`${fieldClass} w-full`} name="paymentReference" placeholder={t("رقم العملية (اختياري)", "Reference (optional)")} />
              </div>
              <SubmitButton className="w-full" pendingLabel={t("جارٍ الصرف...", "Paying...")}>
                <HandCoins size={16} />
                {t(`صرف ${unpaid.length} راتب`, `Pay ${unpaid.length} salaries`)}
              </SubmitButton>
            </form>
          ) : unpaid.length && can(user, "salaries.pay") && !payable ? (
            <p className="text-xs leading-5 text-amber-800">
              {periodState === "LOCKED"
                ? t("الشهر مقفل.", "The month is locked.")
                : t("الصرف متاح بعد اعتماد المسير من الأعلى.", "Payment opens once the payroll is approved above.")}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-4">
          {step(3, t("الطباعة", "Print"), Printer)}
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
            <button type="submit" className={`${secondaryBtn} w-full`}>
              <Printer size={16} />
              {t(`طباعة كشف ${scope}`, `Print ${scope}`)}
            </button>
          </form>
          <p className="text-xs text-slate-400">
            {t("لطباعة كشف موظف واحد افتح ملفه ← تبويب الرواتب.", "For one employee, open their profile → Salaries tab.")}
          </p>
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {allow.pay && salaries.length ? (
              <a href={`/salaries/wps?${fileQuery}`} className={`${secondaryBtn} w-full`}>
                <Download size={16} />
                {t("ملف تحويل الرواتب (WPS)", "Salary transfer file (WPS)")}
              </a>
            ) : null}
            {salaries.length ? (
              <a href={`/salaries/spf?year=${year}&month=${month}`} className={`${secondaryBtn} w-full`}>
                <Download size={16} />
                {t("اشتراكات الحماية الاجتماعية", "Social protection contributions")}
              </a>
            ) : null}
            {user.company.spfEnabled && salaries.length ? (
              <p className="text-xs leading-5 text-slate-500">
                {t(
                  `هذا الشهر: حصة الموظفين ${money(spfTotals.employee, currency)} (مخصومة)، حصة المنشأة ${money(spfTotals.employer, currency)}.`,
                  `This month: employees ${money(spfTotals.employee, currency)} (deducted), company ${money(spfTotals.employer, currency)}.`,
                )}
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <SectionTitle hint={t(`${salaries.length} مسير في ${monthName(month, lang)} ${year}`, `${salaries.length} record(s) in ${monthName(month, lang)} ${year}`)}>
        {t("مسير الشهر", "Month payroll")}
      </SectionTitle>
      <div className="table-shell">
        <table className="table-stack table-tools min-w-full text-sm">
          <thead>
            <tr>
              <ColumnHead column="name" label={t("الموظف", "Employee")} />
              <ColumnHead column="employer" label={t("صاحب العمل", "Employer")} />
              <ColumnHead column="basic" label={t("الأساسي", "Basic")} />
              <ColumnHead column="allow" label={t("البدلات والإضافات", "Allowances & additions")} />
              <ColumnHead column="deduct" label={t("الخصومات", "Deductions")} />
              <ColumnHead column="net" label={t("الصافي", "Net")} />
              <ColumnHead column="status" label={t("الحالة", "Status")} />
              <th className="px-4 py-3 text-end">{t("إجراءات", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ salary, name, employerName, allowances, deductions }) => {
              const live = liveDays.get(salary.employeeId) ?? 0;
              const stale = !salary.paid && round3(live) !== round3(salary.absenceDays);
              return (
                <tr key={salary.id}>
                  <td className="cell-title px-4 py-3">
                    <Link href={`/salaries/${salary.id}`} className="block font-semibold text-slate-900 hover:text-teal-700">
                      {name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      <span className="tabular">{salary.employeeNumber}</span> · {t("غياب", "Absence")} {daysLabel(salary.absenceDays)}
                      {stale ? <span className="font-semibold text-amber-700">{t(" · تغيّر الغياب", " · absence changed")}</span> : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3" data-label={t("صاحب العمل", "Employer")}>
                    {salary.employerId ? (
                      <Link href={`/employers/${salary.employerId}`} className="hover:text-teal-700">
                        {employerName}
                      </Link>
                    ) : (
                      employerName || "—"
                    )}
                  </td>
                  <td className="tabular px-4 py-3 whitespace-nowrap" data-label={t("الأساسي", "Basic")}>
                    {money(salary.basicSalary, currency)}
                  </td>
                  <td className="tabular px-4 py-3 whitespace-nowrap text-teal-700" data-label={t("البدلات والإضافات", "Allowances & additions")}>
                    {money(allowances, currency)}
                  </td>
                  <td className="tabular px-4 py-3 whitespace-nowrap text-red-700" data-label={t("الخصومات", "Deductions")}>
                    {money(deductions, currency)}
                  </td>
                  <td className="tabular px-4 py-3 whitespace-nowrap font-bold text-slate-900" data-label={t("الصافي", "Net")}>
                    {money(salary.netSalary, currency)}
                  </td>
                  <td className="px-4 py-3" data-label={t("الحالة", "Status")}>
                    <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                  </td>
                  <td className="cell-actions px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:justify-end">
                      <Link className={linkAction} href={`/salaries/${salary.id}`}>
                        {salary.paid || !(allow.pay || allow.edit) ? t("عرض", "View") : allow.pay ? t("صرف", "Pay") : t("تعديل", "Edit")}
                      </Link>
                      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-900" href={`/salaries/${salary.id}/print?doc=slip`}>
                        {t("القسيمة", "Payslip")}
                      </Link>
                      {salary.paid ? (
                        <Link className="text-sm font-semibold text-slate-600 hover:text-slate-900" href={`/salaries/${salary.id}/print?doc=receipt`}>
                          {t("إيصال", "Receipt")}
                        </Link>
                      ) : null}
                      {!salary.paid && allow.remove ? (
                        <DeleteButton
                          action={deleteUnpaidSalary}
                          fields={{ id: salary.id }}
                          confirm={t(`حذف مسير ${name} غير المصروف؟`, `Delete the unpaid record of ${name}?`)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {salaries.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200">
              <Banknote size={22} />
            </span>
            <p className="mt-3 text-sm text-slate-500">{t("لا توجد رواتب لهذا الشهر. اضغط إنشاء الرواتب.", "No salaries for this month. Click Generate payroll.")}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("لا توجد رواتب تطابق البحث.", "No salaries match the filters.")}</p>
        ) : null}
      </div>
    </div>
  );
}
