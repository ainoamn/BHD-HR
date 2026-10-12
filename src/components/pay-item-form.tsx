"use client";

import { useState } from "react";
import { PAYMENT_LABEL, PAY_KINDS, PAY_KIND_HINT, PAY_KIND_LABEL } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { money, round3 } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { SubmitButton } from "./submit-button";
import { fieldClass } from "./ui";

type Action = (formData: FormData) => void | Promise<void>;

export type PayItemValues = {
  id: string;
  kind: string;
  title: string;
  amount: number;
  issuedAt: Date | string;
  startYear: number;
  startMonth: number;
  months: number | null;
  paymentMethod: string | null;
  notes: string | null;
};

function monthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dateValue(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

/** Add or edit form for an advance, bonus, allowance, entitlement or deduction. */
export function PayItemForm({
  action,
  returnTo,
  employees,
  employeeId,
  item,
  defaultKind = "ADVANCE",
  defaultStart,
  today,
  currency,
}: {
  action: Action;
  returnTo: string;
  employees?: { id: string; label: string }[];
  employeeId?: string;
  item?: PayItemValues;
  defaultKind?: string;
  defaultStart: string;
  today: string;
  currency: string;
}) {
  const { lang, t } = useLang();
  const [kind, setKind] = useState(item?.kind || defaultKind);
  const [repeat, setRepeat] = useState(item ? (item.months === null ? "ongoing" : item.months > 1 ? "months" : "once") : "once");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [installments, setInstallments] = useState(item?.kind === "ADVANCE" && item.months ? String(item.months) : "1");
  const advance = kind === "ADVANCE";
  const instalment = Number(amount) > 0 && Number(installments) > 0 ? round3(Number(amount) / Number(installments)) : 0;

  return (
    <form action={action} className="grid gap-3 text-start sm:grid-cols-2">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {employeeId ? <input type="hidden" name="employeeId" value={employeeId} /> : null}
      <input type="hidden" name="returnTo" value={returnTo} />

      {employees ? (
        <label className="min-w-0 space-y-1.5 text-sm sm:col-span-2">
          <span className="block font-medium text-slate-700">{t("الموظف", "Employee")}</span>
          <select className={`${fieldClass} w-full`} name="employeeId" required defaultValue="">
            <option value="" disabled>
              {t("اختر الموظف", "Choose the employee")}
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="min-w-0 space-y-1.5 text-sm">
        <span className="block font-medium text-slate-700">{t("النوع", "Type")}</span>
        <select className={`${fieldClass} w-full`} name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {PAY_KINDS.map((value) => (
            <option key={value} value={value}>
              {pick(PAY_KIND_LABEL[value], lang)}
            </option>
          ))}
        </select>
        <span className="block text-xs text-slate-500">{pick(PAY_KIND_HINT[kind], lang)}</span>
      </label>
      <label className="min-w-0 space-y-1.5 text-sm">
        <span className="block font-medium text-slate-700">{t("الوصف", "Description")}</span>
        <input className={`${fieldClass} w-full`} name="title" maxLength={120} defaultValue={item?.title || ""} placeholder={pick(PAY_KIND_LABEL[kind], lang)} />
      </label>

      <label className="min-w-0 space-y-1.5 text-sm">
        <span className="block font-medium text-slate-700">
          {advance ? t("مبلغ السلفة", "Advance amount") : repeat === "once" ? t("المبلغ", "Amount") : t("المبلغ لكل شهر", "Amount per month")} ({currency})
        </span>
        <input
          className={`${fieldClass} w-full`}
          type="number"
          name="amount"
          min="0.001"
          step="0.001"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label className="min-w-0 space-y-1.5 text-sm">
        <span className="block font-medium text-slate-700">{advance ? t("تاريخ تسليم السلفة", "Date handed over") : t("تاريخ الاعتماد", "Approval date")}</span>
        <input className={`${fieldClass} w-full`} type="date" name="issuedAt" defaultValue={item ? dateValue(item.issuedAt) : today} required />
      </label>

      {advance ? (
        <>
          <label className="min-w-0 space-y-1.5 text-sm">
            <span className="block font-medium text-slate-700">{t("عدد الأقساط (أشهر)", "Instalments (months)")}</span>
            <input
              className={`${fieldClass} w-full`}
              type="number"
              name="installments"
              min="1"
              max="120"
              required
              value={installments}
              onChange={(event) => setInstallments(event.target.value)}
            />
            {instalment > 0 ? (
              <span className="block text-xs text-teal-800">
                {t(`القسط الشهري ≈ ${money(instalment, currency)}`, `Monthly instalment ≈ ${money(instalment, currency)}`)}
              </span>
            ) : null}
          </label>
          <label className="min-w-0 space-y-1.5 text-sm">
            <span className="block font-medium text-slate-700">{t("أول قسط يُخصم من راتب شهر", "First instalment from the salary of")}</span>
            <input className={`${fieldClass} w-full`} type="month" name="start" defaultValue={item ? monthValue(item.startYear, item.startMonth) : defaultStart} required />
          </label>
          <label className="min-w-0 space-y-1.5 text-sm sm:col-span-2">
            <span className="block font-medium text-slate-700">{t("طريقة التسليم", "Handed over by")}</span>
            <select className={`${fieldClass} w-full`} name="paymentMethod" defaultValue={item?.paymentMethod || "CASH"}>
              {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {pick(label, lang)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="min-w-0 space-y-1.5 text-sm">
            <span className="block font-medium text-slate-700">{t("يُطبّق من راتب شهر", "Applies from the salary of")}</span>
            <input className={`${fieldClass} w-full`} type="month" name="start" defaultValue={item ? monthValue(item.startYear, item.startMonth) : defaultStart} required />
          </label>
          <fieldset className="min-w-0 space-y-1.5 text-sm">
            <legend className="mb-1.5 font-medium text-slate-700">{t("التكرار", "Repeat")}</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["once", t("مرة واحدة", "Once")],
                  ["months", t("عدد أشهر", "Number of months")],
                  ["ongoing", t("كل شهر حتى الإيقاف", "Every month until stopped")],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 transition has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-900"
                >
                  <input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} className="accent-teal-700" />
                  {label}
                </label>
              ))}
            </div>
            {repeat === "months" ? (
              <input
                className={`${fieldClass} mt-1 w-full`}
                type="number"
                name="monthsCount"
                min="1"
                max="120"
                required
                defaultValue={item?.months && item.months > 1 ? item.months : 3}
                aria-label={t("عدد الأشهر", "Number of months")}
              />
            ) : null}
          </fieldset>
        </>
      )}

      <label className="min-w-0 space-y-1.5 text-sm sm:col-span-2">
        <span className="block font-medium text-slate-700">{t("ملاحظات", "Notes")}</span>
        <input className={`${fieldClass} w-full`} name="notes" maxLength={500} defaultValue={item?.notes || ""} />
      </label>
      <div className="pt-1 sm:col-span-2">
        <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الحفظ...", "Saving...")}>
          {item ? t("حفظ التعديل", "Save changes") : t("إضافة", "Add")}
        </SubmitButton>
      </div>
    </form>
  );
}
