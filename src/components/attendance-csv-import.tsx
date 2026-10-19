"use client";

import { FileUp } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { Modal } from "@/components/modal";
import { fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";

/** Opens a small dialog to upload an absence CSV — keeps the page uncluttered. */
export function AttendanceCsvImport({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const { t } = useLang();
  return (
    <Modal
      label={
        <>
          <FileUp size={16} />
          {t("استيراد CSV", "Import CSV")}
        </>
      }
      title={t("استيراد غياب من CSV", "Import absence from CSV")}
      triggerClassName={secondaryBtn}
      size="sm"
    >
      <form action={action} className="space-y-4">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">{t("ملف CSV", "CSV file")}</span>
          <input name="file" type="file" accept=".csv,text/csv" required className={`${fieldClass} w-full`} />
        </label>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500" dir="ltr">
          employeeNumber,YYYY-MM-DD,ABSENT | UNPAID_LEAVE | OFFICIAL | HALF_DAY
        </p>
        <button type="submit" className={primaryBtn}>
          {t("استيراد", "Import")}
        </button>
      </form>
    </Modal>
  );
}
