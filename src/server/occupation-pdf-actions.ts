"use server";

import { aiDetectOccupationFile } from "@/lib/ai";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { detectOccupationFile, parseOccupationFile } from "@/lib/occupation-guide";
import { occupationPreviewFromRows, type OccupationPreview } from "@/lib/occupation-preview";
import { prisma } from "@/lib/prisma";
import { aiLockedMessage, aiOpen } from "@/lib/subscription";

const MAX_FILE = 4 * 1024 * 1024;

/**
 * Optional PDF upload path only. Kept separate so HR settings (built-in import) never loads pdf-parse.
 * Parsed rows stay in StoredFile; the client only receives a draft id + sample stats.
 */
export async function previewOccupationGuide(formData: FormData): Promise<OccupationPreview> {
  const user = await requireAdmin("/settings/hr?tab=jobs");
  const { lang, t } = await getI18n();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: t("اختر ملف PDF أولاً", "Choose a PDF file first") };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: t("الملف يجب أن يكون PDF", "The file must be a PDF") };
  }
  if (file.size > MAX_FILE) return { error: t("الملف أكبر من 4 ميغابايت", "The file is larger than 4 MB") };

  let text: string;
  try {
    const { pdfText } = await import("@/lib/pdf-text");
    ({ text } = await pdfText(new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    console.error("occupation PDF read failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    const password = /password|encrypted/i.test(detail);
    return {
      error: password
        ? t("الملف محمي بكلمة مرور. أزل الحماية ثم أعد الرفع، أو استخدم «استيراد الدليل الرسمي» أدناه.", "The file is password-protected. Remove the password and try again, or use “Import the official guide” below.")
        : t(
            "تعذرت قراءة ملف PDF على الخادم. استخدم زر «استيراد الدليل الرسمي» (نفس دليل وزارة العمل)، أو أعد المحاولة بعد لحظات.",
            "Could not read the PDF on the server. Use “Import the official guide” (the same MoL guide), or try again shortly.",
          ),
    };
  }
  if (!text.trim()) return { error: t("الملف بلا نص قابل للقراءة", "The file has no readable text") };

  let kind = detectOccupationFile(text);
  if (kind === "UNKNOWN") {
    if (!(await aiOpen(user.companyId))) return { error: aiLockedMessage(t) };
    try {
      kind = await aiDetectOccupationFile(text);
    } catch (error) {
      console.error("occupation AI detect failed", error);
      return {
        error: t(
          "تعذر التعرّف على نوع الملف بالذكاء الاصطناعي. جرّب ملف الدليل الموحد أو «استيراد الدليل الرسمي».",
          "AI could not recognise the file. Try the unified classification PDF or “Import the official guide”.",
        ),
      };
    }
  }

  const { kind: parsedKind, rows } = parseOccupationFile(text, kind);
  if (!rows.length) {
    return occupationPreviewFromRows(rows, parsedKind, lang, t, { withPayload: false });
  }

  const draftId = `occ-draft-${user.companyId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const bytes = Buffer.from(JSON.stringify(rows), "utf8");
  // Drop older drafts for this company so Bytes storage does not grow unbounded.
  await prisma.storedFile.deleteMany({
    where: { companyId: user.companyId, name: { startsWith: `occ-draft-${user.companyId.slice(0, 8)}-` } },
  });
  await prisma.storedFile.create({
    data: {
      companyId: user.companyId,
      name: draftId,
      mime: "application/json",
      size: bytes.length,
      data: bytes,
    },
  });

  return occupationPreviewFromRows(rows, parsedKind, lang, t, { withPayload: false, draftId });
}
