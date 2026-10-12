"use server";

import { aiReadDocument, aiTranslate, type ReadDocument, type TranslateKind } from "@/lib/ai";
import { can, getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import type { Permission } from "@/lib/permissions";

const READABLE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const CAN_READ: Permission[] = ["employees.create", "employees.edit", "documents.create", "documents.edit"];

/** Reads a scanned document so the form can be pre-filled; nothing is saved until the user submits the form. */
export async function readDocumentFile(formData: FormData): Promise<{ data?: ReadDocument; error?: string }> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return { error: t("سجّل الدخول أولاً", "Sign in first") };
  if (!CAN_READ.some((key) => can(user, key))) {
    return { error: t("لا تملك صلاحية إضافة المستندات", "You can't add documents") };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: t("اختر ملفاً أولاً", "Choose a file first") };
  if (!READABLE.includes(file.type)) return { error: t("الملف يجب أن يكون صورة أو PDF", "The file must be an image or a PDF") };
  if (file.size > 4 * 1024 * 1024) return { error: t("الملف أكبر من 4 ميغابايت", "The file is larger than 4 MB") };
  try {
    const data = await aiReadDocument(new Uint8Array(await file.arrayBuffer()), file.type);
    if (!data || !(data.number || data.expiry || data.fullName || data.nameEn)) {
      return { error: t("لم يُتعرّف على بيانات في الملف. جرّب صورة أوضح.", "No data could be read. Try a clearer image.") };
    }
    return { data };
  } catch (error) {
    console.error("AI document read failed", error);
    return { error: t("تعذرت قراءة المستند الآن. أدخل البيانات يدوياً أو حاول لاحقاً.", "Document reading is unavailable right now. Enter the data or try again later.") };
  }
}

/** Instant translation for the bilingual fields; signed-in users only. */
export async function translateField(text: string, to: "ar" | "en", kind: TranslateKind): Promise<{ text?: string; error?: string }> {
  const { t } = await getI18n();
  if (!(await getSessionUser())) return { error: t("سجّل الدخول أولاً", "Sign in first") };
  const source = String(text || "").trim().slice(0, 150);
  if (!source) return { error: t("اكتب النص أولاً", "Type the text first") };
  try {
    const result = await aiTranslate(source, to === "en" ? "en" : "ar", kind === "name" ? "name" : "term");
    return result ? { text: result } : { error: t("لم تُرجِع الترجمة نتيجة", "The translation came back empty") };
  } catch (error) {
    console.error("AI translate failed", error);
    return { error: t("تعذرت الترجمة الآلية الآن. اكتبها يدوياً أو حاول لاحقاً.", "AI translation is unavailable right now. Type it or try again later.") };
  }
}
