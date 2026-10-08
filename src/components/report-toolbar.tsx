"use client";

import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import { useLang } from "./lang-provider";
import { primaryBtn, secondaryBtn } from "./ui";

/** Print uses the browser; PDF is rendered from the on-screen report so Arabic shaping matches exactly. */
export function ReportToolbar({ targetId, excelHref, fileName, canExport }: { targetId: string; excelHref: string; fileName: string; canExport: boolean }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    const element = document.getElementById(targetId);
    if (!element) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfIgnore === "true",
        windowWidth: Math.max(element.scrollWidth, 1024),
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
      const pxPerMm = canvas.width / pageWidth;
      const sliceHeight = Math.floor(pageHeight * pxPerMm);
      for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeight, page += 1) {
        const height = Math.min(sliceHeight, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = height;
        slice.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, pageWidth, height / pxPerMm);
      }
      pdf.save(fileName);
    } catch (error) {
      console.error(error);
      alert(t("تعذر إنشاء ملف PDF. جرّب الطباعة ثم «حفظ كـ PDF».", "Could not create the PDF. Try Print → Save as PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2" data-pdf-ignore="true">
      <button type="button" onClick={() => window.print()} className={secondaryBtn}>
        <Printer className="size-4" />
        {t("طباعة", "Print")}
      </button>
      {canExport ? (
        <>
          <a href={excelHref} className={secondaryBtn}>
            <FileSpreadsheet className="size-4 text-emerald-700" />
            {t("تحميل Excel", "Download Excel")}
          </a>
          <button type="button" onClick={downloadPdf} disabled={busy} className={primaryBtn}>
            <FileDown className="size-4" />
            {busy ? t("جارٍ إنشاء PDF...", "Creating PDF...") : t("تحميل PDF", "Download PDF")}
          </button>
        </>
      ) : null}
    </div>
  );
}
