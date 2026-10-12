import Link from "next/link";
import { Suspense } from "react";
import { DailyBriefCard, DailyBriefSkeleton } from "@/components/daily-brief";
import { ArrowLeft, ArrowRight, Banknote, BookUser, CalendarDays, CalendarX2, CircleDollarSign, FileClock, FileWarning, Hourglass, PieChart, UserPlus, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { Card, SectionTitle, Stat, ToneBadge, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { getAlerts } from "@/lib/alerts";
import { can, requireUser } from "@/lib/auth";
import { monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { salaryDayWeight } from "@/lib/leave";
import { cn, currentPeriod, daysLabel, formatLongDate, money, monthRange, round3 } from "@/lib/utils";

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
    addAttendance: can(user, "attendance.create"),
    documents: can(user, "documents.view"),
    reports: can(user, "reports.view"),
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
  const paidNet = salaries.filter((row) => row.paid).reduce((sum, row) => sum + row.netSalary, 0);
  const unpaid = salaries.filter((row) => !row.paid).length;
  const paidShare = salaries.length ? Math.round(((salaries.length - unpaid) / salaries.length) * 100) : 0;
  const docs = alerts.filter((item) => item.id.startsWith("doc-") || item.id.startsWith("extra-")).slice(0, 6);
  const absences = alerts.filter((item) => item.id.startsWith("att-")).slice(0, 5);
  const urgent = alerts.filter((item) => item.severity === "danger").length;
  const currency = user.company.currency;
  const monthLabel = monthName(month, lang);
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;
  const payrollHref = `/salaries?year=${year}&month=${month}`;
  const Arrow = lang === "en" ? ArrowRight : ArrowLeft;
  const firstName = user.name.split(/\s+/)[0] || user.name;

  const quick = [
    allow.addEmployee ? { href: "/employees/new", label: t("إضافة موظف", "Add employee"), icon: UserPlus } : null,
    allow.addAttendance ? { href: "/attendance", label: t("تسجيل غياب", "Record absence"), icon: CalendarDays } : null,
    allow.salaries ? { href: payrollHref, label: t("رواتب الشهر", "This month's payroll"), icon: Banknote } : null,
    allow.reports ? { href: "/reports", label: t("التقارير", "Reports"), icon: PieChart } : null,
  ].filter((item): item is { href: string; label: string; icon: typeof UserPlus } => Boolean(item));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative animate-fade-up overflow-hidden rounded-3xl bg-slate-900 px-5 py-6 text-white shadow-raised sm:px-8 sm:py-8">
        <div className="higher-horizon pointer-events-none absolute -bottom-6 end-0 h-48 w-80 bg-[length:100%] opacity-[0.07]" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-24 start-1/3 size-72 rounded-full bg-teal-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/55 sm:text-sm">{formatLongDate(lang)}</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
              {t(`أهلاً بك، ${firstName}`, `Welcome back, ${firstName}`)}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-white/65">
              {t(`${companyName} — ملخص ${monthLabel} ${year}`, `${companyName} — ${monthLabel} ${year} at a glance`)}
              {urgent > 0 ? (
                <>
                  {" · "}
                  <Link href="/notifications" className="font-semibold text-gold-300 underline-offset-4 hover:underline">
                    {t(`${urgent} تنبيه عاجل`, `${urgent} urgent alert(s)`)}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          {allow.salaries ? (
            <div className="min-w-0 rounded-2xl bg-white/[0.07] px-5 py-4 ring-1 ring-inset ring-white/10 lg:min-w-72">
              <p className="text-xs text-white/55">{t(`صافي رواتب ${monthLabel}`, `${monthLabel} net payroll`)}</p>
              <p className="tabular mt-1 truncate text-2xl font-bold tracking-tight">{money(net, currency)}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${paidShare}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/55">
                {salaries.length
                  ? t(`صُرف ${salaries.length - unpaid} من ${salaries.length} · ${money(paidNet, currency)}`, `Paid ${salaries.length - unpaid} of ${salaries.length} · ${money(paidNet, currency)}`)
                  : t("لم يُنشأ مسير هذا الشهر بعد", "This month's payroll is not generated yet")}
              </p>
            </div>
          ) : null}
        </div>
        {quick.length ? (
          <div className="relative mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {quick.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition duration-150 active:scale-[0.98]",
                    index === 0 ? "bg-white text-slate-900 hover:bg-sand-100" : "bg-white/[0.08] text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.14]",
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>

      <Flash error={sp.error} message={sp.message} />

      {totalCount > 0 ? (
        <Suspense fallback={<DailyBriefSkeleton lang={lang} />}>
          <DailyBriefCard user={user} lang={lang} />
        </Suspense>
      ) : null}

      {totalCount === 0 && allow.addEmployee ? (
        <Card>
          <SectionTitle hint={t("أربع خطوات لتشغيل النظام", "Four steps to get going")}>{t("ابدأ من هنا", "Start here")}</SectionTitle>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("أضف صاحب العمل (الكفيل) في دفتر العناوين.", "Add the employer (sponsor) in the Address book."), "/employers?new=1#new"],
              [t("أضف الموظف ببياناته الكاملة واربطه بالكفيل.", "Add the employee with full details and link them to the sponsor."), "/employees/new"],
              [t("سجّل الغياب أو الإجازة عند حدوثها.", "Record absence or leave as it happens."), "/attendance"],
              [t("أنشئ رواتب الشهر ثم اصرفها واطبع الإيصالات.", "Generate the month's payroll, pay it and print receipts."), payrollHref],
            ].map(([label, href], index) => (
              <li key={href}>
                <Link href={href} className="flex h-full gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-200 hover:bg-teal-50/40">
                  <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{index + 1}</span>
                  <span className="text-sm leading-6 text-slate-700">{label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {allow.employees ? (
          <Stat
            label={t("موظفون نشطون", "Active employees")}
            value={String(activeCount)}
            hint={t(`${totalCount} في السجل · ${employerCount} صاحب عمل`, `${totalCount} on record · ${employerCount} employer(s)`)}
            href="/employees"
            icon={Users}
          />
        ) : null}
        {allow.salaries ? (
          <>
            <Stat
              label={t(`رواتب ${monthLabel}`, `${monthLabel} payroll`)}
              value={money(net, currency)}
              hint={salaries.length ? t(`${salaries.length} مسير`, `${salaries.length} record(s)`) : t("لم يُنشأ المسير بعد", "Not generated yet")}
              href={payrollHref}
              icon={CircleDollarSign}
              tone="gold"
            />
            <Stat
              label={t("بانتظار الصرف", "Awaiting payment")}
              value={String(unpaid)}
              hint={t("رواتب هذا الشهر", "This month's salaries")}
              href={payrollHref}
              icon={Hourglass}
              tone="amber"
              emphasis={unpaid > 0 ? "amber" : undefined}
            />
          </>
        ) : null}
        {allow.attendance ? (
          <Stat
            label={t("خصم هذا الشهر", "Deducted this month")}
            value={t(`${daysLabel(absenceDays)} يوم`, `${daysLabel(absenceDays)} days`)}
            hint={t("أيام تُخصم من الراتب", "Days deducted from salary")}
            href="/attendance"
            icon={CalendarX2}
            tone="navy"
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {allow.documents ? (
          <Card>
            <SectionTitle
              hint={t("أقرب الوثائق إلى الانتهاء", "Documents closest to expiry")}
              action={
                <Link href="/documents" className={linkAction}>
                  {t("الكل", "All")}
                  <Arrow size={15} />
                </Link>
              }
            >
              {t("مستندات ستنتهي", "Expiring documents")}
            </SectionTitle>
            {docs.length === 0 ? (
              <EmptyLine icon={FileClock} text={t("لا توجد مستندات قريبة من الانتهاء.", "No documents close to expiry.")} />
            ) : (
              <ul className="-mx-2 divide-y divide-slate-100">
                {docs.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-slate-50">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          item.severity === "danger" ? "bg-red-50 text-red-600" : item.severity === "warning" ? "bg-orange-50 text-orange-600" : "bg-navy-50 text-navy-500",
                        )}
                      >
                        <FileWarning size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="block truncate text-xs text-slate-500">{item.message}</span>
                      </span>
                      <ToneBadge tone={item.severity === "danger" ? "red" : item.severity === "warning" ? "orange" : "sky"}>
                        {item.severity === "danger" ? t("عاجل", "Urgent") : t("تنبيه", "Notice")}
                      </ToneBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
        {allow.attendance ? (
          <Card>
            <SectionTitle
              hint={t("الغياب المسجّل هذا الشهر", "Absence recorded this month")}
              action={
                <Link href="/attendance" className={linkAction}>
                  {t("الحضور", "Attendance")}
                  <Arrow size={15} />
                </Link>
              }
            >
              {t("تذكير الغياب", "Absence reminders")}
            </SectionTitle>
            {absences.length === 0 ? (
              <EmptyLine icon={CalendarDays} text={t("لا يوجد غياب مسجّل هذا الشهر.", "No absence recorded this month.")} />
            ) : (
              <ul className="-mx-2 divide-y divide-slate-100">
                {absences.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-slate-50">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <CalendarX2 size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="block truncate text-xs text-slate-500">{item.message}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      {allow.salaries ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-100">
              <Banknote size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900">{t(`رواتب ${monthLabel} ${year}`, `${monthLabel} ${year} payroll`)}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {t(`الصافي ${money(net, currency)} — غير المصروف ${unpaid}`, `Net ${money(net, currency)} — unpaid ${unpaid}`)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {allow.employers ? (
              <Link href="/employers" className={secondaryBtn}>
                <BookUser size={16} />
                {t("دفتر العناوين", "Address book")}
              </Link>
            ) : null}
            <Link href={payrollHref} className={cn(primaryBtn, !allow.employers && "col-span-2")}>
              {can(user, "salaries.pay") ? t("صرف الرواتب", "Pay salaries") : t("عرض الرواتب", "View payroll")}
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function EmptyLine({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
      <Icon size={18} className="shrink-0 text-slate-400" />
      {text}
    </div>
  );
}
