"use client";

import { useMemo, useState } from "react";
import { type AttendanceChoice, countInclusiveDays } from "@/lib/leave";
import { daysLabel, todayInputValue } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { SearchSelect } from "./search-select";
import { fieldClass, primaryBtn } from "./ui";

/** Remaining days per leave-type key, per employee; a missing key means the type does not apply to that employee. */
export type BalanceSnapshot = Record<string, number>;

export function LeaveRangeForm({
  action,
  employees,
  balances,
  choices,
  returnTo,
  defaultType = "ABSENT",
  warnDays = 5,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employees: { id: string; fullName: string; employeeNumber?: string | null; idNumber?: string | null }[];
  balances: Record<string, BalanceSnapshot>;
  choices: AttendanceChoice[];
  returnTo: string;
  defaultType?: string;
  warnDays?: number;
}) {
  const { t } = useLang();
  const today = todayInputValue();
  const [employeeId, setEmployeeId] = useState(employees.length === 1 ? employees[0].id : "");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [type, setType] = useState(defaultType);
  const choice = choices.find((item) => item.value === type);
  const [deductSalary, setDeductSalary] = useState(Boolean(choice?.deductsSalary));
  const calendarDays = useMemo(() => countInclusiveDays(from, to), [from, to]);
  const reversed = Boolean(from && to && to < from);
  const halfDayRange = type === "HALF_DAY" && calendarDays > 1;
  const days = type === "HALF_DAY" ? (calendarDays === 1 ? 0.5 : 0) : calendarDays;
  const balanceKey = choice?.balanceKey || null;
  const employeeBalances = employeeId ? balances[employeeId] : undefined;
  const notCovered = Boolean(balanceKey && employeeBalances && !(balanceKey in employeeBalances));
  const remaining = balanceKey && employeeBalances && !notCovered ? employeeBalances[balanceKey] : null;
  const after = remaining === null ? null : remaining - days;
  const insufficient = after !== null && after < 0;
  const nearlyOut = after !== null && !insufficient && after <= warnDays && days > 0;
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const blocked = reversed || halfDayRange || notCovered || (insufficient && !allowOverdraft) || days <= 0 || !employeeId;
  const balanceName = choice?.balanceKey ? choice.label : "";
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.fullName,
        hint: employee.employeeNumber || null,
        keywords: [employee.employeeNumber, employee.idNumber].filter(Boolean).join(" "),
      })),
    [employees],
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="deductsSalary" value={deductSalary ? "1" : "0"} />
      <input type="hidden" name="allowOverdraft" value={insufficient && allowOverdraft ? "1" : "0"} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {employees.length > 1 ? (
          <label className="block space-y-1.5 xl:col-span-2">
            <span className="text-sm font-medium text-slate-700">{t("الموظف", "Employee")}</span>
            <SearchSelect
              name="employeeId"
              options={employeeOptions}
              defaultValue={employeeId}
              emptyLabel={t("اختر الموظف", "Choose employee")}
              placeholder={t("ابحث بالاسم أو الرقم أو المدني", "Search name, number or civil ID")}
              ariaLabel={t("الموظف", "Employee")}
              onChange={setEmployeeId}
            />
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
              setDeductSalary(Boolean(choices.find((item) => item.value === next)?.deductsSalary));
            }}
          >
            {choices.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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
        {notCovered ? (
          <p className="font-bold">{t(`${balanceName} غير مشمولة لهذه الوظيفة.`, `${balanceName} does not apply to this job.`)}</p>
        ) : balanceKey && remaining !== null ? (
          <p>
            {t(`${balanceName}: متبقي ${daysLabel(remaining)} ← بعد التسجيل ${daysLabel(after ?? 0)}`, `${balanceName}: ${daysLabel(remaining)} left → ${daysLabel(after ?? 0)} after`)}
          </p>
        ) : balanceKey ? (
          <p>{t(`من رصيد ${balanceName}`, `From ${balanceName} balance`)}</p>
        ) : (
          <p>{deductSalary ? t("خصم من الراتب فقط", "Salary deduction only") : t("بدون خصم راتب أو رصيد", "No pay or balance cut")}</p>
        )}
        {insufficient ? (
          <div className="mt-2 rounded-lg bg-surface/70 p-2.5">
            <p className="font-bold">{t(`تجاوز الرصيد بـ ${daysLabel(-(after ?? 0))}`, `Exceeds balance by ${daysLabel(-(after ?? 0))}`)}</p>
            <label className="mt-1.5 flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={allowOverdraft} onChange={(event) => setAllowOverdraft(event.target.checked)} />
              <span>{t("التسجيل رغم التجاوز", "Record anyway")}</span>
            </label>
          </div>
        ) : nearlyOut ? (
          <p className="mt-1 font-bold">
            {after === 0
              ? t(`ينفد ${balanceName} بعد التسجيل`, `${balanceName} will be used up`)
              : t(`سيتبقى ${daysLabel(after ?? 0)} من ${balanceName}`, `${daysLabel(after ?? 0)} of ${balanceName} will remain`)}
          </p>
        ) : null}
      </div>
      <button type="submit" className={primaryBtn} disabled={blocked}>
        {t("تسجيل", "Save")}
      </button>
    </form>
  );
}
