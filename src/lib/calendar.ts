import { ATTENDANCE_LABEL, DOC_LABEL, attendanceType, monthName } from "./constants";
import { daysUntil } from "./expiry";
import { type Bi, type Lang, makeT, pick } from "./i18n";
import { prisma } from "./prisma";
import { daysLabel, formatDate, monthRange } from "./utils";

export const REMINDER_REPEAT: Record<string, Bi> = {
  NONE: { ar: "مرة واحدة", en: "Once" },
  MONTHLY: { ar: "كل شهر", en: "Every month" },
  YEARLY: { ar: "كل سنة", en: "Every year" },
};

export type EventKind = "salary" | "document" | "birthday" | "leave" | "reminder";

export const EVENT_KINDS: { id: EventKind; label: Bi; dot: string; chip: string }[] = [
  { id: "salary", label: { ar: "الرواتب", en: "Payroll" }, dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { id: "document", label: { ar: "انتهاء المستندات", en: "Document expiry" }, dot: "bg-orange-500", chip: "bg-orange-50 text-orange-800 ring-orange-200" },
  { id: "birthday", label: { ar: "أعياد الميلاد", en: "Birthdays" }, dot: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200" },
  { id: "leave", label: { ar: "الإجازات", en: "Leave" }, dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800 ring-sky-200" },
  { id: "reminder", label: { ar: "التذكيرات", en: "Reminders" }, dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
];

export type CalendarEvent = {
  id: string;
  day: number;
  kind: EventKind;
  title: string;
  detail?: string;
  href: string;
  urgent?: boolean;
  done?: boolean;
  reminderId?: string;
  repeat?: string;
};

export function lastDayOf(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function payDayFor(year: number, month: number, payDay: number) {
  const last = lastDayOf(year, month);
  return payDay <= 0 ? last : Math.min(payDay, last);
}

function noonUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function reminderDayIn(reminder: { date: Date; repeat: string }, year: number, month: number) {
  const date = new Date(reminder.date);
  const startKey = date.getUTCFullYear() * 12 + date.getUTCMonth();
  const key = year * 12 + month - 1;
  if (key < startKey) return null;
  const day = Math.min(date.getUTCDate(), lastDayOf(year, month));
  if (reminder.repeat === "MONTHLY") return day;
  if (reminder.repeat === "YEARLY") return date.getUTCMonth() + 1 === month ? day : null;
  return key === startKey ? date.getUTCDate() : null;
}

const KIND_ORDER: EventKind[] = ["salary", "reminder", "document", "leave", "birthday"];

export async function getCalendarEvents(companyId: string, year: number, month: number, lang: Lang) {
  const t = makeT(lang);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return [] as CalendarEvent[];
  const { start, end } = monthRange(year, month);
  const inMonth = (value: Date | null | undefined) =>
    Boolean(value && new Date(value).getUTCFullYear() === year && new Date(value).getUTCMonth() + 1 === month);
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const events: CalendarEvent[] = [];

  const [salaries, activeCount, employees, monthRows, reminders] = await Promise.all([
    prisma.salary.findMany({ where: { year, month, employee: { companyId } }, select: { paid: true } }),
    prisma.employee.count({ where: { companyId, status: { in: ["ACTIVE", "VACATION"] } } }),
    prisma.employee.findMany({
      where: { companyId, status: { not: "TERMINATED" } },
      include: { documents: { where: { expiryDate: { gte: start, lt: end } } } },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, employee: { companyId } },
      select: { groupId: true, id: true },
    }),
    prisma.reminder.findMany({
      where: { companyId, date: { lt: end } },
      include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
    }),
  ]);

  if (salaries.length || activeCount) {
    const payDay = payDayFor(year, month, company.payDay);
    const due = daysUntil(noonUtc(year, month, payDay));
    const paid = salaries.filter((row) => row.paid).length;
    let detail: string;
    let urgent = false;
    let done = false;
    if (!salaries.length) {
      detail = t(`لم يُنشأ المسير بعد — ${activeCount} موظف`, `Payroll not generated yet — ${activeCount} employee(s)`);
      urgent = due <= 0;
    } else if (paid === salaries.length) {
      detail = t(`صُرفت كلها (${paid})`, `All paid (${paid})`);
      done = true;
    } else {
      detail = t(`${salaries.length - paid} من ${salaries.length} غير مصروف`, `${salaries.length - paid} of ${salaries.length} unpaid`);
      urgent = due <= 0;
    }
    events.push({
      id: `salary-${year}-${month}`,
      day: payDay,
      kind: "salary",
      title: t(`استحقاق رواتب ${monthName(month, "ar")}`, `${monthName(month, "en")} payroll due`),
      detail,
      href: `/salaries?year=${year}&month=${month}`,
      urgent,
      done,
    });
  }

  for (const employee of employees) {
    const name = nameOf(employee);
    const docs = [
      { key: "id", label: pick(DOC_LABEL.ID_CARD, lang), date: employee.idExpiry, tab: "docs" },
      { key: "passport", label: pick(DOC_LABEL.PASSPORT, lang), date: employee.passportExpiry, tab: "docs" },
      { key: "residence", label: pick(DOC_LABEL.RESIDENCE, lang), date: employee.residenceExpiry, tab: "docs" },
      { key: "contract", label: pick(DOC_LABEL.CONTRACT, lang), date: employee.contractEnd, tab: "info" },
      ...employee.documents.map((document) => ({
        key: document.id,
        label: pick(DOC_LABEL[document.type], lang, t("مستند", "Document")),
        date: document.expiryDate,
        tab: "docs",
      })),
    ];
    for (const doc of docs) {
      if (!doc.date || !inMonth(doc.date)) continue;
      const days = daysUntil(new Date(doc.date));
      events.push({
        id: `doc-${employee.id}-${doc.key}`,
        day: new Date(doc.date).getUTCDate(),
        kind: "document",
        title: days < 0 ? t(`انتهت ${doc.label}`, `${doc.label} expired`) : t(`انتهاء ${doc.label}`, `${doc.label} expires`),
        detail: name,
        href: `/employees/${employee.id}?tab=${doc.tab}`,
        urgent: days <= company.alertUrgentDays,
      });
    }
    if (employee.dateOfBirth && new Date(employee.dateOfBirth).getUTCMonth() + 1 === month) {
      const dob = new Date(employee.dateOfBirth);
      const age = year - dob.getUTCFullYear();
      if (age >= 0) {
        events.push({
          id: `birthday-${employee.id}`,
          day: Math.min(dob.getUTCDate(), lastDayOf(year, month)),
          kind: "birthday",
          title: t(`عيد ميلاد ${name}`, `${name}'s birthday`),
          detail: age > 0 ? t(`يكمل ${age} سنة`, `Turns ${age}`) : undefined,
          href: `/employees/${employee.id}`,
        });
      }
    }
  }

  const groupIds = [...new Set(monthRows.map((row) => row.groupId).filter((id): id is string => Boolean(id)))];
  const singleIds = monthRows.filter((row) => !row.groupId).map((row) => row.id);
  if (groupIds.length || singleIds.length) {
    const rows = await prisma.attendance.findMany({
      where: { employee: { companyId }, OR: [{ groupId: { in: groupIds } }, { id: { in: singleIds } }] },
      include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
    });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.groupId || row.id;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const [key, list] of groups) {
      const sorted = [...list].sort((a, b) => +a.date - +b.date);
      const first = sorted[0];
      const meta = attendanceType(first.type);
      const isLeave = Boolean(meta?.balance) || first.type === "UNPAID_LEAVE" || first.type === "OFFICIAL";
      if (!isLeave) continue;
      const last = sorted[sorted.length - 1];
      const days = sorted.reduce((sum, row) => sum + (row.type === "HALF_DAY" ? 0.5 : 1), 0);
      const label = pick(ATTENDANCE_LABEL[first.type], lang, first.type);
      const name = nameOf(first.employee);
      const href = `/employees/${first.employeeId}?tab=attendance`;
      if (inMonth(first.date)) {
        events.push({
          id: `leave-start-${key}`,
          day: first.date.getUTCDate(),
          kind: "leave",
          title: t(`بداية ${label}`, `${label} starts`),
          detail: t(`${name} — ${daysLabel(days)} يوم حتى ${formatDate(last.date)}`, `${name} — ${daysLabel(days)} day(s) until ${formatDate(last.date)}`),
          href,
        });
      }
      if (sorted.length > 1 && inMonth(last.date)) {
        const back = new Date(last.date.getTime() + 86400000);
        events.push({
          id: `leave-end-${key}`,
          day: last.date.getUTCDate(),
          kind: "leave",
          title: t(`آخر يوم ${label}`, `${label} ends`),
          detail: t(`${name} — يعود ${formatDate(back)}`, `${name} — back on ${formatDate(back)}`),
          href,
        });
      }
    }
  }

  for (const reminder of reminders) {
    const day = reminderDayIn(reminder, year, month);
    if (day === null) continue;
    const days = daysUntil(noonUtc(year, month, day));
    const once = reminder.repeat === "NONE";
    const parts = [
      reminder.employee ? nameOf(reminder.employee) : null,
      reminder.notes,
      once ? null : pick(REMINDER_REPEAT[reminder.repeat], lang),
    ].filter(Boolean);
    events.push({
      id: `reminder-${reminder.id}`,
      day,
      kind: "reminder",
      title: reminder.title,
      detail: parts.join(" — ") || undefined,
      href: reminder.employee ? `/employees/${reminder.employee.id}` : `/calendar?year=${year}&month=${month}#day-${day}`,
      urgent: once ? !reminder.done && days <= 0 : days === 0,
      done: once && reminder.done,
      reminderId: reminder.id,
      repeat: reminder.repeat,
    });
  }

  return events.sort((a, b) => a.day - b.day || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
