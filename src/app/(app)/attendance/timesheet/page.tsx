import Link from "next/link";
import { CalendarClock, CheckCheck, Settings2, Timer } from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { Flash } from "@/components/flash";
import { PeriodFilter } from "@/components/period-filter";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, Stat, ToneBadge, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { monthName } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { monthTimesheet } from "@/lib/timesheet";
import { money, readPeriod, round3 } from "@/lib/utils";
import { hoursLabel } from "@/lib/work-time";
import { approveTimesheets, withdrawTimesheet } from "@/server/work-actions";

export const dynamic = "force-dynamic";

const COLS = ["name", "days", "late", "early", "otday", "otnight", "otrest", "amount", "status"] as const;

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; sort?: string; dir?: string; fname?: string; fdays?: string; flate?: string; fearly?: string; fotday?: string; fotnight?: string; fotrest?: string; famount?: string; fstatus?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("attendance.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const rows = await monthTimesheet(user.companyId, year, month);
  const canApprove = can(user, "salaries.edit");
  const currency = user.company.currency;
  const withHours = rows.filter((row) => row.figures.days > 0);
  const pending = withHours.filter((row) => !row.approved && row.schedule);
  const noSchedule = rows.filter((row) => !row.schedule).length;
  const totals = withHours.reduce(
    (sum, row) => ({
      overtime: sum.overtime + row.figures.overtimeDay + row.figures.overtimeNight + row.figures.overtimeRest,
      late: sum.late + row.figures.lateMinutes + row.figures.earlyLeaveMinutes,
      amount: round3(sum.amount + (row.approved ? row.approved.overtimeAmount : row.amounts.overtime)),
    }),
    { overtime: 0, late: 0, amount: 0 },
  );
  const name = (row: (typeof rows)[number]) => (lang === "en" && row.nameEn ? row.nameEn : row.fullName);
  const minutes = (value: number) => (value ? hoursLabel(value) : "—");
  const statusOf = (row: (typeof rows)[number]) =>
    row.approved ? t("معتمد", "Approved") : !row.schedule ? t("بلا جدول", "No schedule") : t("بانتظار الاعتماد", "Awaiting approval");
  const amountOf = (row: (typeof rows)[number]) => (row.approved ? row.approved.overtimeAmount : row.amounts.overtime) - (row.approved ? row.approved.latenessAmount : row.amounts.lateness);
  const { sort, dir } = readSort(sp, [...COLS], "name");
  const listed = withHours
    .filter((row) => {
      const overtime = row.approved ? row.approved.overtimeAmount : row.amounts.overtime;
      const lateness = row.approved ? row.approved.latenessAmount : row.amounts.lateness;
      return (
        includesText(name(row), sp.fname) &&
        includesText(String(row.figures.days), sp.fdays) &&
        includesText(minutes(row.figures.lateMinutes), sp.flate) &&
        includesText(minutes(row.figures.earlyLeaveMinutes), sp.fearly) &&
        includesText(minutes(row.figures.overtimeDay), sp.fotday) &&
        includesText(minutes(row.figures.overtimeNight), sp.fotnight) &&
        includesText(minutes(row.figures.overtimeRest), sp.fotrest) &&
        includesText(`${overtime} ${lateness} ${money(overtime, currency)} ${money(lateness, currency)}`, sp.famount) &&
        includesText(statusOf(row), sp.fstatus)
      );
    })
    .sort((a, b) => {
      if (sort === "days") return compareNumber(a.figures.days, b.figures.days, dir);
      if (sort === "late") return compareNumber(a.figures.lateMinutes, b.figures.lateMinutes, dir);
      if (sort === "early") return compareNumber(a.figures.earlyLeaveMinutes, b.figures.earlyLeaveMinutes, dir);
      if (sort === "otday") return compareNumber(a.figures.overtimeDay, b.figures.overtimeDay, dir);
      if (sort === "otnight") return compareNumber(a.figures.overtimeNight, b.figures.overtimeNight, dir);
      if (sort === "otrest") return compareNumber(a.figures.overtimeRest, b.figures.overtimeRest, dir);
      if (sort === "amount") return compareNumber(amountOf(a), amountOf(b), dir);
      if (sort === "status") return compareText(statusOf(a), statusOf(b), dir, lang === "en" ? "en" : "ar");
      return compareText(name(a), name(b), dir, lang === "en" ? "en" : "ar");
    });

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={Timer}
        title={t(`ساعات ${monthName(month, "ar")} ${year}`, `Hours — ${monthName(month, "en")} ${year}`)}
        description={t(
          "التأخير والخروج المبكر والعمل الإضافي محسوبة من تسجيل الحضور في البوابة وجدول دوام كل موظف. اعتمادها يضيف الإضافي (والخصم إن كان مفعّلاً) إلى راتب الشهر، أو أول شهر مفتوح إن كان مسيره مقفلاً.",
          "Lateness, early leave and overtime worked out from portal clock-ins and each employee's schedule. Approving adds the overtime (and the deduction, if on) to the month's salary, or the first open month if its payroll is closed.",
        )}
      >
        <PeriodFilter year={year} month={month} />
        {user.role === "ADMIN" ? (
          <Link href="/settings/work" className={secondaryBtn}>
            <Settings2 size={16} />
            {t("الجداول والأجور", "Schedules & rates")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("سجّلوا حضوراً", "Clocked in")} value={String(withHours.length)} tone="teal" />
        <Stat label={t("ساعات إضافية", "Overtime hours")} value={hoursLabel(totals.overtime)} tone="gold" />
        <Stat label={t("تأخير وخروج مبكر", "Late & early leave")} value={hoursLabel(totals.late)} tone="red" />
        <Stat label={t("أجر الإضافي", "Overtime pay")} value={money(totals.amount, currency)} tone="navy" />
      </div>

      {noSchedule ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          {t(
            `${noSchedule} موظف بلا جدول دوام فلا تُحسب ساعاتهم. حدّد جدولاً افتراضياً من إعدادات الدوام أو جدولاً في ملف الموظف.`,
            `${noSchedule} employee(s) have no schedule, so their hours are not worked out. Set a default schedule or one in the employee's file.`,
          )}
        </p>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{t("الموظفون", "Employees")}</h2>
          {canApprove && pending.length ? (
            <form action={approveTimesheets}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <SubmitButton confirm={t(`اعتماد ساعات ${pending.length} موظف وإضافتها إلى الرواتب؟`, `Approve ${pending.length} timesheet(s) and add them to pay?`)}>
                <CheckCheck size={16} />
                {t(`اعتماد الكل (${pending.length})`, `Approve all (${pending.length})`)}
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {withHours.length ? (
          <div className="table-shell overflow-x-auto">
            <table className="table-stack table-tools w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <ColumnHead column="name" label={t("الموظف", "Employee")} />
                  <ColumnHead column="days" label={t("الأيام", "Days")} />
                  <ColumnHead column="late" label={t("تأخير", "Late")} />
                  <ColumnHead column="early" label={t("خروج مبكر", "Early leave")} />
                  <ColumnHead column="otday" label={t("إضافي نهاري", "Day OT")} />
                  <ColumnHead column="otnight" label={t("إضافي ليلي", "Night OT")} />
                  <ColumnHead column="otrest" label={t("يوم راحة", "Rest day")} />
                  <ColumnHead column="amount" label={t("المبلغ", "Amount")} />
                  <ColumnHead column="status" label={t("الحالة", "Status")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listed.map((row) => {
                  const overtime = row.approved ? row.approved.overtimeAmount : row.amounts.overtime;
                  const lateness = row.approved ? row.approved.latenessAmount : row.amounts.lateness;
                  return (
                    <tr key={row.employeeId}>
                      <td className="px-3 py-2.5">
                        <Link href={`/employees/${row.employeeId}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                          {name(row)}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {row.schedule ? (lang === "en" && row.schedule.nameEn ? row.schedule.nameEn : row.schedule.name) : t("بلا جدول", "No schedule")}
                          {row.openDays ? t(` · ${row.openDays} يوم بلا انصراف`, ` · ${row.openDays} day(s) without clock-out`) : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">{row.figures.days}</td>
                      <td className="px-3 py-2.5" dir="ltr">{minutes(row.figures.lateMinutes)}</td>
                      <td className="px-3 py-2.5" dir="ltr">{minutes(row.figures.earlyLeaveMinutes)}</td>
                      <td className="px-3 py-2.5" dir="ltr">{minutes(row.figures.overtimeDay)}</td>
                      <td className="px-3 py-2.5" dir="ltr">{minutes(row.figures.overtimeNight)}</td>
                      <td className="px-3 py-2.5" dir="ltr">{minutes(row.figures.overtimeRest)}</td>
                      <td className="px-3 py-2.5">
                        {overtime ? <span className="block font-semibold text-emerald-700">+{money(overtime, currency)}</span> : null}
                        {lateness ? <span className="block font-semibold text-red-700">−{money(lateness, currency)}</span> : null}
                        {!overtime && !lateness ? <span className="text-slate-400">—</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.approved ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <ToneBadge tone="green">{t("معتمد", "Approved")}</ToneBadge>
                            {canApprove ? (
                              <form action={withdrawTimesheet}>
                                <input type="hidden" name="id" value={row.approved.id} />
                                <SubmitButton variant="link" confirm={t("إلغاء الاعتماد وحذف بنوده من الراتب؟", "Withdraw the approval and remove its pay items?")}>
                                  {t("إلغاء", "Withdraw")}
                                </SubmitButton>
                              </form>
                            ) : null}
                          </div>
                        ) : !row.schedule ? (
                          <ToneBadge tone="slate">{t("بلا جدول", "No schedule")}</ToneBadge>
                        ) : canApprove ? (
                          <form action={approveTimesheets}>
                            <input type="hidden" name="year" value={year} />
                            <input type="hidden" name="month" value={month} />
                            <input type="hidden" name="employeeId" value={row.employeeId} />
                            <SubmitButton variant="secondary" className="min-h-9 px-3 py-1.5">
                              {t("اعتماد", "Approve")}
                            </SubmitButton>
                          </form>
                        ) : (
                          <ToneBadge tone="amber">{t("بانتظار الاعتماد", "Awaiting approval")}</ToneBadge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!listed.length ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">{t("لا نتائج تطابق بحث الأعمدة.", "No rows match the column filters.")}</p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title={t("لا تسجيلات حضور في هذا الشهر", "No clock-ins this month")}
            text={t("تظهر هنا ساعات من يسجّل حضوره من البوابة.", "Hours of employees who clock in from the portal show here.")}
          />
        )}
      </Card>
    </div>
  );
}
