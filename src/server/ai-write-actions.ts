"use server";

import { aiTranslateTexts, aiWrite, isRateLimited, type WriteMode } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { inviteByToken } from "@/lib/task-invites";

const MAX_TEXTS = 60;
const MAX_TEXT = 2000;
const MAX_TOTAL = 16000;

/** Signed-in users, or someone on a page opened by a valid link (task invite, employee portal). */
async function allowed(path: string) {
  if (await getSessionUser()) return true;
  const [, area, token] = String(path || "").split("/");
  if (!token) return false;
  if (area === "task") return Boolean(await inviteByToken(token));
  if (area === "portal") return Boolean(await portalEmployee(token));
  return false;
}

async function failure(error: unknown) {
  const { t } = await getI18n();
  console.error("AI writing help failed", error);
  return isRateLimited(error)
    ? t("الذكاء الاصطناعي مشغول الآن. حاول بعد لحظات.", "The AI is busy right now. Try again in a moment.")
    : t("تعذّر الوصول إلى الذكاء الاصطناعي الآن. حاول لاحقاً.", "The AI is unavailable right now. Try again later.");
}

/** Instant translation of what others wrote (steps, comments, history, notes), each into the other language. */
export async function translateTexts(texts: string[], path: string): Promise<{ texts?: (string | null)[]; error?: string }> {
  const { t } = await getI18n();
  if (!(await allowed(path))) return { error: t("سجّل الدخول أولاً", "Sign in first") };
  const list = (Array.isArray(texts) ? texts : []).slice(0, MAX_TEXTS).map((text) => String(text || "").slice(0, MAX_TEXT));
  let total = 0;
  const batch = list.filter((text) => (total += text.length) <= MAX_TOTAL);
  if (!batch.length) return { texts: [] };
  try {
    const translated = await aiTranslateTexts(batch);
    return { texts: list.map((_, index) => translated[index] ?? null) };
  } catch (error) {
    return { error: await failure(error) };
  }
}

export type WriteHelp = { text?: string; suggestions?: string[]; error?: string };

/** Translate, polish or suggest text for the field being typed in. Nothing is saved; the user decides. */
export async function writeHelp(input: { mode: WriteMode; text: string; label: string; context: string; multiline: boolean; maxLength: number }, path: string): Promise<WriteHelp> {
  const { lang, t } = await getI18n();
  if (!(await allowed(path))) return { error: t("سجّل الدخول أولاً", "Sign in first") };
  const mode: WriteMode = input.mode === "translate" || input.mode === "improve" ? input.mode : "suggest";
  const text = String(input.text || "").trim().slice(0, 3000);
  if (mode !== "suggest" && !text) return { error: t("اكتب النص أولاً", "Type the text first") };
  const maxLength = Math.min(Math.max(Number(input.maxLength) || 0, 0) || 3000, 3000);
  try {
    const result = await aiWrite({
      mode,
      text,
      label: String(input.label || "").slice(0, 200),
      context: String(input.context || "").slice(0, 1500),
      uiLang: lang,
      multiline: Boolean(input.multiline),
      maxLength,
    });
    if ("suggestions" in result) return result.suggestions?.length ? { suggestions: result.suggestions } : { error: t("لم يقترح الذكاء الاصطناعي شيئاً هنا", "The AI had no suggestions here") };
    return result.text ? { text: result.text } : { error: t("رجعت النتيجة فارغة. حاول مرة أخرى.", "The result came back empty. Try again.") };
  } catch (error) {
    return { error: await failure(error) };
  }
}
