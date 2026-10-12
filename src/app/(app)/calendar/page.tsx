import Link from "next/link";
import { BellPlus, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, SectionTitle, ToneBadge, fieldClass, primaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { EVENT_KINDS, type EventKind, REMINDER_REPEAT, getCalendarEvents, lastDayOf } from "@/lib/calendar";
import { monthName } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import type { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cn, readPeriod, todayInputValue } from "@/lib/utils";
import { createReminder, deleteReminder, toggleReminder } from "@/server/reminder-actions";

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_AR_SHORT = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_EN_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_PREVIEW = 3;
const monthBtn =
  "flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-card transition duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.96] sm:size-10";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; show?: string; new?: string; date?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("calendar.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const allKinds = EVENT_KINDS.map((item) => item.id);
  const requested = (sp.show || "").split(",").filter((value): value is EventKind => (allKinds as string[]).includes(value));
  const shown = new Set<EventKind>(requested.length ? requested : allKinds);
  const [allEvents, employees] = await Promise.all([
    getCalendarEvents(user.companyId, year, month, lang),
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const kindPermission: Record<EventKind, Permission> = {
    salary: "salaries.view",
    document: "documents.view",
    birthday: "employees.view",
    leave: "attendance.view",
    reminder: "calendar.view",
  };
  const allow = { create: can(user, "calendar.create"), edit: can(user, "calendar.edit"), remove: can(user, "calendar.delete") };
  const events = allEvents.filter((event) => shown.has(event.kind) && can(user, kindPermission[event.kind]));
  const byDay = new Map<number, typeof events>();
  for (const event of events) byDay.set(event.day, [...(byDay.get(event.day) || []), event]);

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? now.getDate() : 0;
  const daysInMonth = lastDayOf(year, month);
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);

  const showParam = requested.length && requested.length < allKinds.length ? requested.join(",") : "";
  const link = (params: { year?: number; month?: number; show?: string; extra?: Record<string, string> }) => {
    const query = new URLSearchParams({ year: String(params.year ?? year), month: String(params.month ?? month) });
    const show = params.show ?? showParam;
    if (show) query.set("show", show);
    for (const [key, value] of Object.entries(params.extra || {})) query.set(key, value);
    return `/calendar?${query.toString()}`;
  };
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const toggleKind = (kind: EventKind) => {
    const set = new Set(shown);
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    const list = allKinds.filter((item) => set.has(item));
    return link({ show: list.length === allKinds.length || list.length === 0 ? "" : list.join(",") });
  };
  const returnTo = link({});
  const kindMeta = (kind: EventKind) => EVENT_KINDS.find((item) => item.id === kind)!;
  const dayTitle = (day: number) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-OM-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, day, 12)),
    );
  const pad = (value: number) => String(value).padStart(2, "0");
  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || "") ? sp.date! : isCurrentMonth ? todayInputValue() : `${year}-${pad(month)}-01`;
  const openForm = sp.new === "1" || Boolean(sp.error);
  const urgentCount = events.filter((event) => event.urgent && !event.done).length;
  const weekdays = lang === "en" ? WEEKDAYS_EN : WEEKDAYS_AR;
  const weekdaysShort = lang === "en" ? WEEKDAYS_EN_SHORT : WEEKDAYS_AR_SHORT;
  const employeeName = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="screen-fit flex min-w-0 flex-col gap-3">
        <div className="flex animate-fade-up items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-card ring-1 ring-slate-200 sm:flex">
              <CalendarClock size={21} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{t("التقويم", "Calendar")}</h1>
              <p className="hidden truncate text-sm text-slate-500 md:block">
                {t(
                  "الرواتب، وانتهاء الوثائق والعقود، وأعياد الميلاد، والإجازات، وتذكيراتك — في مكان واحد.",
                  "Pay days, document and contract expiries, birthdays, leave and your reminders — in one place.",
                )}
              </p>
            </div>
          </div>
          {allow.create ? (
            <Link href={`${link({ extra: { new: "1" } })}#reminder`} className={cn(primaryBtn, "shrink-0")}>
              <BellPlus size={16} />
              <span className="sm:hidden">{t("تذكير", "Reminder")}</span>
              <span className="hidden sm:inline">{t("تذكير جديد", "New reminder")}</span>
            </Link>
          ) : null}
        </div>

        <Flash error={sp.error} message={sp.message} />

        <Card className="flex min-h-0 flex-1 flex-col gap-2.5 p-2 sm:gap-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 pt-1 sm:p-0">
            <div className="flex items-center gap-1.5">
              <Link href={link(prev)} className={monthBtn} aria-label={t("الشهر السابق", "Previous month")}>
                {lang === "en" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </Link>
              <h2 className="tabular min-w-32 whitespace-nowrap text-center text-base font-bold text-slate-900 sm:min-w-40 sm:text-xl">
                {monthName(month, lang)} {year}
              </h2>
              <Link href={link(next)} className={monthBtn} aria-label={t("الشهر التالي", "Next month")}>
                {lang === "en" ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </Link>
              {!isCurrentMonth ? (
                <Link
                  href={link({ year: now.getFullYear(), month: now.getMonth() + 1 })}
                  className="ms-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-inset ring-teal-200 transition hover:bg-teal-50"
                >
                  {t("اليوم", "Today")}
                </Link>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ToneBadge tone="slate">{t(`${events.length} حدث`, `${events.length} event(s)`)}</ToneBadge>
              {urgentCount ? <ToneBadge tone="red">{t(`${urgentCount} عاجل`, `${urgentCount} urgent`)}</ToneBadge> : null}
            </div>
          </div>
          <div className="-mx-2 flex shrink-0 gap-1.5 overflow-x-auto px-2 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
            {EVENT_KINDS.map((kind) => {
              const active = shown.has(kind.id);
              const count = allEvents.filter((event) => event.kind === kind.id).length;
              return (
                <Link
                  key={kind.id}
                  href={toggleKind(kind.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition sm:px-3",
                    active ? kind.chip : "bg-white text-slate-400 ring-slate-200 line-through",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", active ? kind.dot : "bg-slate-300")} />
                  {pick(kind.label, lang)}
                  <span className="opacity-70">{count}</span>
                </Link>
              );
            })}
          </div>

          <div className="grid shrink-0 grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 sm:gap-1.5 sm:text-xs">
            {weekdays.map((name, index) => (
              <div key={name} className={cn("truncate py-0.5", index >= 5 && "text-slate-400")}>
                <span className="sm:hidden">{weekdaysShort[index]}</span>
                <span className="hidden sm:inline">{name}</span>
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 gap-1 sm:gap-1.5" style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}>
            {cells.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} className="min-h-0 rounded-xl bg-slate-50/60" />;
              const list = byDay.get(day) || [];
              const weekend = index % 7 >= 5;
              const hasUrgent = list.some((event) => event.urgent && !event.done);
              return (
                <a
                  key={day}
                  href={list.length ? `#day-${day}` : `${link({ extra: { new: "1", date: `${year}-${pad(month)}-${pad(day)}` } })}#reminder`}
                  title={list.length ? list.map((event) => event.title).join("\n") : undefined}
                  className={cn(
                    "group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border p-1 text-start transition duration-150 hover:border-teal-300 hover:shadow-card sm:p-1.5",
                    weekend ? "bg-sand-50" : "bg-white",
                    day === todayDay ? "border-teal-600 ring-2 ring-teal-100" : hasUrgent ? "border-red-200" : "border-slate-200/70",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      day === todayDay ? "bg-teal-700 text-white" : hasUrgent ? "bg-red-100 text-red-700" : "text-slate-700",
                    )}
                  >
                    {day}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-0.5 pt-0.5 sm:hidden">
                    {list.slice(0, 4).map((event) => (
                      <span key={event.id} className={cn("h-1.5 w-1.5 rounded-full", event.urgent && !event.done ? "bg-red-500" : kindMeta(event.kind).dot)} />
                    ))}
                  </span>
                  <span className="mt-1 hidden min-h-0 min-w-0 space-y-0.5 overflow-hidden sm:block">
                    {list.slice(0, DAY_PREVIEW).map((event) => (
                      <span
                        key={event.id}
                        className={cn(
                          "block truncate rounded px-1 py-0.5 text-[10px] font-medium ring-1 lg:text-[11px]",
                          event.urgent && !event.done ? "bg-red-50 text-red-700 ring-red-200" : kindMeta(event.kind).chip,
                          event.done && "line-through opacity-60",
                        )}
                      >
                        {event.title}
                      </span>
                    ))}
                    {list.length > DAY_PREVIEW ? (
                      <span className="block px-1 text-[10px] font-semibold text-slate-500">
                        {t(`+${list.length - DAY_PREVIEW} أخرى`, `+${list.length - DAY_PREVIEW} more`)}
                      </span>
                    ) : null}
                  </span>
                </a>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="min-w-0 xl:relative">
        <div className="thin-scroll space-y-4 xl:absolute xl:inset-0 xl:overflow-y-auto xl:overscroll-contain xl:pb-1">
          {allow.create ? (
            <details id="reminder" open={openForm} className="group scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70">
                <span className="flex items-center gap-3 font-bold text-slate-900">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-100">
                    <BellPlus size={18} />
                  </span>
                  {t("إضافة تذكير", "Add reminder")}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              <form action={createReminder} className="space-y-3 border-t border-slate-100 px-4 py-4">
                <input type="hidden" name="returnTo" value={returnTo} />
                <Field label={t("العنوان *", "Title *")}>
                  <input className={`${fieldClass} w-full`} name="title" required placeholder={t("مثال: تجديد عقد الإيجار", "e.g. Renew the lease")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("التاريخ *", "Date *")}>
                    <input className={`${fieldClass} w-full`} type="date" name="date" defaultValue={defaultDate} required />
                  </Field>
                  <Field label={t("التكرار", "Repeat")}>
                    <select className={`${fieldClass} w-full`} name="repeat" defaultValue="NONE">
                      {Object.entries(REMINDER_REPEAT).map(([value, label]) => (
                        <option key={value} value={value}>
                          {pick(label, lang)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={t("مرتبط بموظف (اختياري)", "Linked employee (optional)")}>
                  <select className={`${fieldClass} w-full`} name="employeeId" defaultValue="">
                    <option value="">{t("بدون", "None")}</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employeeName(employee)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("ملاحظات", "Notes")}>
                  <textarea className={`${fieldClass} w-full`} name="notes" rows={2} />
                </Field>
                <SubmitButton className="w-full">{t("حفظ التذكير", "Save reminder")}</SubmitButton>
              </form>
            </details>
          ) : null}

          <Card>
            <SectionTitle>{t(`أحداث ${monthName(month, "ar")}`, `${monthName(month, "en")} events`)}</SectionTitle>
            {events.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <CalendarClock size={22} />
                </span>
                <p className="mt-3 text-sm text-slate-500">{t("لا توجد أحداث في هذا الشهر.", "No events this month.")}</p>
              </div>
            ) : null}
            <div className="space-y-4">
              {[...byDay.entries()].map(([day, list]) => (
                <section key={day} id={`day-${day}`} className="scroll-mt-24">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className={cn("text-sm font-bold", day === todayDay ? "text-teal-800" : "text-slate-700")}>
                      {dayTitle(day)}
                      {day === todayDay ? <span className="ms-1.5 text-xs font-semibold">({t("اليوم", "today")})</span> : null}
                    </h3>
                    {allow.create ? (
                      <Link
                        href={`${link({ extra: { new: "1", date: `${year}-${pad(month)}-${pad(day)}` } })}#reminder`}
                        className="text-xs font-semibold text-teal-800"
                      >
                        + {t("تذكير", "Reminder")}
                      </Link>
                    ) : null}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((event) => (
                      <li
                        key={event.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                          event.urgent && !event.done ? "border-red-200 bg-red-50" : "border-slate-200/70 bg-white",
                        )}
                      >
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", kindMeta(event.kind).dot)} />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={event.href}
                            className={cn("block break-words text-sm font-semibold hover:text-teal-800", event.done ? "text-slate-400 line-through" : event.urgent ? "text-red-800" : "text-slate-900")}
                          >
                            {event.title}
                          </Link>
                          {event.detail ? <p className="break-words text-xs text-slate-500">{event.detail}</p> : null}
                        </div>
                        {event.urgent && !event.done ? <ToneBadge tone="red">{t("عاجل", "Urgent")}</ToneBadge> : null}
                        {event.done && event.kind === "salary" ? <ToneBadge tone="green">{t("تم", "Done")}</ToneBadge> : null}
                        {event.reminderId && (allow.edit || allow.remove) ? (
                          <div className="flex shrink-0 items-center gap-1">
                            {event.repeat === "NONE" && allow.edit ? (
                              <form action={toggleReminder}>
                                <input type="hidden" name="id" value={event.reminderId} />
                                <input type="hidden" name="returnTo" value={returnTo} />
                                <button
                                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-800"
                                  title={event.done ? t("إعادة فتح", "Reopen") : t("تم الإنجاز", "Mark done")}
                                  aria-label={event.done ? t("إعادة فتح", "Reopen") : t("تم الإنجاز", "Mark done")}
                                >
                                  {event.done ? <RotateCcw size={15} /> : <Check size={15} />}
                                </button>
                              </form>
                            ) : null}
                            {allow.remove ? (
                              <form action={deleteReminder}>
                                <input type="hidden" name="id" value={event.reminderId} />
                                <input type="hidden" name="returnTo" value={returnTo} />
                                <button className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" title={t("حذف", "Delete")} aria-label={t("حذف", "Delete")}>
                                  <Trash2 size={15} />
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
