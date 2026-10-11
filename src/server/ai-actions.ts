"use server";

import { aiTranslate, type TranslateKind } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";

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
