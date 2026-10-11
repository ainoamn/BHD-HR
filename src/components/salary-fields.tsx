"use client";

import { useState } from "react";
import { money, round3 } from "@/lib/utils";
import { AllowancesEditor, type AllowanceRowValue, type AllowanceTypeOption } from "./allowances-editor";
import { useLang } from "./lang-provider";
import { Field, fieldClass } from "./ui";

export function SalaryFields({
  currency,
  defaults,
  allowances,
}: {
  currency: string;
  defaults: { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number };
  /** Shown in the employee form; the salary page edits only the four amounts. */
  allowances?: { types: AllowanceTypeOption[]; rows: AllowanceRowValue[]; defaultStart: string; canManageTypes: boolean };
}) {
  const { t } = useLang();
  const [basic, setBasic] = useState(String(defaults.basicSalary));
  const [housing, setHousing] = useState(String(defaults.housingAllowance));
  const [transport, setTransport] = useState(String(defaults.transportAllowance));
  const [other, setOther] = useState(String(defaults.otherAllowance));
  const gross = round3([basic, housing, transport, other].reduce((sum, item) => sum + (Number(item) || 0), 0));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("الراتب الأساسي", "Basic salary")}>
        <input className={`${fieldClass} w-full`} name="basicSalary" type="number" min="0" step="0.001" value={basic} onChange={(event) => setBasic(event.target.value)} required />
      </Field>
      <Field label={t("بدل السكن", "Housing allowance")}>
        <input className={`${fieldClass} w-full`} name="housingAllowance" type="number" min="0" step="0.001" value={housing} onChange={(event) => setHousing(event.target.value)} />
      </Field>
      <Field label={t("بدل النقل", "Transport allowance")}>
        <input className={`${fieldClass} w-full`} name="transportAllowance" type="number" min="0" step="0.001" value={transport} onChange={(event) => setTransport(event.target.value)} />
      </Field>
      <Field label={t("بدلات أخرى", "Other allowances")}>
        <input className={`${fieldClass} w-full`} name="otherAllowance" type="number" min="0" step="0.001" value={other} onChange={(event) => setOther(event.target.value)} />
      </Field>
      <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-950 md:col-span-2">
        {t("إجمالي الراتب الحالي:", "Current gross salary:")} <strong>{money(gross, currency)}</strong>
        <span className="mt-1 block text-xs text-teal-800">
          {t(
            "هذا الراتب يُنسخ داخل مسير كل شهر، فتعديل الراتب لاحقاً لا يغيّر الشهور السابقة.",
            "This salary is copied into each month's payroll, so later changes do not alter past months.",
          )}
        </span>
      </div>
      {allowances ? (
        <AllowancesEditor
          types={allowances.types}
          defaults={allowances.rows}
          defaultStart={allowances.defaultStart}
          canManageTypes={allowances.canManageTypes}
          currency={currency}
          pay={{
            basicSalary: Number(basic) || 0,
            housingAllowance: Number(housing) || 0,
            transportAllowance: Number(transport) || 0,
            otherAllowance: Number(other) || 0,
          }}
        />
      ) : null}
    </div>
  );
}
