import Link from "next/link";
import { CalendarDays, CalendarRange, Search, Timer, TriangleAlert } from "lucide-react";
import { AttendanceCsvImport } from "@/components/attendance-csv-import";
import { ColumnHead } from "@/components/column-head";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { PeriodFilter } from "@/components/period-filter";
import { AttendanceEditForm, DeleteButton } from "@/components/row-forms";
import { Card, PageHeader, SectionTitle, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { getI18n } from "@/lib/lang";
import { normalizeSearchText } from "@/lib/search";
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
import { cn, daysLabel, formatDate, monthRange, readPeriod, round3 } from "@/lib/utils";
import { deleteAttendance, importAttendanceCsv, markAttendance, updateAttendance } from "@/server/attendance-actions";

type Tab = "log" | "summary" | "clock";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; day?: string; tab?: string; q?: string; sort?: string; dir?: string; error?: string; message?: string; [key: string]: string | undefined }>;
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

  const q = (sp.q || "").trim();
  const needle = normalizeSearchText(q);
  const matchesEmployee = (employee: { fullName: string; nameEn: string | null; employeeNumber: string; idNumber: string | null }) => {
    if (!needle) return true;
    return (
      normalizeSearchText(employee.fullName).includes(needle) ||
      Boolean(employee.nameEn && normalizeSearchText(employee.nameEn).includes(needle)) ||
      normalizeSearchText(employee.employeeNumber).includes(needle) ||
      Boolean(employee.idNumber && normalizeSearchText(employee.idNumber).includes(needle))
    );
  };
  const listed = employees.filter(matchesEmployee);
  const showClock = user.company.clockEnabled || clockEntries.length > 0;
  const tab: Tab = sp.tab === "summary" || (sp.tab === "clock" && showClock) ? sp.tab : "log";
  const clockById = new Map(clockEntries.map((entry) => [entry.employeeId, entry]));
  const onLeave = new Set(dayAbsences.map((row) => row.employeeId));
  const displayName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const warnDays = user.company.leaveWarningDays;
  const figuresById = new Map(employees.map((employee) => [employee.id, computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes)]));
  const balances = Object.fromEntries(employees.map((employee) => [employee.id, remainingByKey(figuresById.get(employee.id)!)]));
  const leaveAlerts = listed
    .map((employee) => ({ employee, warnings: leaveWarnings(figuresById.get(employee.id)!, warnDays) }))
    .filter((item) => item.warnings.length > 0);

  const locale = lang === "en" ? "en" : "ar";
  const clockColumns = ["name", "in", "out", "hours", "status"];
  const summaryColumns = ["name", "salary", ...leaveTypes.map((type) => `l${type.key}`)];
  const toolFields = columnHiddenFields(sp, [...new Set([...clockColumns, ...summaryColumns])]);

  const summary = listed.map((employee) => {
    const rows = records.filter((row) => row.employeeId === employee.id);
    return {
      employee,
      salaryDays: round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0)),
      used: Object.fromEntries(leaveTypes.map((type) => [type.key, round3(rows.reduce((sum, row) => (rowBalanceKey(row) === type.key ? sum + rowDays(row) : sum), 0))])),
      active: false as boolean,
    };
  });
  for (const row of summary) {
    row.active = row.salaryDays > 0 || leaveTypes.some((type) => row.used[type.key] > 0);
  }

  const clockRows = listed
    .map((employee) => {
      const entry = clockById.get(employee.id);
      const status = entry
        ? entry.lateMinutes
          ? t(`متأخر ${entry.lateMinutes} د`, `${entry.lateMinutes} min late`)
          : t("في الوقت", "On time")
        : onLeave.has(employee.id)
          ? t("غياب/إجازة مسجّلة", "Absence/leave recorded")
          : t("لم يسجّل", "Not clocked in");
      const distance = entry?.inDistance != null ? ` (${entry.inDistance} ${t("م", "m")})` : "";
      return {
        employee,
        entry,
        name: displayName(employee),
        inText: `${entry ? muscatTime(entry.inAt) : "—"}${distance}`,
        outText: entry?.outAt ? muscatTime(entry.outAt) : "—",
        hoursText: entry ? workedLabel(entry.inAt, entry.outAt) : "—",
        status,
        inTime: entry ? entry.inAt.getTime() : Number.POSITIVE_INFINITY,
        outTime: entry?.outAt ? entry.outAt.getTime() : Number.POSITIVE_INFINITY,
        worked: entry?.outAt ? entry.outAt.getTime() - entry.inAt.getTime() : -1,
        active: Boolean(entry) || onLeave.has(employee.id),
      };
    })
    .filter((row) => (q || row.active) && includesText(row.name, sp.fname) && includesText(row.inText, sp.fin) && includesText(row.outText, sp.fout) && includesText(row.hoursText, sp.fhours) && includesText(row.status, sp.fstatus));

  const clockSort = readSort(sp, clockColumns, "name");
  clockRows.sort((a, b) => {
    if (clockSort.sort === "in") return compareNumber(a.inTime, b.inTime, clockSort.dir);
    if (clockSort.sort === "out") return compareNumber(a.outTime, b.outTime, clockSort.dir);
    if (clockSort.sort === "hours") return compareNumber(a.worked, b.worked, clockSort.dir);
    if (clockSort.sort === "status") return compareText(a.status, b.status, clockSort.dir, locale);
    return compareText(a.name, b.name, clockSort.dir, locale);
  });

  const summaryRows = summary
    .filter(
      (row) =>
        (q || row.active) &&
        includesText(displayName(row.employee), sp.fname) &&
        includesText(`${row.salaryDays} ${daysLabel(row.salaryDays)}`, sp.fsalary) &&
        leaveTypes.every((type) => includesText(`${row.used[type.key]} ${daysLabel(row.used[type.key])}`, sp[`fl${type.key}`])),
    );
  const summarySort = readSort(sp, summaryColumns, "name");
  summaryRows.sort((a, b) => {
    if (summarySort.sort === "salary") return compareNumber(a.salaryDays, b.salaryDays, summarySort.dir);
    if (summarySort.sort.startsWith("l")) {
      const key = summarySort.sort.slice(1);
      return compareNumber(a.used[key] || 0, b.used[key] || 0, summarySort.dir);
    }
    return compareText(displayName(a.employee), displayName(b.employee), summarySort.dir, locale);
  });

  const choices = attendanceChoices(leaveTypes, lang);
  const periods = groupAttendance(records).filter((period) => matchesEmployee(period.row.employee));
  const returnParams = new URLSearchParams({ year: String(year), month: String(month) });
  if (q) returnParams.set("q", q);
  if (tab !== "log") returnParams.set("tab", tab);
  const returnTo = `/attendance?${returnParams}`;

  const href = (next: { tab?: Tab; q?: string; day?: string }) => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    const nextTab = next.tab ?? tab;
    const nextQ = next.q ?? q;
    const nextDay = next.day ?? (sp.day || "");
    if (nextTab !== "log") params.set("tab", nextTab);
    if (nextQ) params.set("q", nextQ);
    if (nextDay) params.set("day", nextDay);
    return `/attendance?${params}`;
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "log", label: t("السجل", "Log"), count: periods.length },
    { id: "summary", label: t("الملخص", "Summary"), count: summaryRows.length },
    ...(showClock ? [{ id: "clock" as const, label: t("الدوام", "Clock"), count: clockRows.length }] : []),
  ];

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={CalendarDays}
        title={t("الحضور والغياب", "Attendance & leave")}
        description={t("سجّل غياباً أو إجازة، ثم راجع سجل الشهر.", "Record leave, then review the month log.")}
      >
        <PeriodFilter year={year} month={month} />
        {can(user, "attendance.create") ? <AttendanceCsvImport action={importAttendanceCsv} /> : null}
        {showClock ? (
          <Link href={`/attendance/timesheet?year=${year}&month=${month}`} className={secondaryBtn}>
            <Timer size={16} />
            {t("الإضافي", "Overtime")}
          </Link>
        ) : null}
      </PageHeader>

      <Flash error={sp.error} message={sp.message} />

      <Toolbar>
        <GetForm className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          {tab !== "log" ? <input type="hidden" name="tab" value={tab} /> : null}
          {sp.day ? <input type="hidden" name="day" value={sp.day} /> : null}
          {toolFields.map((field) => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <div className="relative min-w-0 flex-1">
            <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${fieldClass} w-full ps-10`}
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("ابحث بالاسم أو الرقم أو المدني", "Search name, number or civil ID")}
              aria-label={t("بحث عن موظف", "Search employee")}
            />
          </div>
          {q ? (
            <Link href={href({ q: "" })} className={secondaryBtn}>
              {t("مسح", "Clear")}
            </Link>
          ) : null}
        </GetForm>
      </Toolbar>

      {leaveAlerts.length ? (
        <details className="rounded-2xl border border-red-200 bg-red-50 text-red-800 open:pb-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold">
            <TriangleAlert size={18} className="shrink-0" />
            {t(`${leaveAlerts.length} تنبيه رصيد إجازة`, `${leaveAlerts.length} leave-balance alert(s)`)}
          </summary>
          <ul className="space-y-1 px-4 pb-1 text-sm leading-6">
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
        </details>
      ) : null}

      {can(user, "attendance.create") ? (
        <Card>
          <SectionTitle>{t("تسجيل غياب أو إجازة", "Record absence or leave")}</SectionTitle>
          <LeaveRangeForm
            action={markAttendance}
            employees={employees.map((employee) => ({
              id: employee.id,
              fullName: displayName(employee),
              employeeNumber: employee.employeeNumber,
              idNumber: employee.idNumber,
            }))}
            balances={balances}
            choices={choices}
            returnTo={returnTo}
            defaultType="ABSENT"
            warnDays={warnDays}
          />
        </Card>
      ) : null}

      <nav className="segmented" aria-label={t("عرض السجلات", "View records")}>
        {tabs.map((item) => (
          <Link key={item.id} href={href({ tab: item.id })} aria-current={tab === item.id ? "page" : undefined}>
            {item.label}
            <span className="tabular ms-1.5 text-xs opacity-70">{item.count}</span>
          </Link>
        ))}
      </nav>

      {tab === "log" ? (
        <Card>
          {periods.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t("لا توجد سجلات في هذا الشهر.", "No records this month.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {periods.map((period) => (
                <li key={period.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        period.row.deductsSalary ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-700",
                      )}
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
                        {formatDate(period.start)}
                        {String(period.start) !== String(period.end) ? ` ${t("إلى", "to")} ${formatDate(period.end)}` : ""} · {daysLabel(period.days)} {t("يوم", "day(s)")}
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
          )}
        </Card>
      ) : null}

      {tab === "summary" ? (
        <div className="table-shell">
          <table className="table-stack table-tools min-w-full text-sm">
            <thead>
              <tr>
                <ColumnHead column="name" label={t("الموظف", "Employee")} />
                <ColumnHead column="salary" label={t("خصم راتب", "Pay cut")} />
                {leaveTypes.map((type) => (
                  <ColumnHead key={type.key} column={`l${type.key}`} label={leaveName(type, lang)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.length === 0 ? (
                <tr>
                  <td colSpan={2 + leaveTypes.length} className="px-4 py-8 text-center text-slate-500">
                    {t("لا حركة إجازات أو خصم في هذا الشهر.", "No leave or pay cuts this month.")}
                  </td>
                </tr>
              ) : (
                summaryRows.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="cell-title px-4 py-3">
                      <Link href={`/employees/${row.employee.id}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                        {displayName(row.employee)}
                      </Link>
                      <span className="tabular block text-xs text-slate-500">{row.employee.employeeNumber}</span>
                    </td>
                    <td className="tabular px-4 py-3" data-label={t("خصم راتب", "Pay cut")}>
                      {row.salaryDays > 0 ? <span className="font-semibold text-red-700">{daysLabel(row.salaryDays)}</span> : <span className="text-slate-400">0</span>}
                    </td>
                    {leaveTypes.map((type) => (
                      <td key={type.key} className="tabular px-4 py-3" data-label={leaveName(type, lang)}>
                        {row.used[type.key] > 0 ? <span className="font-semibold text-slate-900">{daysLabel(row.used[type.key])}</span> : <span className="text-slate-400">0</span>}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "clock" && showClock ? (
        <Card id="clock" className="scroll-mt-24">
          <SectionTitle
            hint={formatDate(clockDate)}
            action={
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="tab" value="clock" />
                {q ? <input type="hidden" name="q" value={q} /> : null}
                {toolFields.map((field) => (
                  <input key={field.name} type="hidden" name={field.name} value={field.value} />
                ))}
                <input type="date" name="day" defaultValue={clockDay} className="h-9 rounded-lg border border-slate-200 bg-surface px-2 text-sm" aria-label={t("اليوم", "Day")} />
                <button type="submit" className="h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t("عرض", "Show")}
                </button>
              </form>
            }
          >
            {t("سجل الدوام", "Clock-in log")}
          </SectionTitle>
          <div className="table-shell">
            <table className="table-stack table-tools min-w-full text-sm">
              <thead>
                <tr>
                  <ColumnHead column="name" label={t("الموظف", "Employee")} />
                  <ColumnHead column="in" label={t("الحضور", "In")} />
                  <ColumnHead column="out" label={t("الانصراف", "Out")} />
                  <ColumnHead column="hours" label={t("المدة", "Hours")} />
                  <ColumnHead column="status" label={t("الحالة", "Status")} />
                </tr>
              </thead>
              <tbody>
                {clockRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      {t("لا تسجيلات حضور في هذا اليوم.", "No clock-ins for this day.")}
                    </td>
                  </tr>
                ) : (
                  clockRows.map(({ employee, entry }) => (
                    <tr key={employee.id}>
                      <td className="cell-title px-4 py-2.5">
                        <Link href={`/employees/${employee.id}?tab=attendance`} className="font-semibold text-slate-900 hover:text-teal-700">
                          {displayName(employee)}
                        </Link>
                        <span className="tabular block text-xs text-slate-500">{employee.employeeNumber}</span>
                      </td>
                      <td className="tabular px-4 py-2.5" data-label={t("الحضور", "In")}>
                        {entry ? muscatTime(entry.inAt) : "—"}
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
                          <ToneBadge tone="slate">{t("غياب/إجازة", "Absent/leave")}</ToneBadge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
