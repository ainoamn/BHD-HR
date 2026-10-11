"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ALLOWANCE_BASES, ALLOWANCE_CALCS, ALLOWANCE_FREQUENCIES, allowanceAmount, payMonths } from "@/lib/allowances";
import { ALLOWANCE_BASE, ALLOWANCE_CALC, ALLOWANCE_FREQUENCY, monthName, termText } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { money, round3 } from "@/lib/utils";
import { useLang } from "./lang-provider";
import { fieldClass } from "./ui";

export type AllowanceTypeOption = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  calc: string;
  base: string;
  value: number;
  frequency: string;
  payMonth: number;
};

export type AllowanceRowValue = {
  id?: string;
  allowanceTypeId: string;
  calc: string;
  base: string;
  value: number;
  frequency: string;
  payMonth: number;
  start: string;
  active: boolean;
};

type Row = Omit<AllowanceRowValue, "value"> & { key: string; value: string };

let counter = 0;
const nextKey = () => `row-${++counter}`;

/** The employee's allowances (علاوات), submitted as JSON in `allowances`; each row starts from its type's defaults. */
export function AllowancesEditor({
  types,
  defaults,
  pay,
  currency,
  defaultStart,
  canManageTypes,
}: {
  types: AllowanceTypeOption[];
  defaults: AllowanceRowValue[];
  pay: { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number };
  currency: string;
  defaultStart: string;
  canManageTypes: boolean;
}) {
  const { lang, t } = useLang();
  const [rows, setRows] = useState<Row[]>(() => defaults.map((row) => ({ ...row, key: nextKey(), value: String(row.value) })));
  const update = (key: string, patch: Partial<Row>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const fromType = (typeId: string): Partial<Row> => {
    const type = types.find((item) => item.id === typeId);
    return type ? { allowanceTypeId: type.id, calc: type.calc, base: type.base, value: String(type.value), frequency: type.frequency, payMonth: type.payMonth } : { allowanceTypeId: typeId };
  };
  const payload: AllowanceRowValue[] = rows
    .filter((row) => row.allowanceTypeId)
    .map(({ key: _key, ...row }) => ({ ...row, value: Number(row.value) || 0 }));
  const monthlyTotal = round3(
    payload.filter((row) => row.active && row.frequency === "MONTHLY").reduce((sum, row) => sum + allowanceAmount(row, pay), 0),
  );

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name="allowancesPresent" value="1" />
      <input type="hidden" name="allowances" value={JSON.stringify(payload)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{t("العلاوات", "Allowances")}</h3>
          <p className="text-xs text-slate-500">
            {t("تُضاف تلقائياً إلى راتب كل شهر تستحق فيه.", "Added automatically to every salary month they fall due in.")}
            {canManageTypes ? (
              <>
                {" "}
                <Link href="/settings/hr?tab=allowances" className="font-semibold text-teal-800 underline" target="_blank">
                  {t("إدارة مسميات العلاوات", "Manage allowance names")}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 disabled:opacity-50"
          disabled={types.length === 0}
          onClick={() => setRows((list) => [...list, { key: nextKey(), allowanceTypeId: "", calc: "FIXED", base: "BASIC", value: "0", frequency: "MONTHLY", payMonth: 1, start: defaultStart, active: true, ...fromType(types[0]?.id || "") }])}
        >
          <Plus size={16} />
          {t("إضافة علاوة", "Add allowance")}
        </button>
      </div>
      {types.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("لا توجد مسميات علاوات بعد. أضفها من الضبط ← الموارد البشرية ← العلاوات.", "No allowance names yet. Add them in Settings → HR → Allowances.")}
        </p>
      ) : null}
      {rows.map((row) => {
        const amount = allowanceAmount({ calc: row.calc, base: row.base, value: Number(row.value) || 0 }, pay);
        const months = payMonths(row.frequency, row.payMonth);
        return (
          <div key={row.key} className={`grid gap-2.5 rounded-2xl border p-3.5 sm:grid-cols-6 ${row.active ? "border-slate-200 bg-slate-50/70" : "border-slate-200 bg-slate-100 opacity-70"}`}>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="block font-medium text-slate-600">{t("العلاوة", "Allowance")}</span>
              <select className={`${fieldClass} w-full`} value={row.allowanceTypeId} onChange={(event) => update(row.key, fromType(event.target.value))}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {termText(type.nameAr, type.nameEn, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-600">{t("طريقة الحساب", "Calculation")}</span>
              <select className={`${fieldClass} w-full`} value={row.calc} onChange={(event) => update(row.key, { calc: event.target.value })}>
                {ALLOWANCE_CALCS.map((value) => (
                  <option key={value} value={value}>
                    {pick(ALLOWANCE_CALC[value], lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-600">{row.calc === "PERCENT" ? t("النسبة %", "Percent %") : t("المبلغ", "Amount")}</span>
              <input className={`${fieldClass} w-full`} type="number" min="0" step="0.001" value={row.value} onChange={(event) => update(row.key, { value: event.target.value })} />
            </label>
            {row.calc === "PERCENT" ? (
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="block font-medium text-slate-600">{t("النسبة من", "Percent of")}</span>
                <select className={`${fieldClass} w-full`} value={row.base} onChange={(event) => update(row.key, { base: event.target.value })}>
                  {ALLOWANCE_BASES.map((value) => (
                    <option key={value} value={value}>
                      {pick(ALLOWANCE_BASE[value], lang)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="hidden sm:col-span-2 sm:block" />
            )}
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="block font-medium text-slate-600">{t("موعد الصرف", "Paid")}</span>
              <select className={`${fieldClass} w-full`} value={row.frequency} onChange={(event) => update(row.key, { frequency: event.target.value })}>
                {ALLOWANCE_FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {pick(ALLOWANCE_FREQUENCY[value], lang)}
                  </option>
                ))}
              </select>
            </label>
            {row.frequency !== "MONTHLY" ? (
              <label className="space-y-1 text-xs">
                <span className="block font-medium text-slate-600">{t("شهر الصرف", "Pay month")}</span>
                <select className={`${fieldClass} w-full`} value={row.payMonth} onChange={(event) => update(row.key, { payMonth: Number(event.target.value) })}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {monthName(index + 1, lang)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="hidden sm:block" />
            )}
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-600">{t("يبدأ من شهر", "Starts")}</span>
              <input className={`${fieldClass} w-full`} type="month" value={row.start} onChange={(event) => update(row.key, { start: event.target.value })} />
            </label>
            <div className="flex flex-wrap items-end justify-between gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input type="checkbox" className="accent-teal-700" checked={row.active} onChange={(event) => update(row.key, { active: event.target.checked })} />
                {t("سارية", "Active")}
              </label>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline" onClick={() => setRows((list) => list.filter((item) => item.key !== row.key))}>
                <Trash2 className="h-3.5 w-3.5" />
                {t("إزالة", "Remove")}
              </button>
            </div>
            <p className="rounded-lg bg-white px-3 py-2 text-xs text-teal-900 ring-1 ring-inset ring-slate-100 sm:col-span-6">
              {t("المبلغ:", "Amount:")} <strong>{money(amount, currency)}</strong>{" "}
              {months.length
                ? t(`يُصرف في: ${months.map((month) => monthName(month, "ar")).join("، ")}`, `paid in: ${months.map((month) => monthName(month, "en")).join(", ")}`)
                : t("كل شهر", "every month")}
            </p>
          </div>
        );
      })}
      {monthlyTotal > 0 ? (
        <p className="text-xs text-slate-600">
          {t("مجموع العلاوات الشهرية:", "Monthly allowances total:")} <strong>{money(monthlyTotal, currency)}</strong>
        </p>
      ) : null}
    </div>
  );
}
