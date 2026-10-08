import Link from "next/link";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { PeriodFilter } from "@/components/period-filter";
import { AttendanceEditForm, DeleteButton } from "@/components/row-forms";
import { Card, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { ATTENDANCE_LABEL, BALANCE_KEYS, BALANCE_LABEL, type BalanceKey } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, groupAttendance, leaveWarningText, leaveWarnings, salaryDayWeight } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { calendarDays, daysLabel, formatDate, monthRange, readPeriod, round3 } from "@/lib/utils";
import { deleteAttendance, markAttendance, updateAttendance } from "@/server/attendance-actions";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("attendance.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const { start, end } = monthRange(year, month);
  const [employees, records] = await Promise.all([
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
  ]);
  const displayName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const warnDays = user.company.leaveWarningDays;
  const figuresById = new Map(employees.map((employee) => [employee.id, computeLeaveBalances(employee, employee.attendance, employee.leaveCredits)]));
  const balances = Object.fromEntries(
    employees.map((employee) => {
      const figures = figuresById.get(employee.id)!;
      return [employee.id, Object.fromEntries(BALANCE_KEYS.map((key) => [key, figures[key].remaining])) as Record<BalanceKey, number>];
    }),
  );
  const leaveAlerts = employees
    .map((employee) => ({ employee, warnings: leaveWarnings(figuresById.get(employee.id)!, warnDays) }))
    .filter((item) => item.warnings.length > 0);
  const summary = employees.map((employee) => {
    const rows = records.filter((row) => row.employeeId === employee.id);
    const used = (key: BalanceKey) => round3(rows.reduce((sum, row) => sum + (row.balanceKey === key ? (row.type === "HALF_DAY" ? 0.5 : 1) : 0), 0));
    return {
      employee,
      salaryDays: round3(rows.reduce((sum, row) => sum + salaryDayWeight(row), 0)),
      annual: used("annual"),
      sick: used("sick"),
      compensatory: used("compensatory"),
      other: used("other"),
    };
  });
  const periods = groupAttendance(records);
  const returnTo = `/attendance?year=${year}&month=${month}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
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
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800" role="alert">
          <p className="font-bold">{t("موظفون تجاوزوا أو اقتربوا من نفاد إجازاتهم", "Employees over or close to their leave limit")}</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {leaveAlerts.map(({ employee, warnings }) => (
              <li key={employee.id}>
                <Link href={`/employees/${employee.id}?tab=attendance`} className="font-semibold underline">
                  {displayName(employee)}
                </Link>
                {" — "}
                {warnings.map((item) => leaveWarningText(item, pick(BALANCE_LABEL[item.key], lang), lang)).join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {can(user, "attendance.create") ? (
        <Card className="mb-4">
          <LeaveRangeForm
            action={markAttendance}
            employees={employees.map((employee) => ({ id: employee.id, fullName: displayName(employee) }))}
            balances={balances}
            returnTo={returnTo}
            defaultType="ABSENT"
            warnDays={warnDays}
          />
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-3 text-start">{t("أيام الشهر", "Month days")}</th>
              <th className="px-4 py-3 text-start">{t("خصم من الراتب", "Salary deduction")}</th>
              <th className="px-4 py-3 text-start">{t("سنوية", "Annual")}</th>
              <th className="px-4 py-3 text-start">{t("مرضية", "Sick")}</th>
              <th className="px-4 py-3 text-start">{t("تعويضية", "Compensatory")}</th>
              <th className="px-4 py-3 text-start">{t("أخرى", "Other")}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.employee.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/employees/${row.employee.id}?tab=attendance`} className="font-semibold hover:text-teal-800">
                    {displayName(row.employee)}
                  </Link>
                </td>
                <td className="px-4 py-3">{calendarDays(year, month)}</td>
                <td className="px-4 py-3">{daysLabel(row.salaryDays)}</td>
                <td className="px-4 py-3">{daysLabel(row.annual)}</td>
                <td className="px-4 py-3">{daysLabel(row.sick)}</td>
                <td className="px-4 py-3">{daysLabel(row.compensatory)}</td>
                <td className="px-4 py-3">{daysLabel(row.other)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold">{t("سجل الشهر", "Month log")}</h2>
        {periods.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد سجلات في هذا الشهر.", "No records this month.")}</p> : null}
        <div className="space-y-2">
          {periods.map((period) => (
            <div key={period.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
              <div>
                <span className="font-semibold">{displayName(period.row.employee)}</span>
                <span className="text-slate-500">
                  {" "}
                  — {formatDate(period.start)} {t("إلى", "to")} {formatDate(period.end)} — {daysLabel(period.days)} {t("يوم", "day(s)")} —{" "}
                  {pick(ATTENDANCE_LABEL[period.row.type], lang, period.row.type)}
                  {period.row.deductsSalary ? t(" — خصم راتب", " — salary deducted") : t(" — بدون خصم راتب", " — no salary deduction")}
                  {period.row.notes ? ` — ${period.row.notes}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                {can(user, "attendance.edit") ? (
                  <AttendanceEditForm
                    action={updateAttendance}
                    id={period.deleteId}
                    returnTo={returnTo}
                    type={period.row.type}
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
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
