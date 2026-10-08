"use client";

import { ATTENDANCE_TYPES, DOC_LABEL, EXTRA_DOC_TYPES } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { useLang } from "./lang-provider";
import { SubmitButton } from "./submit-button";
import { fieldClass } from "./ui";

type Action = (formData: FormData) => void | Promise<void>;

function dateValue(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** Small delete form with a confirmation prompt. */
export function DeleteButton({
  action,
  fields,
  confirm,
  label,
  variant = "link",
}: {
  action: Action;
  fields: Record<string, string>;
  confirm: string;
  label?: string;
  variant?: "link" | "danger";
}) {
  const { t } = useLang();
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} confirm={confirm} pendingLabel={t("جارٍ الحذف...", "Deleting...")}>
        {label || t("حذف", "Delete")}
      </SubmitButton>
    </form>
  );
}

const summaryClass = "cursor-pointer list-none text-xs font-semibold text-teal-800 hover:underline";

/** Edits a whole leave/absence period; the server re-checks balances and overlaps. */
export function AttendanceEditForm({
  action,
  id,
  returnTo,
  type,
  start,
  end,
  deductsSalary,
  notes,
}: {
  action: Action;
  id: string;
  returnTo: string;
  type: string;
  start: Date | string;
  end: Date | string;
  deductsSalary: boolean;
  notes: string | null;
}) {
  const { lang, t } = useLang();
  return (
    <details className="group">
      <summary className={summaryClass}>{t("تعديل", "Edit")}</summary>
      <form action={action} className="mt-2 grid min-w-64 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-start sm:grid-cols-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="text-slate-600">{t("النوع", "Type")}</span>
          <select className={`${fieldClass} w-full`} name="type" defaultValue={type}>
            {ATTENDANCE_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {pick(item.label, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{t("من", "From")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="from" defaultValue={dateValue(start)} required />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{t("إلى", "To")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="to" defaultValue={dateValue(end)} required />
        </label>
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="text-slate-600">{t("ملاحظة", "Note")}</span>
          <input className={`${fieldClass} w-full`} name="notes" defaultValue={notes || ""} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="deductsSalary" value="1" defaultChecked={deductsSalary} className="accent-teal-700" />
          {t("خصم من الراتب", "Deduct from salary")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="allowOverdraft" value="1" className="accent-teal-700" />
          {t("السماح بتجاوز الرصيد", "Allow exceeding the balance")}
        </label>
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary">{t("حفظ التعديل", "Save changes")}</SubmitButton>
        </div>
      </form>
    </details>
  );
}

export function DocumentEditForm({
  action,
  returnTo,
  document,
}: {
  action: Action;
  returnTo: string;
  document: { id: string; type: string; documentNo: string | null; expiryDate: Date | null; notes: string | null; fileUrl: string | null };
}) {
  const { lang, t } = useLang();
  return (
    <details className="group">
      <summary className={summaryClass}>{t("تعديل", "Edit")}</summary>
      <form action={action} className="mt-2 grid min-w-64 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-start sm:grid-cols-2">
        <input type="hidden" name="id" value={document.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{t("النوع", "Type")}</span>
          <select className={`${fieldClass} w-full`} name="type" defaultValue={document.type}>
            {EXTRA_DOC_TYPES.map((type) => (
              <option key={type} value={type}>
                {pick(DOC_LABEL[type], lang, type)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{t("رقم المستند", "Document number")}</span>
          <input className={`${fieldClass} w-full`} name="documentNo" defaultValue={document.documentNo || ""} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{t("تاريخ الانتهاء", "Expiry date")}</span>
          <input className={`${fieldClass} w-full`} type="date" name="expiryDate" defaultValue={dateValue(document.expiryDate)} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600">{document.fileUrl ? t("استبدال الملف", "Replace file") : t("إرفاق ملف", "Attach file")}</span>
          <input className={`${fieldClass} w-full`} type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
        </label>
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="text-slate-600">{t("ملاحظة", "Note")}</span>
          <input className={`${fieldClass} w-full`} name="notes" defaultValue={document.notes || ""} />
        </label>
        {document.fileUrl ? (
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" name="removeFile" value="1" className="accent-teal-700" />
            {t("حذف الملف المرفق", "Remove the attached file")}
          </label>
        ) : null}
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary">{t("حفظ التعديل", "Save changes")}</SubmitButton>
        </div>
      </form>
    </details>
  );
}
