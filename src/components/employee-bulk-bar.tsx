"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { fieldClass } from "@/components/ui";
import { BULK_FORM } from "@/lib/employee-filter";
import { bulkEmployees } from "@/server/employee-actions";

type Option = { value: string; label: string };

/** Acts on the rows ticked in the employees table; the row boxes join this form through form="employee-bulk". */
export function EmployeeBulkBar({
  returnTo,
  canEdit,
  statuses,
  employers,
  schedules,
}: {
  returnTo: string;
  canEdit: boolean;
  statuses: Option[];
  employers: Option[];
  schedules: Option[];
}) {
  const { t } = useLang();
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [op, setOp] = useState("stickers");

  useEffect(() => {
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"][name="ids"]`));
    const update = () => {
      const all = boxes();
      setTotal(all.length);
      setCount(all.filter((box) => box.checked).length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  function toggleAll(checked: boolean) {
    document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"][name="ids"]`).forEach((box) => {
      box.checked = checked;
    });
    setCount(checked ? total : 0);
  }

  const confirmText =
    op === "status"
      ? t(`تغيير حالة ${count} موظف؟`, `Change the status of ${count} employee(s)?`)
      : op === "employer"
        ? t(`تغيير كفيل ${count} موظف؟`, `Change the sponsor of ${count} employee(s)?`)
        : op === "schedule"
          ? t(`تغيير جدول دوام ${count} موظف؟`, `Change the schedule of ${count} employee(s)?`)
          : undefined;

  return (
    <form id={BULK_FORM} action={bulkEmployees} className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-surface px-3 py-2.5 shadow-card">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 px-1 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={total > 0 && count === total} onChange={(event) => toggleAll(event.target.checked)} className="size-4 accent-teal-700" />
        <ListChecks size={16} className="text-teal-700" />
        {count ? t(`${count} محدد`, `${count} selected`) : t("تحديد الكل", "Select all")}
      </label>
      <select name="op" value={op} onChange={(event) => setOp(event.target.value)} className={`${fieldClass} min-w-0 flex-1 basis-40 sm:flex-none`} aria-label={t("الإجراء", "Action")}>
        <option value="stickers">{t("طباعة ملصقات الجوازات", "Print passport stickers")}</option>
        {canEdit ? (
          <>
            <option value="status">{t("تغيير الحالة", "Change status")}</option>
            <option value="employer">{t("تغيير الكفيل", "Change sponsor")}</option>
            {schedules.length ? <option value="schedule">{t("تغيير جدول الدوام", "Change work schedule")}</option> : null}
            <option value="accounts">{t("فتح حسابات دخول لمن ليس له حساب", "Open sign-in accounts for those without")}</option>
          </>
        ) : null}
      </select>
      {op === "status" ? (
        <select name="status" required className={`${fieldClass} min-w-0 flex-1 basis-36 sm:flex-none`} aria-label={t("الحالة", "Status")}>
          {statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      {op === "employer" ? (
        <select name="employerId" className={`${fieldClass} min-w-0 flex-1 basis-40 sm:flex-none`} aria-label={t("الكفيل", "Sponsor")}>
          <option value="">{t("بدون كفيل", "No sponsor")}</option>
          {employers.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      {op === "schedule" ? (
        <select name="scheduleId" className={`${fieldClass} min-w-0 flex-1 basis-40 sm:flex-none`} aria-label={t("جدول الدوام", "Work schedule")}>
          <option value="">{t("الجدول الافتراضي", "Company default")}</option>
          {schedules.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      <SubmitButton variant="secondary" disabled={!count} confirm={confirmText}>
        {t("تنفيذ", "Apply")}
      </SubmitButton>
    </form>
  );
}
