import { cache } from "react";
import type { Company } from "@prisma/client";
import { can, getSessionUser } from "./auth";
import type { Permission } from "./permissions";
import { reminderDayIn, payDayFor } from "./calendar";
import { muscatDateTime } from "./clock";
import { DOC_LABEL, monthName } from "./constants";
import { daysUntil, describeExpiry } from "./expiry";
import { getLeaveTypes } from "./hr-catalog";
import { type Lang, makeT, pick } from "./i18n";
import { getI18n } from "./lang";
import { attendanceLabel, computeLeaveBalances, groupAttendance, leaveWarningText, leaveWarnings } from "./leave";
import { prisma } from "./prisma";
import { REQUEST_TYPE, decidableTypes, type RequestType } from "./requests";
import { TASK_ALERT_DAYS } from "./tasks";
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
  const { lang } = await getI18n();
  const user = await getSessionUser();
  if (!user) return [] as AlertItem[];
  return computeAlerts(user.company, user.permissions, lang);
});

/** Alerts for one company as seen by someone holding `permissions`; also used by the scheduled job, which has no session. */
export async function computeAlerts(company: Company, permissions: readonly string[], lang: Lang): Promise<AlertItem[]> {
  const t = makeT(lang);
  const user = { permissions };
  const limits = {
    urgent: company.alertUrgentDays,
    warning: company.alertWarningDays,
    early: company.alertEarlyDays,
  };
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const { start, end } = monthRange(thisYear, thisMonth);
  const taskHorizon = new Date(Date.UTC(thisYear, now.getMonth(), now.getDate() + TASK_ALERT_DAYS + 1));
  const [employees, leaveTypes, reminders, absences, generated, unpaidRows, tasks, leaveRequests, portalDocs, interviews, claimGroups, strandedAssets, dueCycles, employeeRequests] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: company.id, status: { not: "TERMINATED" } },
      include: {
        documents: true,
        attendance: { select: { type: true, balanceKey: true } },
        leaveCredits: { select: { balanceKey: true, days: true } },
      },
    }),
    getLeaveTypes(company.id),
    prisma.reminder.findMany({
      where: { companyId: company.id, OR: [{ repeat: { not: "NONE" } }, { done: false }] },
      include: { employee: { select: { fullName: true, nameEn: true } } },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: start, lt: end },
        deductsSalary: true,
        employee: { companyId: company.id },
      },
      include: { employee: true },
      orderBy: { date: "desc" },
    }),
    prisma.salary.count({ where: { year: thisYear, month: thisMonth, employee: { companyId: company.id } } }),
    prisma.salary.findMany({
      where: { paid: false, employee: { companyId: company.id } },
      select: { year: true, month: true, netSalary: true },
    }),
    can(user, "tasks.view")
      ? prisma.task.findMany({
          where: { companyId: company.id, status: { not: "DONE" }, dueDate: { lt: taskHorizon } },
          select: { id: true, title: true, dueDate: true, assignees: { select: { employee: { select: { fullName: true, nameEn: true } } } } },
          orderBy: { dueDate: "asc" },
          take: 30,
        })
      : [],
    can(user, "attendance.view")
      ? prisma.leaveRequest.findMany({
          where: { companyId: company.id, status: "PENDING" },
          select: { id: true, choice: true, fromDate: true, toDate: true, days: true, employee: { select: { fullName: true, nameEn: true } } },
          orderBy: { fromDate: "asc" },
          take: 20,
        })
      : [],
    can(user, "documents.view") ? prisma.employeeDocument.count({ where: { employee: { companyId: company.id }, submittedAt: { not: null }, reviewedAt: null } }) : 0,
    can(user, "recruitment.view")
      ? prisma.candidate.findMany({
          where: { companyId: company.id, stage: "INTERVIEW", interviewAt: { gte: new Date(now.getTime() - 2 * 3600_000), lt: new Date(now.getTime() + 48 * 3600_000) } },
          select: { id: true, fullName: true, interviewAt: true, job: { select: { title: true } } },
          orderBy: { interviewAt: "asc" },
          take: 10,
        })
      : [],
    can(user, "expenses.view")
      ? prisma.expenseClaim.groupBy({ by: ["status"], where: { companyId: company.id, status: { in: ["PENDING", "APPROVED"] } }, _count: true, _sum: { amount: true } })
      : [],
    can(user, "assets.view")
      ? prisma.asset.findMany({
          where: { companyId: company.id, status: "ASSIGNED", employee: { status: "TERMINATED" } },
          select: { id: true, name: true, employee: { select: { id: true, fullName: true, nameEn: true } } },
          take: 20,
        })
      : [],
    can(user, "performance.view")
      ? prisma.reviewCycle.findMany({
          where: { companyId: company.id, status: "OPEN", dueDate: { not: null, lt: new Date(now.getTime() + (limits.urgent + 1) * 86_400_000) } },
          select: { id: true, name: true, dueDate: true, _count: { select: { reviews: { where: { status: { not: "DONE" } } } } } },
        })
      : [],
    decidableTypes(user).length
      ? prisma.employeeRequest.findMany({
          where: { companyId: company.id, status: "PENDING", type: { in: decidableTypes(user) } },
          select: { id: true, type: true, lastDay: true, employee: { select: { fullName: true, nameEn: true } } },
          orderBy: { createdAt: "asc" },
          take: 50,
        })
      : [],
  ]);
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const alerts: AlertItem[] = [];

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

    const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes);
    for (const warning of leaveWarnings(balances, company.leaveWarningDays)) {
      alerts.push({
        id: `leave-${employee.id}-${warning.key}`,
        severity: "danger",
        title: warning.level === "low" ? t("اقتراب نفاد الإجازة", "Leave almost used") : t("تجاوز رصيد الإجازة", "Leave limit reached"),
        message: `${name} — ${leaveWarningText(warning, lang)}`,
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

  for (const task of tasks) {
    const days = daysUntil(task.dueDate!);
    const names = task.assignees.map((row) => nameOf(row.employee));
    const who = names.length ? ` — ${names.length > 2 ? `${names.slice(0, 2).join("، ")} +${names.length - 2}` : names.join(lang === "en" ? ", " : "، ")}` : "";
    const timing =
      days < 0
        ? t(`متأخرة ${daysPhrase(days, "ar")}`, `${daysPhrase(days, "en")} overdue`)
        : days === 0
          ? t("تستحق اليوم", "due today")
          : t(`تستحق بعد ${daysPhrase(days, "ar")}`, `due in ${daysPhrase(days, "en")}`);
    alerts.push({
      id: `task-${task.id}`,
      severity: days <= 0 ? "danger" : "warning",
      title: days < 0 ? t(`مهمة متأخرة: ${task.title}`, `Overdue task: ${task.title}`) : t(`مهمة: ${task.title}`, `Task: ${task.title}`),
      message: `${formatDate(task.dueDate)} — ${timing}${who}`,
      href: `/tasks/${task.id}`,
      days,
    });
  }

  for (const request of leaveRequests) {
    const kind = attendanceLabel({ type: request.choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: request.choice === "UNPAID_LEAVE" ? null : request.choice.slice(6) }, leaveTypes, lang);
    const starts = daysUntil(request.fromDate);
    alerts.push({
      id: `request-${request.id}`,
      severity: starts <= 2 ? "danger" : "warning",
      title: t("طلب إجازة بانتظار الموافقة", "Leave request awaiting approval"),
      message: `${nameOf(request.employee)} — ${kind} — ${formatDate(request.fromDate)} → ${formatDate(request.toDate)} (${daysLabel(request.days)} ${t("يوم", "day(s)")})`,
      href: "/approvals#leave",
      days: Math.min(starts, 0) - 50,
    });
  }
  const requestGroups = new Map<string, string[]>();
  for (const request of employeeRequests) {
    if (request.type === "RESIGNATION") {
      alerts.push({
        id: `emp-requests-RESIGNATION-${request.id}`,
        severity: "danger",
        title: t("استقالة بانتظار القرار", "Resignation awaiting a decision"),
        message: `${nameOf(request.employee)} — ${t("آخر يوم مقترح", "proposed last day")} ${formatDate(request.lastDay)}`,
        href: "/approvals#requests",
        days: -45,
      });
      continue;
    }
    requestGroups.set(request.type, [...(requestGroups.get(request.type) || []), nameOf(request.employee)]);
  }
  for (const [type, names] of requestGroups) {
    alerts.push({
      id: `emp-requests-${type}`,
      severity: "warning",
      title:
        type === "LETTER"
          ? t("طلبات خطابات وشهادات بانتظار الاعتماد", "Letter requests awaiting approval")
          : type === "ADVANCE"
            ? t("طلبات سلف بانتظار الاعتماد", "Advance requests awaiting approval")
            : t("طلبات موظفين بانتظار الاعتماد", "Employee requests awaiting approval"),
      message: `${names.length} — ${names.length > 3 ? `${names.slice(0, 3).join("، ")} +${names.length - 3}` : names.join(lang === "en" ? ", " : "، ")}`,
      href: "/approvals#requests",
      days: -42,
    });
  }

  if (portalDocs) {
    alerts.push({
      id: "review-documents",
      severity: "warning",
      title: t("مستندات من البوابة بانتظار المراجعة", "Portal documents awaiting review"),
      message: t(`${portalDocs} مستند أرسله الموظفون`, `${portalDocs} document(s) sent by employees`),
      href: "/approvals#documents",
      days: -40,
    });
  }

  for (const candidate of interviews) {
    alerts.push({
      id: `interview-${candidate.id}`,
      severity: "warning",
      title: t("مقابلة قريبة", "Upcoming interview"),
      message: `${candidate.fullName} — ${candidate.job.title} — ${muscatDateTime(candidate.interviewAt)}`,
      href: `/recruitment/candidates/${candidate.id}`,
      days: -30,
    });
  }

  for (const group of claimGroups) {
    const pending = group.status === "PENDING";
    alerts.push({
      id: `expenses-${group.status.toLowerCase()}`,
      severity: "warning",
      title: pending ? t("مصروفات بانتظار الموافقة", "Expense claims awaiting approval") : t("مصروفات معتمدة بانتظار الصرف", "Approved expenses to be paid"),
      message: t(`${group._count} طلب — ${money(group._sum.amount || 0, company.currency)}`, `${group._count} claim(s) — ${money(group._sum.amount || 0, company.currency)}`),
      href: pending ? "/approvals#expenses" : "/expenses?view=APPROVED",
      days: pending ? -35 : 100,
    });
  }

  for (const asset of strandedAssets) {
    alerts.push({
      id: `asset-${asset.id}`,
      severity: "danger",
      title: t("عهدة لدى موظف منتهية خدمته", "Asset held by a former employee"),
      message: `${asset.name} — ${asset.employee ? nameOf(asset.employee) : ""}`,
      href: `/assets/${asset.id}`,
      days: -20,
    });
  }

  for (const cycle of dueCycles) {
    if (!cycle._count.reviews || !cycle.dueDate) continue;
    const days = daysUntil(cycle.dueDate);
    alerts.push({
      id: `cycle-${cycle.id}`,
      severity: days <= 0 ? "danger" : "warning",
      title: t(`موعد تقييم الأداء: ${cycle.name}`, `Review due: ${cycle.name}`),
      message: t(
        `${cycle._count.reviews} تقييم لم يُعتمد — ${days < 0 ? `متأخر ${daysPhrase(days, "ar")}` : days === 0 ? "اليوم" : `بعد ${daysPhrase(days, "ar")}`}`,
        `${cycle._count.reviews} review(s) not completed — ${days < 0 ? `${daysPhrase(days, "en")} overdue` : days === 0 ? "today" : `in ${daysPhrase(days, "en")}`}`,
      ),
      href: `/performance/${cycle.id}?show=DRAFT`,
      days,
    });
  }

  for (const period of groupAttendance(absences).slice(0, 8)) {
    const kind = attendanceLabel(period.row, leaveTypes, lang);
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
  const activeCount = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION").length;
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

  return alerts.filter((alert) => can(user, alertPermission(alert.id))).sort((a, b) => a.days - b.days);
}

function alertPermission(id: string): Permission {
  if (id.startsWith("emp-requests-")) return REQUEST_TYPE[id.split("-")[2] as RequestType]?.perm || "employees.edit";
  if (id.endsWith("-contract") || id.startsWith("birthday-")) return "employees.view";
  if (id.startsWith("doc-") || id.startsWith("extra-")) return "documents.view";
  if (id.startsWith("leave-") || id.startsWith("att-") || id.startsWith("request-")) return "attendance.view";
  if (id === "review-documents") return "documents.view";
  if (id.startsWith("reminder-")) return "calendar.view";
  if (id.startsWith("task-")) return "tasks.view";
  if (id.startsWith("interview-")) return "recruitment.view";
  if (id.startsWith("expenses-")) return "expenses.view";
  if (id.startsWith("asset-")) return "assets.view";
  if (id.startsWith("cycle-")) return "performance.view";
  return "salaries.view";
}
