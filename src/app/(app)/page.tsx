import Link from "next/link";
import { Flash } from "@/components/flash";
import { Card, PageHeader, Stat, ToneBadge, primaryBtn, secondaryBtn } from "@/components/ui";
import { getAlerts } from "@/lib/alerts";
import { can, requireUser } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { salaryDayWeight } from "@/lib/leave";
import { currentPeriod, daysLabel, money, monthRange, round3 } from "@/lib/utils";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const allow = {
    employees: can(user, "employees.view"),
    addEmployee: can(user, "employees.create"),
    employers: can(user, "employers.view"),
    salaries: can(user, "salaries.view"),
    attendance: can(user, "attendance.view"),
    documents: can(user, "documents.view"),
  };
  const { year, month } = currentPeriod();
  const { start, end } = monthRange(year, month);
  const [activeCount, totalCount, employerCount, salaries, absenceCount, alerts] = await Promise.all([
    prisma.employee.count({ where: { companyId: user.companyId, status: "ACTIVE" } }),
    prisma.employee.count({ where: { companyId: user.companyId } }),
    prisma.employer.count({ where: { companyId: user.companyId } }),
    allow.salaries ? prisma.salary.findMany({ where: { year, month, employee: { companyId: user.companyId } } }) : Promise.resolve([]),
    allow.attendance
      ? prisma.attendance.findMany({
          where: { deductsSalary: true, date: { gte: start, lt: end }, employee: { companyId: user.companyId } },
          select: { type: true, deductsSalary: true },
        })
      : Promise.resolve([]),
    getAlerts(),
  ]);
  const absenceDays = round3(absenceCount.reduce((sum, row) => sum + salaryDayWeight(row), 0));
  const net = salaries.reduce((sum, row) => sum + row.netSalary, 0);
  const unpaid = salaries.filter((row) => !row.paid).length;
  const docs = alerts.filter((item) => item.id.startsWith("doc-") || item.id.startsWith("extra-")).slice(0, 6);
  const absences = alerts.filter((item) => item.id.startsWith("att-")).slice(0, 5);
  const currency = user.company.currency;
  const monthLabel = monthName(month, lang);
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;
  const payrollHref = `/salaries?year=${year}&month=${month}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("لوحة المعلومات", "Dashboard")} description={`${companyName} — ${monthLabel} ${year}`}>
        {allow.addEmployee ? (
          <Link href="/employees/new" className={primaryBtn}>
            {t("إضافة موظف", "Add employee")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      {totalCount === 0 && allow.addEmployee ? (
        <Card className="mb-6">
          <h2 className="text-lg font-bold">{t("ابدأ من هنا", "Start here")}</h2>
          <ol className="mt-3 space-y-2 text-sm leading-7 text-slate-600">
            <li>{t("1. أضف صاحب العمل (الكفيل) في دفتر العناوين.", "1. Add the employer (sponsor) in the Address book.")}</li>
            <li>{t("2. أضف الموظف ببياناته الكاملة واربطه بالكفيل.", "2. Add the employee with full details and link them to the sponsor.")}</li>
            <li>{t("3. سجّل الغياب أو الإجازة عند حدوثها.", "3. Record absence or leave as it happens.")}</li>
            <li>{t("4. أنشئ رواتب الشهر ثم اصرفها واطبع الإيصالات للتوقيع.", "4. Generate the month's payroll, pay it, and print receipts for signature.")}</li>
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {allow.employees ? (
          <Stat
            label={t("موظفون نشطون", "Active employees")}
            value={String(activeCount)}
            hint={t(`${totalCount} في السجل · ${employerCount} صاحب عمل`, `${totalCount} on record · ${employerCount} employer(s)`)}
            href="/employees"
          />
        ) : null}
        {allow.salaries ? (
          <>
            <Stat
              label={t(`رواتب ${monthLabel}`, `${monthLabel} payroll`)}
              value={money(net, currency)}
              hint={salaries.length ? t(`${salaries.length} مسير`, `${salaries.length} record(s)`) : t("لم يُنشأ المسير بعد", "Not generated yet")}
              href={payrollHref}
            />
            <Stat label={t("بانتظار الصرف", "Awaiting payment")} value={String(unpaid)} hint={t("رواتب هذا الشهر", "This month's salaries")} href={payrollHref} />
          </>
        ) : null}
        {allow.attendance ? (
          <Stat label={t("خصم هذا الشهر", "Deducted this month")} value={daysLabel(absenceDays)} hint={t("أيام تُخصم من الراتب", "Days deducted from salary")} href="/attendance" />
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {allow.documents ? (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">{t("مستندات ستنتهي", "Expiring documents")}</h2>
              <Link href="/documents" className="text-sm font-semibold text-teal-800">
                {t("الكل", "All")}
              </Link>
            </div>
            <div className="space-y-3">
              {docs.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد مستندات قريبة من الانتهاء.", "No documents close to expiry.")}</p> : null}
              {docs.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.message}</p>
                  </div>
                  <ToneBadge tone={item.severity === "danger" ? "red" : item.severity === "warning" ? "orange" : "sky"}>
                    {item.severity === "danger" ? t("عاجل", "Urgent") : t("تنبيه", "Notice")}
                  </ToneBadge>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
        {allow.attendance ? (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">{t("تذكير الغياب", "Absence reminders")}</h2>
              <Link href="/attendance" className="text-sm font-semibold text-teal-800">
                {t("الحضور", "Attendance")}
              </Link>
            </div>
            <div className="space-y-3">
              {absences.length === 0 ? <p className="text-sm text-slate-500">{t("لا يوجد غياب مسجّل هذا الشهر.", "No absence recorded this month.")}</p> : null}
              {absences.map((item) => (
                <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.message}</p>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      {allow.salaries ? (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">{t(`رواتب ${monthLabel} ${year}`, `${monthLabel} ${year} payroll`)}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t(`الصافي ${money(net, currency)} — غير المصروف ${unpaid}`, `Net ${money(net, currency)} — unpaid ${unpaid}`)}
            </p>
          </div>
          <div className="flex gap-2">
            {allow.employers ? (
              <Link href="/employers" className={secondaryBtn}>
                {t("دفتر العناوين", "Address book")}
              </Link>
            ) : null}
            <Link href={payrollHref} className={primaryBtn}>
              {can(user, "salaries.pay") ? t("صرف الرواتب", "Pay salaries") : t("عرض الرواتب", "View payroll")}
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
