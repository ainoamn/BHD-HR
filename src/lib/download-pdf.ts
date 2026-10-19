"use client";

export type PdfOrient = "portrait" | "landscape";

/** Renders a DOM node to a multi-page A4 PDF (Arabic shaping matches the screen). */
export async function downloadElementPdf(element: HTMLElement, fileName: string, orient: PdfOrient = "portrait") {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfIgnore === "true",
    onclone: (doc) => {
      doc.documentElement.dataset.theme = "light";
    },
    windowWidth: Math.max(element.scrollWidth, orient === "landscape" ? 1400 : 900),
  });
  const pdf = new jsPDF({ orientation: orient, unit: "mm", format: "a4" });
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
}
