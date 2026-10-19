import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { getI18n } from "@/lib/lang";
import {
  attendanceLabel,
  groupAttendance,
  leaveName,
  rowBalanceKey,
  rowDays,
  salaryDayWeight,
} from "@/lib/leave";
import { muscatDay, muscatTime, workedLabel } from "@/lib/clock";
import { monthName } from "@/lib/constants";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { readOrient } from "@/lib/official-print";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { normalizeSearchText } from "@/lib/search";
import { daysLabel, formatDate, monthRange, readPeriod, round3 } from "@/lib/utils";

export default async function AttendancePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; day?: string; tab?: string; q?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("attendance.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const { start, end } = monthRange(year, month);
  const tab = sp.tab === "clock" || sp.tab === "summary" ? sp.tab : "log";
  const q = (sp.q || "").trim();
  const needle = normalizeSearchText(q);
  const orient = readOrient(sp.orient);
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

  const displayName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const matches = (employee: { fullName: string; nameEn: string | null; employeeNumber: string; idNumber: string | null }) => {
    if (!needle) return true;
    return (
      normalizeSearchText(employee.fullName).includes(needle) ||
      Boolean(employee.nameEn && normalizeSearchText(employee.nameEn).includes(needle)) ||
      normalizeSearchText(employee.employeeNumber).includes(needle) ||
      Boolean(employee.idNumber && normalizeSearchText(employee.idNumber).includes(needle))
    );
  };
  const listed = employees.filter(matches);
  const periodLabel = `${monthName(month, lang)} ${year}`;
  const origin = await requestOrigin();
  const live = new URLSearchParams({ year: String(year), month: String(month) });
  if (tab !== "log") live.set("tab", tab);
  if (q) live.set("q", q);
  if (sp.day) live.set("day", sp.day);
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}/attendance?${live}`, user.name);

  let titleAr = "سجل الحضور والغياب";
  let titleEn = "Attendance & leave log";
  let subtitle = periodLabel;
  let columns: { key: string; ar: string; en: string }[] = [];
  let rows: OfficialDocRow[] = [];

  if (tab === "summary") {
    titleAr = "ملخص الحضور والغياب";
    titleEn = "Attendance & leave summary";
    columns = [
      { key: "index", ar: "#", en: "#" },
      { key: "name", ar: "الموظف", en: "Employee" },
      { key: "no", ar: "الرقم", en: "No." },
      { key: "salary", ar: "خصم راتب", en: "Pay cut" },
      ...leaveTypes.map((type) => ({ key: `l${type.key}`, ar: leaveName(type, "ar"), en: leaveName(type, "en") })),
    ];
    rows = listed
      .map((employee) => {
        const items = records.filter((row) => row.employeeId === employee.id);
        const salaryDays = round3(items.reduce((sum, row) => sum + salaryDayWeight(row), 0));
        const used = Object.fromEntries(leaveTypes.map((type) => [type.key, round3(items.reduce((sum, row) => (rowBalanceKey(row) === type.key ? sum + rowDays(row) : sum), 0))]));
        const active = salaryDays > 0 || leaveTypes.some((type) => used[type.key] > 0);
        if (!q && !active) return null;
        const row: OfficialDocRow = {
          key: employee.id,
          name: displayName(employee),
          no: employee.employeeNumber,
          salary: daysLabel(salaryDays),
        };
        for (const type of leaveTypes) row[`l${type.key}`] = daysLabel(used[type.key]);
        return row;
      })
      .filter((row): row is OfficialDocRow => Boolean(row));
  } else if (tab === "clock") {
    titleAr = "سجل الدوام";
    titleEn = "Clock-in log";
    subtitle = `${periodLabel} · ${formatDate(clockDate)}`;
    const clockById = new Map(clockEntries.map((entry) => [entry.employeeId, entry]));
    const onLeave = new Set(dayAbsences.map((row) => row.employeeId));
    columns = [
      { key: "index", ar: "#", en: "#" },
      { key: "name", ar: "الموظف", en: "Employee" },
      { key: "no", ar: "الرقم", en: "No." },
      { key: "in", ar: "الحضور", en: "In" },
      { key: "out", ar: "الانصراف", en: "Out" },
      { key: "hours", ar: "المدة", en: "Hours" },
      { key: "status", ar: "الحالة", en: "Status" },
    ];
    rows = listed
      .map((employee) => {
        const entry = clockById.get(employee.id);
        if (!q && !entry && !onLeave.has(employee.id)) return null;
        const row: OfficialDocRow = {
          key: employee.id,
          name: displayName(employee),
          no: employee.employeeNumber,
          in: entry ? muscatTime(entry.inAt) : "—",
          out: entry?.outAt ? muscatTime(entry.outAt) : "—",
          hours: entry ? workedLabel(entry.inAt, entry.outAt) : "—",
          status: entry
            ? entry.lateMinutes
              ? t(`متأخر ${entry.lateMinutes} د`, `${entry.lateMinutes} min late`)
              : t("في الوقت", "On time")
            : onLeave.has(employee.id)
              ? t("غياب/إجازة", "Absent/leave")
              : t("لم يسجّل", "Not clocked in"),
        };
        return row;
      })
      .filter((row): row is OfficialDocRow => Boolean(row));
  } else {
    subtitle = q ? `${periodLabel} · ${t(`بحث: ${q}`, `Search: ${q}`)}` : periodLabel;
    columns = [
      { key: "index", ar: "#", en: "#" },
      { key: "name", ar: "الموظف", en: "Employee" },
      { key: "type", ar: "النوع", en: "Type" },
      { key: "from", ar: "من", en: "From" },
      { key: "to", ar: "إلى", en: "To" },
      { key: "days", ar: "الأيام", en: "Days" },
      { key: "note", ar: "ملاحظة", en: "Note" },
    ];
    rows = groupAttendance(records)
      .filter((period) => matches(period.row.employee))
      .map((period) => ({
        key: period.id,
        name: displayName(period.row.employee),
        type: attendanceLabel(period.row, leaveTypes, lang),
        from: formatDate(period.start),
        to: formatDate(period.end),
        days: daysLabel(period.days),
        note: period.row.notes || "",
      }));
  }

  const back = `/attendance?${live}`;
  const fileName = `attendance-${year}-${String(month).padStart(2, "0")}-${tab}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={back} backLabel={t("رجوع للحضور", "Back to attendance")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr={titleAr}
        titleEn={titleEn}
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا توجد سجلات للطباعة.", en: "No records to print." }}
        orient={orient}
      />
    </div>
  );
}
