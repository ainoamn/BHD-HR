/**
 * Extracts plain text from a PDF (Ministry of Labour guides). Uses pdf-parse on the Node server.
 * On Vercel the worker must be loaded explicitly and the package kept external (see next.config.ts).
 */
export async function pdfText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  // Side-effect import registers the pdf.js worker before PDFParse loads (required on serverless).
  await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(data) });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pages: result.total || 0 };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
