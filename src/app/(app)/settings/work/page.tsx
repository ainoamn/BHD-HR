import Link from "next/link";
import { CalendarClock, Clock3, Pencil, Plus, Timer } from "lucide-react";
import type { WorkSchedule } from "@prisma/client";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction, secondaryBtn } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { toSchedule } from "@/lib/timesheet";
import { DEFAULT_WORKDAYS, NIGHT_FROM, NIGHT_TO, WEEKDAYS, hoursLabel, readWorkDays, scheduledMinutes } from "@/lib/work-time";
import { deleteSchedule, saveOvertimeSettings, saveSchedule } from "@/server/work-actions";

export const dynamic = "force-dynamic";

const clockText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

async function ScheduleForm({ schedule }: { schedule?: WorkSchedule }) {
  const { lang, t } = await getI18n();
  const days = schedule ? readWorkDays(schedule.workDays) : DEFAULT_WORKDAYS;
  return (
    <form action={saveSchedule} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {schedule ? <input type="hidden" name="id" value={schedule.id} /> : null}
      <Field label={t("الاسم", "Name")}>
        <input name="name" required maxLength={80} defaultValue={schedule?.name ?? ""} placeholder={t("الدوام الصباحي", "Morning shift")} className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("الاسم بالإنجليزية", "Name in English")}>
        <input name="nameEn" maxLength={80} defaultValue={schedule?.nameEn ?? ""} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("البداية", "Starts")}>
        <input type="time" name="startTime" required defaultValue={schedule?.startTime ?? "07:30"} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("النهاية", "Ends")} hint={t("نهاية قبل البداية تعني أن الدوام يمتد بعد منتصف الليل", "An end before the start runs past midnight")}>
        <input type="time" name="endTime" required defaultValue={schedule?.endTime ?? "16:30"} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("الاستراحة (دقيقة)", "Break (minutes)")} hint={t("لا تُحسب من ساعات العمل", "Not counted as working time")}>
        <input type="number" name="breakMinutes" min={0} max={240} defaultValue={schedule?.breakMinutes ?? 60} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <Field label={t("سماح التأخير (دقيقة)", "Late grace (minutes)")} hint={t("بعدها يُحسب التأخير كاملاً من بداية الدوام", "Past it, lateness counts from the start")}>
        <input type="number" name="graceMinutes" min={0} max={120} defaultValue={schedule?.graceMinutes ?? 10} dir="ltr" className={`${fieldClass} w-full`} />
      </Field>
      <fieldset className="min-w-0 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">{t("أيام العمل", "Working days")}</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day, index) => (
            <label key={index} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800">
              <input type="checkbox" name="workDays" value={index} defaultChecked={days.includes(index)} className="size-4 accent-teal-700" />
              {day[lang]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <SubmitButton>{schedule ? t("حفظ التعديل", "Save changes") : t("إضافة الجدول", "Add schedule")}</SubmitButton>
      </div>
    </form>
  );
}

export default async function WorkSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const { lang, t } = await getI18n();
  const [company, schedules, counts] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { defaultScheduleId: true, overtimeDayRate: true, overtimeNightRate: true, overtimeRestRate: true, latenessDeduct: true, salaryDays: true },
    }),
    prisma.workSchedule.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } }),
    prisma.employee.groupBy({ by: ["scheduleId"], where: { companyId: user.companyId, status: { not: "TERMINATED" } }, _count: true }),
  ]);
  const countBy = new Map(counts.map((row) => [row.scheduleId, row._count]));
  const unassigned = countBy.get(null) ?? 0;
  const pct = (rate: number) => `+${Math.round((rate - 1) * 100)}%`;

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={CalendarClock}
        title={t("الدوام والعمل الإضافي", "Schedules & overtime")}
        description={t(
          "جداول الدوام تحدد بداية ونهاية العمل وأيامه؛ ومنها يُحسب التأخير والخروج المبكر والعمل الإضافي تلقائياً من تسجيل الحضور في البوابة، ثم تعتمدها شهرياً فتُضاف إلى الرواتب.",
          "Schedules set when and on which days people work; lateness, early leave and overtime are then worked out from portal clock-ins, and once you approve a month they go into pay.",
        )}
      >
        <Link href="/attendance/timesheet" className={secondaryBtn}>
          <Timer size={16} />
          {t("ساعات الشهر", "Monthly hours")}
        </Link>
        <Link href="/settings" className={secondaryBtn}>
          {t("الإعدادات", "Settings")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <Card className="space-y-4">
        <SectionTitle hint={t("كل موظف يتبع جدوله الخاص إن حُدد في ملفه، وإلا الجدول الافتراضي.", "Each employee follows the schedule set in their file, else the default one.")}>
          {t("جداول الدوام", "Work schedules")}
        </SectionTitle>
        {schedules.length ? (
          <ul className="space-y-3">
            {schedules.map((schedule) => {
              const rule = toSchedule(schedule);
              const own = countBy.get(schedule.id) ?? 0;
              const isDefault = company.defaultScheduleId === schedule.id;
              return (
                <li key={schedule.id} className="rounded-xl ring-1 ring-inset ring-slate-200">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <Clock3 size={18} className="shrink-0 text-teal-700" />
                      <span className="min-w-0 font-semibold text-slate-900">{lang === "en" && schedule.nameEn ? schedule.nameEn : schedule.name}</span>
                      {isDefault ? <ToneBadge tone="teal">{t("الافتراضي", "Default")}</ToneBadge> : null}
                      <span className="text-sm text-slate-600" dir="ltr">
                        {schedule.startTime} – {schedule.endTime}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t(`${hoursLabel(scheduledMinutes(rule))} ساعة عمل`, `${hoursLabel(scheduledMinutes(rule))} h of work`)} ·{" "}
                        {rule.workDays.map((day) => WEEKDAYS[day][lang]).join(lang === "en" ? ", " : "، ")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t(`${own + (isDefault ? unassigned : 0)} موظف`, `${own + (isDefault ? unassigned : 0)} employee(s)`)}
                      </span>
                      <span className={`${linkAction} ms-auto`}>
                        <Pencil size={14} />
                        {t("تعديل", "Edit")}
                      </span>
                    </summary>
                    <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                      <ScheduleForm schedule={schedule} />
                      <form action={deleteSchedule}>
                        <input type="hidden" name="id" value={schedule.id} />
                        <SubmitButton
                          variant="danger"
                          confirm={t("حذف هذا الجدول؟ من كان عليه يتبع الجدول الافتراضي.", "Delete this schedule? Its employees will follow the default one.")}
                        >
                          {t("حذف الجدول", "Delete schedule")}
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Clock3}
            title={t("لا توجد جداول بعد", "No schedules yet")}
            text={t("أضف جدولاً أول ليُحسب منه التأخير والعمل الإضافي.", "Add a first schedule to work out lateness and overtime from it.")}
          />
        )}
        <details className="rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200" open={!schedules.length}>
          <summary className={`${linkAction} cursor-pointer list-none px-4 py-3`}>
            <Plus size={15} />
            {t("جدول جديد", "New schedule")}
          </summary>
          <div className="px-4 pb-4">
            <ScheduleForm />
          </div>
        </details>
      </Card>

      <Card>
        <SectionTitle
          hint={t(
            `الأجر بالساعة = الراتب الأساسي ÷ ${company.salaryDays} يوماً ÷ ساعات الجدول. الإضافي يُحسب بعد نهاية الدوام فقط، والليلي ما بين ${clockText(NIGHT_FROM)} و${clockText(NIGHT_TO)}، وكل ساعات يوم الراحة إضافي. الحد الأدنى في قانون العمل العُماني: ‎+25% نهاراً و‎+50% ليلاً.`,
            `Hourly wage = basic ÷ ${company.salaryDays} days ÷ the schedule's hours. Overtime counts only after the shift ends; night is ${clockText(NIGHT_FROM)}–${clockText(NIGHT_TO)}; every hour on a rest day is overtime. The Omani labour law minimum is +25% by day and +50% at night.`,
          )}
        >
          {t("أجر العمل الإضافي والتأخير", "Overtime pay and lateness")}
        </SectionTitle>
        <form action={saveOvertimeSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("الجدول الافتراضي", "Default schedule")}>
            <select name="defaultScheduleId" defaultValue={company.defaultScheduleId ?? ""} className={`${fieldClass} w-full`}>
              <option value="">{t("بلا جدول", "None")}</option>
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {lang === "en" && schedule.nameEn ? schedule.nameEn : schedule.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("مضاعف الإضافي النهاري", "Day overtime multiplier")} hint={pct(company.overtimeDayRate)}>
            <input type="number" name="overtimeDayRate" min={1} max={5} step="0.05" defaultValue={company.overtimeDayRate} dir="ltr" className={`${fieldClass} w-full`} />
          </Field>
          <Field label={t("مضاعف الإضافي الليلي", "Night overtime multiplier")} hint={pct(company.overtimeNightRate)}>
            <input type="number" name="overtimeNightRate" min={1} max={5} step="0.05" defaultValue={company.overtimeNightRate} dir="ltr" className={`${fieldClass} w-full`} />
          </Field>
          <Field label={t("مضاعف يوم الراحة", "Rest-day multiplier")} hint={pct(company.overtimeRestRate)}>
            <input type="number" name="overtimeRestRate" min={1} max={5} step="0.05" defaultValue={company.overtimeRestRate} dir="ltr" className={`${fieldClass} w-full`} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-slate-700 sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="latenessDeduct" value="1" defaultChecked={company.latenessDeduct} className="mt-0.5 size-4 accent-teal-700" />
            <span>
              {t("خصم التأخير والخروج المبكر من الراتب", "Deduct lateness and early leave from pay")}
              <span className="block text-xs text-slate-500">
                {t("بالأجر العادي للساعة عن كل دقيقة، عند اعتماد ساعات الشهر.", "At the plain hourly wage per minute, when the month's hours are approved.")}
              </span>
            </span>
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
