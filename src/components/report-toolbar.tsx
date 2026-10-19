"use client";

import { FileDown, FileSpreadsheet, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";
import { downloadElementPdf } from "@/lib/download-pdf";
import { useLang } from "./lang-provider";
import { printAfterPaint } from "./print-button";
import { primaryBtn, secondaryBtn } from "./ui";

/** PDF is rendered from the on-screen report so Arabic shaping matches exactly; print is secondary. */
export function ReportToolbar({ targetId, excelHref, fileName, canExport }: { targetId: string; excelHref: string; fileName: string; canExport: boolean }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    const element = document.getElementById(targetId);
    if (!element) return;
    setBusy(true);
    try {
      await downloadElementPdf(element, fileName, "portrait");
    } catch (error) {
      console.error(error);
      alert(t("تعذر إنشاء ملف PDF. جرّب الطباعة ثم «حفظ كـ PDF».", "Could not create the PDF. Try Print → Save as PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2" data-pdf-ignore="true">
      {canExport ? (
        <>
          <button type="button" onClick={downloadPdf} disabled={busy} className={`${primaryBtn} flex-1 sm:flex-none`}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {busy ? t("جارٍ إنشاء PDF...", "Creating PDF...") : t("تحميل PDF", "Download PDF")}
          </button>
          <a href={excelHref} className={`${secondaryBtn} flex-1 sm:flex-none`}>
            <FileSpreadsheet className="size-4 text-emerald-700" />
            Excel
          </a>
        </>
      ) : null}
      <button type="button" onClick={printAfterPaint} className={`${secondaryBtn} flex-1 sm:flex-none`}>
        <Printer className="size-4" />
        {t("طباعة", "Print")}
      </button>
    </div>
  );
}
