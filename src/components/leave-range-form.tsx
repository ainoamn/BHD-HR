"use client";

import { useMemo, useState } from "react";
import { ATTENDANCE_TYPES, BALANCE_LABEL, attendanceType, type BalanceKey } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { countInclusiveDays } from "@/lib/leave";
import { daysLabel, todayInputValue } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { fieldClass, primaryBtn } from "./ui";

export type BalanceSnapshot = Record<BalanceKey, number>;

export function LeaveRangeForm({
  action,
  employees,
  balances,
  returnTo,
  defaultType = "LEAVE",
  warnDays = 5,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employees: { id: string; fullName: string }[];
  balances: Record<string, BalanceSnapshot>;
  returnTo: string;
  defaultType?: string;
  warnDays?: number;
}) {
  const { lang, t } = useLang();
  const today = todayInputValue();
  const [employeeId, setEmployeeId] = useState(employees.length === 1 ? employees[0].id : "");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [type, setType] = useState(defaultType);
  const meta = attendanceType(type);
  const [deductSalary, setDeductSalary] = useState(Boolean(meta?.deductsSalary));
  const calendarDays = useMemo(() => countInclusiveDays(from, to), [from, to]);
  const reversed = Boolean(from && to && to < from);
  const halfDayRange = type === "HALF_DAY" && calendarDays > 1;
  const days = type === "HALF_DAY" ? (calendarDays === 1 ? 0.5 : 0) : calendarDays;
  const balanceKey = meta?.balance;
  const remaining = balanceKey && employeeId ? balances[employeeId]?.[balanceKey] ?? 0 : null;
  const after = remaining === null ? null : remaining - days;
  const insufficient = after !== null && after < 0;
  const nearlyOut = after !== null && !insufficient && after <= warnDays && days > 0;
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const blocked = reversed || halfDayRange || (insufficient && !allowOverdraft) || days <= 0 || !employeeId;
  const balanceName = balanceKey ? pick(BALANCE_LABEL[balanceKey], lang) : "";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="deductsSalary" value={deductSalary ? "1" : "0"} />
      <input type="hidden" name="allowOverdraft" value={insufficient && allowOverdraft ? "1" : "0"} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {employees.length > 1 ? (
          <label className="block space-y-1.5 xl:col-span-2">
            <span className="text-sm font-medium text-slate-700">{t("الموظف", "Employee")}</span>
            <select className={`${fieldClass} w-full`} name="employeeId" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>
              <option value="">{t("اختر الموظف", "Choose employee")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="employeeId" value={employeeId} />
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t("من تاريخ", "From")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="from" value={from} onChange={(event) => setFrom(event.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t("إلى تاريخ", "To")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="to" value={to} onChange={(event) => setTo(event.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t("نوع الحالة", "Type")}</span>
          <select
            className={`${fieldClass} w-full`}
            name="type"
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              setType(next);
              setDeductSalary(Boolean(attendanceType(next)?.deductsSalary));
            }}
          >
            {ATTENDANCE_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {pick(item.label, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 xl:col-span-2">
          <span className="text-sm font-medium text-slate-700">{t("ملاحظة", "Note")}</span>
          <input className={`${fieldClass} w-full`} name="notes" placeholder={t("مثال: ذهاب إلى المستشفى", "e.g. hospital visit")} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={deductSalary} onChange={(event) => setDeductSalary(event.target.checked)} />
        {t("خصم المبلغ من الراتب", "Deduct from salary")}
      </label>
      <div className={`rounded-xl px-4 py-3 text-sm ${insufficient || nearlyOut || reversed || halfDayRange ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-teal-50 text-teal-950"}`}>
        <p className="font-bold">
          {t("عدد الأيام:", "Days:")} {daysLabel(days)}
        </p>
        {reversed ? <p>{t("تاريخ النهاية قبل تاريخ البداية.", "End date is before start date.")}</p> : null}
        {halfDayRange ? <p>{t("نصف اليوم يُسجل في يوم واحد فقط.", "A half day can only be one date.")}</p> : null}
        {balanceKey && remaining !== null ? (
          <p>
            {t(
              `سيُخصم من ${balanceName}. المتبقي الآن ${daysLabel(remaining)} يوم، وبعد التسجيل ${daysLabel(after ?? 0)} يوم.`,
              `Deducted from ${balanceName}. Remaining now ${daysLabel(remaining)}, after saving ${daysLabel(after ?? 0)}.`,
            )}
          </p>
        ) : balanceKey ? (
          <p>{t(`سيُخصم من ${balanceName}.`, `Deducted from ${balanceName}.`)}</p>
        ) : (
          <p>{t("هذه الحالة لا تُخصم من رصيد الإجازات.", "This type does not use a leave balance.")}</p>
        )}
        {insufficient ? (
          <div className="mt-2 rounded-lg bg-white/70 p-2.5">
            <p className="font-bold">
              {t(
                `⚠ تجاوز الرصيد بـ ${daysLabel(-(after ?? 0))} يوم.`,
                `⚠ Exceeds the balance by ${daysLabel(-(after ?? 0))} day(s).`,
              )}
            </p>
            <label className="mt-1.5 flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={allowOverdraft} onChange={(event) => setAllowOverdraft(event.target.checked)} />
              <span>
                {t(
                  "التسجيل رغم التجاوز. سيظهر للموظف تنبيه أحمر حتى يُضاف رصيد يغطي الأيام الزائدة.",
                  "Record it anyway. The employee will show a red alert until extra days cover the difference.",
                )}
              </span>
            </label>
          </div>
        ) : nearlyOut ? (
          <p className="mt-1 font-bold">
            {after === 0
              ? t(`⚠ بعد هذا التسجيل ينفد ${balanceName} بالكامل.`, `⚠ After this, ${balanceName} will be fully used.`)
              : t(`⚠ اقترب الموظف من نفاد ${balanceName}: سيتبقى ${daysLabel(after ?? 0)} يوم فقط.`, `⚠ ${balanceName} is almost used: only ${daysLabel(after ?? 0)} day(s) will remain.`)}
          </p>
        ) : null}
        <p>
          {deductSalary
            ? t("يُخصم مبلغ هذه الأيام من الراتب عند احتساب الشهر.", "These days will be deducted from the monthly salary.")
            : t("بدون خصم من الراتب.", "No salary deduction.")}
        </p>
      </div>
      <button type="submit" className={primaryBtn} disabled={blocked}>
        {t("تسجيل", "Save")}
      </button>
    </form>
  );
}
