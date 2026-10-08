import { cache } from "react";
import { getSessionUser } from "./auth";
import { reminderDayIn, payDayFor } from "./calendar";
import { ATTENDANCE_LABEL, BALANCE_LABEL, DOC_LABEL, monthName } from "./constants";
import { daysUntil, describeExpiry } from "./expiry";
import { pick } from "./i18n";
import { getI18n } from "./lang";
import { computeLeaveBalances, groupAttendance, leaveWarningText, leaveWarnings } from "./leave";
import { prisma } from "./prisma";
import { daysLabel, daysPhrase, formatDate, money, monthRange } from "./utils";

export type AlertItem = {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  href: string;
  days: number;
};

function severityFor(key: string): AlertItem["severity"] {
  if (key === "expired" || key === "today") return "danger";
  if (key === "urgent" || key === "warning") return "warning";
  return "info";
}

const BIRTHDAY_NOTICE_DAYS = 7;

export const getAlerts = cache(async () => {
  const { lang, t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return [] as AlertItem[];
  const company = user.company;
  const limits = {
    urgent: company.alertUrgentDays,
    warning: company.alertWarningDays,
    early: company.alertEarlyDays,
  };
  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, status: { not: "TERMINATED" } },
    include: {
      documents: true,
      attendance: { select: { type: true, balanceKey: true } },
      leaveCredits: { select: { balanceKey: true, days: true } },
    },
  });
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const alerts: AlertItem[] = [];
  const now = new Date();

  for (const employee of employees) {
    const name = nameOf(employee);
    const docs = [
      { id: `doc-${employee.id}-id`, label: pick(DOC_LABEL.ID_CARD, lang), expiry: employee.idExpiry, tab: "docs" },
      { id: `doc-${employee.id}-passport`, label: pick(DOC_LABEL.PASSPORT, lang), expiry: employee.passportExpiry, tab: "docs" },
      { id: `doc-${employee.id}-residence`, label: pick(DOC_LABEL.RESIDENCE, lang), expiry: employee.residenceExpiry, tab: "docs" },
      { id: `doc-${employee.id}-contract`, label: pick(DOC_LABEL.CONTRACT, lang), expiry: employee.contractEnd, tab: "info" },
      ...employee.documents.map((document) => ({
        id: `extra-${document.id}`,
        label: pick(DOC_LABEL[document.type], lang, t("مستند", "Document")),
        expiry: document.expiryDate,
        tab: "docs",
      })),
    ];
    for (const doc of docs) {
      if (!doc.expiry) continue;
      const status = describeExpiry(doc.expiry, limits, lang);
      if (status.key === "ok" || status.key === "none") continue;
      alerts.push({
        id: doc.id,
        severity: severityFor(status.key),
        title: status.key === "expired" ? t(`${doc.label} منتهية`, `${doc.label} expired`) : t(`${doc.label} قاربت على الانتهاء`, `${doc.label} expiring soon`),
        message: `${name} — ${status.label}`,
        href: `/employees/${employee.id}?tab=${doc.tab}`,
        days: status.days,
      });
    }

    const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits);
    for (const warning of leaveWarnings(balances, company.leaveWarningDays)) {
      const label = pick(BALANCE_LABEL[warning.key], lang);
      alerts.push({
        id: `leave-${employee.id}-${warning.key}`,
        severity: "danger",
        title: warning.level === "low" ? t("اقتراب نفاد الإجازة", "Leave almost used") : t("تجاوز رصيد الإجازة", "Leave limit reached"),
        message: `${name} — ${leaveWarningText(warning, label, lang)}`,
        href: `/employees/${employee.id}?tab=attendance`,
        days: warning.level === "exceeded" ? -900 : warning.level === "exhausted" ? -800 : -700,
      });
    }

    if (employee.dateOfBirth) {
      const dob = new Date(employee.dateOfBirth);
      const birthdayIn = (year: number) =>
        new Date(Date.UTC(year, dob.getUTCMonth(), Math.min(dob.getUTCDate(), new Date(Date.UTC(year, dob.getUTCMonth() + 1, 0)).getUTCDate()), 12));
      let target = birthdayIn(now.getFullYear());
      let days = daysUntil(target);
      if (days < 0) {
        target = birthdayIn(now.getFullYear() + 1);
        days = daysUntil(target);
      }
      if (days >= 0 && days <= BIRTHDAY_NOTICE_DAYS) {
        alerts.push({
          id: `birthday-${employee.id}`,
          severity: "info",
          title: days === 0 ? t("عيد ميلاد اليوم", "Birthday today") : t("عيد ميلاد قريب", "Upcoming birthday"),
          message: `${name} — ${days === 0 ? t("اليوم", "today") : t(`بعد ${daysPhrase(days, "ar")}`, `in ${daysPhrase(days, "en")}`)} (${formatDate(target)})`,
          href: `/calendar?year=${target.getUTCFullYear()}&month=${target.getUTCMonth() + 1}`,
          days: 600 + days,
        });
      }
    }
  }

  const reminders = await prisma.reminder.findMany({
    where: { companyId: company.id, OR: [{ repeat: { not: "NONE" } }, { done: false }] },
    include: { employee: { select: { fullName: true, nameEn: true } } },
  });
  for (const reminder of reminders) {
    let days: number | null = null;
    let when: Date | null = null;
    if (reminder.repeat === "NONE") {
      when = reminder.date;
      days = daysUntil(reminder.date);
    } else {
      for (let offset = 0; offset < 13 && days === null; offset += 1) {
        const key = now.getFullYear() * 12 + now.getMonth() + offset;
        const year = Math.floor(key / 12);
        const month = (key % 12) + 1;
        const day = reminderDayIn(reminder, year, month);
        if (day === null) continue;
        const candidate = new Date(Date.UTC(year, month - 1, day, 12));
        const left = daysUntil(candidate);
        if (left >= 0) {
          days = left;
          when = candidate;
        }
      }
    }
    if (days === null || when === null || days > limits.urgent) continue;
    const who = reminder.employee ? ` — ${nameOf(reminder.employee)}` : "";
    const timing =
      days < 0
        ? t(`متأخر ${daysPhrase(days, "ar")}`, `${daysPhrase(days, "en")} overdue`)
        : days === 0
          ? t("اليوم", "today")
          : t(`بعد ${daysPhrase(days, "ar")}`, `in ${daysPhrase(days, "en")}`);
    alerts.push({
      id: `reminder-${reminder.id}`,
      severity: days <= 0 ? "danger" : "warning",
      title: `${t("تذكير", "Reminder")}: ${reminder.title}`,
      message: `${formatDate(when)} — ${timing}${who}`,
      href: `/calendar?year=${when.getUTCFullYear()}&month=${when.getUTCMonth() + 1}#day-${when.getUTCDate()}`,
      days,
    });
  }

  const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
  const absences = await prisma.attendance.findMany({
    where: {
      date: { gte: start, lt: end },
      deductsSalary: true,
      employee: { companyId: company.id },
    },
    include: { employee: true },
    orderBy: { date: "desc" },
  });
  for (const period of groupAttendance(absences).slice(0, 8)) {
    const kind = pick(ATTENDANCE_LABEL[period.row.type], lang, period.row.type);
    const when =
      formatDate(period.start) === formatDate(period.end)
        ? formatDate(period.start)
        : t(`${formatDate(period.start)} إلى ${formatDate(period.end)}`, `${formatDate(period.start)} to ${formatDate(period.end)}`);
    alerts.push({
      id: `att-${period.id}`,
      severity: "warning",
      title: t("خصم من الراتب", "Salary deduction"),
      message: `${nameOf(period.row.employee)} — ${when} — ${daysLabel(period.days)} ${t("يوم", "day(s)")} — ${kind}${period.row.notes ? ` — ${period.row.notes}` : ""}`,
      href: `/employees/${period.row.employeeId}?tab=attendance`,
      days: 500,
    });
  }

  const payDueIn = (year: number, month: number) => daysUntil(new Date(Date.UTC(year, month - 1, payDayFor(year, month, company.payDay), 12)));
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const activeCount = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION").length;
  const generated = await prisma.salary.count({ where: { year: thisYear, month: thisMonth, employee: { companyId: company.id } } });
  const dueNow = payDueIn(thisYear, thisMonth);
  if (activeCount && !generated && dueNow <= limits.urgent) {
    alerts.push({
      id: `payroll-${thisYear}-${thisMonth}`,
      severity: dueNow <= 0 ? "danger" : "warning",
      title: t("استحقاق الرواتب", "Payroll due"),
      message: t(
        `مسير ${monthName(thisMonth, "ar")} ${thisYear} لم يُنشأ بعد — الاستحقاق ${dueNow < 0 ? `منذ ${daysPhrase(dueNow, "ar")}` : dueNow === 0 ? "اليوم" : `بعد ${daysPhrase(dueNow, "ar")}`}`,
        `${monthName(thisMonth, "en")} ${thisYear} payroll not generated — due ${dueNow < 0 ? `${daysPhrase(dueNow, "en")} ago` : dueNow === 0 ? "today" : `in ${daysPhrase(dueNow, "en")}`}`,
      ),
      href: `/salaries?year=${thisYear}&month=${thisMonth}`,
      days: dueNow,
    });
  }

  const unpaidRows = await prisma.salary.findMany({
    where: { paid: false, employee: { companyId: company.id } },
    select: { year: true, month: true, netSalary: true },
  });
  const unpaidGroups = new Map<string, { year: number; month: number; count: number; total: number }>();
  for (const row of unpaidRows) {
    const key = `${row.year}-${row.month}`;
    const group = unpaidGroups.get(key) || { year: row.year, month: row.month, count: 0, total: 0 };
    group.count += 1;
    group.total += row.netSalary;
    unpaidGroups.set(key, group);
  }
  for (const row of unpaidGroups.values()) {
    const due = payDueIn(row.year, row.month);
    alerts.push({
      id: `unpaid-${row.year}-${row.month}`,
      severity: due < 0 ? "danger" : due <= limits.urgent ? "warning" : "info",
      title: due < 0 ? t("رواتب متأخرة عن الاستحقاق", "Overdue salaries") : t("رواتب غير مصروفة", "Unpaid salaries"),
      message: `${monthName(row.month, lang)} ${row.year} — ${row.count} ${t("موظف", "employee(s)")} — ${money(row.total, company.currency)}`,
      href: `/salaries?year=${row.year}&month=${row.month}`,
      days: due < 0 ? due : 800,
    });
  }

  return alerts.sort((a, b) => a.days - b.days);
});
