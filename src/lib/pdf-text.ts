/** Extracts plain text from a PDF (Ministry of Labour guides, worker lists). Uses pdf-parse on the server. */
export async function pdfText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pages: result.total || 0 };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
