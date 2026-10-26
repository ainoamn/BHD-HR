"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { Field, SectionTitle, fieldClass } from "@/components/ui";
import { transferEmployee } from "@/server/employee-actions";

type EmployerOption = { id: string; name: string; nextNumber: string };

export function EmployeeTransferCard({
  employeeId,
  currentEmployerId,
  currentEmployerName,
  currentNumber,
  employers,
}: {
  employeeId: string;
  currentEmployerId: string | null;
  currentEmployerName: string | null;
  currentNumber: string;
  employers: EmployerOption[];
}) {
  const { t } = useLang();
  const [toId, setToId] = useState("");
  const preview = useMemo(() => {
    if (!toId) {
      const none = employers.find((item) => item.id === "");
      return none?.nextNumber || "EMP-0001";
    }
    return employers.find((item) => item.id === toId)?.nextNumber || "—";
  }, [employers, toId]);

  const fromLabel = currentEmployerName || t("بدون كفيل", "No sponsor");
  const toLabel = !toId ? t("بدون كفيل", "No sponsor") : employers.find((item) => item.id === toId)?.name || "—";
  const same = (toId || "") === (currentEmployerId || "");

  return (
    <div className="space-y-4">
      <SectionTitle hint={t("يبقى السجل المالي عند الكفيل السابق؛ الملف الجديد بيانات شخصية فقط.", "Financial history stays with the previous sponsor; the new file is personal data only.")}>
        <span className="inline-flex items-center gap-2">
          <ArrowLeftRight size={18} className="text-teal-700" />
          {t("نقل إلى شركة أخرى", "Transfer to another company")}
        </span>
      </SectionTitle>

      <p className="text-sm leading-6 text-slate-600">
        {t(
          "يُنشأ ملف جديد عند الكفيل الوجهة برقم وظيفي جديد. الملف الحالي يبقى برقمه وحالته «منقول»، مع كل الرواتب والحضور السابقة.",
          "A new file is created at the destination sponsor with a new employee number. This file stays with its number and status “Transferred”, including all past pay and attendance.",
        )}
      </p>

      <form action={transferEmployee} className="space-y-3">
        <input type="hidden" name="id" value={employeeId} />
        <Field label={t("من", "From")}>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200">
            {fromLabel}{" "}
            <span className="tabular font-normal text-slate-500" dir="ltr">
              ({currentNumber})
            </span>
          </p>
        </Field>
        <Field label={t("إلى الكفيل / الشركة", "To sponsor / company")}>
          <select
            name="employerId"
            className={`${fieldClass} w-full`}
            value={toId}
            onChange={(event) => setToId(event.target.value)}
            required={false}
          >
            <option value="">{t("بدون كفيل", "No sponsor")}</option>
            {employers
              .filter((item) => item.id)
              .map((item) => (
                <option key={item.id} value={item.id} disabled={item.id === (currentEmployerId || "")}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <p className="text-sm text-slate-600">
          {t("الرقم الجديد المتوقع:", "Expected new number:")}{" "}
          <span className="tabular font-bold text-slate-900" dir="ltr">
            {preview}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {t(`${fromLabel} → ${toLabel}`, `${fromLabel} → ${toLabel}`)}
          </span>
        </p>
        <SubmitButton
          disabled={same}
          confirm={t(
            `نقل الموظف إلى «${toLabel}»؟ يُنشأ ملف جديد بلا رواتب سابقة، ويُعلَّم الملف الحالي «منقول».`,
            `Transfer the employee to “${toLabel}”? A new file is created without past payroll, and this file is marked “Transferred”.`,
          )}
        >
          {t("تنفيذ النقل", "Transfer")}
        </SubmitButton>
      </form>
    </div>
  );
}
