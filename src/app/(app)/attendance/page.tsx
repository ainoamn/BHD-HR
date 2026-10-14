import Link from "next/link";
import { CalendarDays, CalendarRange, Timer, TriangleAlert } from "lucide-react";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { PeriodFilter } from "@/components/period-filter";
import { AttendanceEditForm, DeleteButton } from "@/components/row-forms";
import { Card, PageHeader, SectionTitle, ToneBadge } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { getI18n } from "@/lib/lang";
import {
  attendanceChoiceOf,
  attendanceChoices,
  attendanceLabel,
  computeLeaveBalances,
  groupAttendance,
  leaveName,
  leaveWarningText,
  leaveWarnings,
  remainingByKey,
  rowBalanceKey,
  rowDays,
  salaryDayWeight,
} from "@/lib/leave";
import { muscatDay, muscatTime, workedLabel } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { calendarDays, daysLabel, formatDate, monthRange, readPeriod, round3 } from "@/lib/utils";
import { deleteAttendance, markAttendance, updateAttendance } from "@/server/attendance-actions";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; day?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("attendance.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const { start, end } = monthRange(year, month);
  const clockDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : muscatDay(new Date());
  const clockDate = new Date(`${clockDay}T12:00:00Z`);
  const [employees, records, leaveTypes, clockEntries, dayAbsences] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      include: { attendance: true, leaveCredits: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, employee: { companyId: user.companyId } },
      include: { employee: true },
      orderBy: { date: "desc" },
    }),
    getLeaveTypes(user.companyId),
    prisma.clockEntry.findMany({ where: { companyId: user.companyId, day: clockDay } }),
    prisma.attendance.findMany({ where: { date: clockDate, employee: { companyId: user.companyId } }, select: { employeeId: true } }),
  ]);
  const showClock = user.company.clockEnabled || clockEntries.length > 0;
  const clockById = new Map(clockEntries.map((entry) => [entry.employeeId, entry]));
  const onLeave = new Set(dayAbsences.map((row) => row.employeeId));
  const displayName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const warnDays = user.company.leaveWarningDays;
  const figuresById = new Map(employees.map((employee) => [employee.id, computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes)]));
  const balances = Object.fromEntries(employees.map((employee) => [employee.id, remainingByKey(figuresById.get(employee.id)!)]));
  const leaveAlerts = employees
    .map((employee) => ({ employee, warnings: leaveWarnings(figuresById.get(employee.id)!, warnDays) }))
    .filter((item) => item.warnings.length > 0);
  const summary = employees.map((employee) => {
    const rows = records.filter((row) => row.employeeId === employee.id);
    return {
      employee,
      salaryDays: round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0)),
      used: Object.fromEntries(leaveTypes.map((type) => [type.key, round3(rows.reduce((sum, row) => (rowBalanceKey(row) === type.key ? sum + rowDays(row) : sum), 0))])),
    };
  });
  const choices = attendanceChoices(leaveTypes, lang);
  const periods = groupAttendance(records);
  const returnTo = `/attendance?year=${year}&month=${month}`;

  return (
    <div className="page-wide">
      <PageHeader
        icon={CalendarDays}
        title={t("الحضور والغياب", "Attendance & leave")}
        description={t(
          "اختر الفترة فيُحسب عدد الأيام مباشرة. الإجازة السنوية والمرضية والتعويضية تخصم من الرصيد ولا تخصم الراتب. الغياب والإجازة بخصم تخصم الراتب ولا تخصم الرصيد. يمكن تغيير خصم الراتب قبل الحفظ.",
          "Pick a period and the days are counted instantly. Annual, sick and compensatory leave use the balance, not the salary. Absence and unpaid leave deduct salary, not the balance. You can change the salary deduction before saving.",
        )}
      >
        <PeriodFilter year={year} month={month} />
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      {leaveAlerts.length ? (
        <div className="mb-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-800" role="alert">
          <TriangleAlert size={19} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
          <p className="font-bold">{t("موظفون تجاوزوا أو اقتربوا من نفاد إجازاتهم", "Employees over or close to their leave limit")}</p>
          <ul className="mt-1.5 space-y-1 text-sm leading-6">
            {leaveAlerts.map(({ employee, warnings }) => (
              <li key={employee.id}>
                <Link href={`/employees/${employee.id}?tab=attendance`} className="font-semibold underline">
                  {displayName(employee)}
                </Link>
                {" — "}
                {warnings.map((item) => leaveWarningText(item, lang)).join(" · ")}
              </li>
            ))}
          </ul>
          </div>
        </div>
      ) : null}
      {can(user, "attendance.create") ? (
        <Card className="mb-6">
          <SectionTitle hint={t("يُحسب عدد الأيام والرصيد المتبقي قبل الحفظ.", "Days and the remaining balance are counted before saving.")}>
            {t("تسجيل غياب أو إجازة", "Record absence or leave")}
          </SectionTitle>
          <LeaveRangeForm
            action={markAttendance}
            employees={employees.map((employee) => ({ id: employee.id, fullName: displayName(employee) }))}
            balances={balances}
            choices={choices}
            returnTo={returnTo}
            defaultType="ABSENT"
            warnDays={warnDays}
          />
        </Card>
      ) : null}

      {showClock ? (
        <Card id="clock" className="mb-6 scroll-mt-24">
          <SectionTitle
            hint={t(
              `${clockEntries.length} من ${employees.length} سجّلوا حضورهم من البوابة`,
              `${clockEntries.length} of ${employees.length} clocked in from the portal`,
            )}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <form method="get" className="flex items-center gap-2">
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />
                  <input type="date" name="day" defaultValue={clockDay} className="h-9 rounded-lg border border-slate-200 bg-surface px-2 text-sm" aria-label={t("اليوم", "Day")} />
                  <button type="submit" className="h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {t("عرض", "Show")}
                  </button>
                </form>
                <Link href={`/attendance/timesheet?year=${year}&month=${month}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800">
                  <Timer size={15} />
                  {t("الإضافي والتأخير", "Overtime & lateness")}
                </Link>
              </div>
            }
          >
            {t("سجل الدوام", "Clock-in log")} — {formatDate(clockDate)}
          </SectionTitle>
          <div className="table-shell">
            <table className="table-stack min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 text-start">{t("الموظف", "Employee")}</th>
                  <th className="px-4 py-2.5 text-start">{t("الحضور", "In")}</th>
                  <th className="px-4 py-2.5 text-start">{t("الانصراف", "Out")}</th>
                  <th className="px-4 py-2.5 text-start">{t("المدة", "Hours")}</th>
                  <th className="px-4 py-2.5 text-start">{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const entry = clockById.get(employee.id);
                  return (
                    <tr key={employee.id}>
                      <td className="cell-title px-4 py-2.5">
                        <Link href={`/employees/${employee.id}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                          {displayName(employee)}
                        </Link>
                      </td>
                      <td className="tabular px-4 py-2.5" data-label={t("الحضور", "In")}>
                        {entry ? muscatTime(entry.inAt) : "—"}
                        {entry?.inDistance != null ? <span className="ms-1 text-xs text-slate-400">({entry.inDistance} {t("م", "m")})</span> : null}
                      </td>
                      <td className="tabular px-4 py-2.5" data-label={t("الانصراف", "Out")}>
                        {entry?.outAt ? muscatTime(entry.outAt) : "—"}
                      </td>
                      <td className="tabular px-4 py-2.5" data-label={t("المدة", "Hours")}>
                        {entry ? workedLabel(entry.inAt, entry.outAt) : "—"}
                      </td>
                      <td className="px-4 py-2.5" data-label={t("الحالة", "Status")}>
                        {entry ? (
                          entry.lateMinutes ? (
                            <ToneBadge tone="amber">{t(`متأخر ${entry.lateMinutes} د`, `${entry.lateMinutes} min late`)}</ToneBadge>
                          ) : (
                            <ToneBadge tone="teal">{t("في الوقت", "On time")}</ToneBadge>
                          )
                        ) : onLeave.has(employee.id) ? (
                          <ToneBadge tone="slate">{t("غياب/إجازة مسجّلة", "Absence/leave recorded")}</ToneBadge>
                        ) : (
                          <span className="text-xs text-slate-400">{t("لم يسجّل", "Not clocked in")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <SectionTitle hint={t(`${calendarDays(year, month)} يوماً في الشهر`, `${calendarDays(year, month)} days in the month`)}>
        {t("ملخص الشهر", "Month summary")}
      </SectionTitle>
      <div className="table-shell">
        <table className="table-stack min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-3 text-start">{t("خصم من الراتب", "Salary deduction")}</th>
              {leaveTypes.map((type) => (
                <th key={type.key} className="px-4 py-3 text-start">
                  {leaveName(type, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.employee.id}>
                <td className="cell-title px-4 py-3">
                  <Link href={`/employees/${row.employee.id}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                    {displayName(row.employee)}
                  </Link>
                </td>
                <td className="tabular px-4 py-3" data-label={t("خصم من الراتب", "Salary deduction")}>
                  {row.salaryDays > 0 ? <span className="font-semibold text-red-700">{daysLabel(row.salaryDays)}</span> : <span className="text-slate-400">0</span>}
                </td>
                {leaveTypes.map((type) => (
                  <td key={type.key} className="tabular px-4 py-3" data-label={leaveName(type, lang)}>
                    {row.used[type.key] > 0 ? <span className="font-semibold text-slate-900">{daysLabel(row.used[type.key])}</span> : <span className="text-slate-400">0</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="mt-6">
        <SectionTitle hint={t(`${periods.length} فترة مسجّلة`, `${periods.length} recorded period(s)`)}>{t("سجل الشهر", "Month log")}</SectionTitle>
        {periods.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t("لا توجد سجلات في هذا الشهر.", "No records this month.")}</p>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {periods.map((period) => (
            <li key={period.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${period.row.deductsSalary ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-700"}`}
                >
                  <CalendarRange size={17} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">
                    {displayName(period.row.employee)}
                    <span className="ms-2 inline-block align-middle">
                      <ToneBadge tone={period.row.deductsSalary ? "red" : "teal"}>{attendanceLabel(period.row, leaveTypes, lang)}</ToneBadge>
                    </span>
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    {formatDate(period.start)} {t("إلى", "to")} {formatDate(period.end)} · {daysLabel(period.days)} {t("يوم", "day(s)")} ·{" "}
                    {period.row.deductsSalary ? t("خصم راتب", "salary deducted") : t("بدون خصم راتب", "no salary deduction")}
                  </p>
                  {period.row.notes ? <p className="mt-0.5 text-xs text-slate-500">{period.row.notes}</p> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-4 ps-12 sm:ps-0">
                {can(user, "attendance.edit") ? (
                  <AttendanceEditForm
                    action={updateAttendance}
                    id={period.deleteId}
                    returnTo={returnTo}
                    type={attendanceChoiceOf(period.row)}
                    choices={choices}
                    start={period.start}
                    end={period.end}
                    deductsSalary={period.row.deductsSalary}
                    notes={period.row.notes}
                  />
                ) : null}
                {can(user, "attendance.delete") ? (
                  <DeleteButton
                    action={deleteAttendance}
                    fields={{ id: period.deleteId, returnTo }}
                    confirm={t("حذف هذه الفترة وإرجاع أيامها إلى الرصيد؟", "Delete this period and return its days to the balance?")}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
