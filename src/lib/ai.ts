import { generateText } from "ai";
import type { Lang } from "./i18n";

/** Served through Vercel AI Gateway; on Vercel the deployment's OIDC token authenticates, so no provider key is needed. */
const MODEL = process.env.AI_TRANSLATE_MODEL || "google/gemini-2.5-flash-lite";

export type TranslateKind = "name" | "term";

const TERM_CONTEXT = "an HR term used in Oman (job title, department, leave type or allowance name)";

function systemPrompt(kind: TranslateKind, to: Lang) {
  if (kind === "name") {
    return to === "en"
      ? "You transliterate Arabic personal names into English exactly as they are written in Omani and Gulf passports: Title Case, 'bin' / 'bint' between names, family names like 'Al Balushi'. Reply with the name only."
      : "You write personal names in Arabic script as they are commonly written in Oman. Reply with the name only.";
  }
  return to === "en"
    ? `You translate ${TERM_CONTEXT} from Arabic into concise, standard English HR terminology in Title Case. Reply with the translation only.`
    : `You translate ${TERM_CONTEXT} from English into concise, standard Arabic HR terminology as used in Gulf companies. Reply with the translation only.`;
}

function clean(text: string) {
  return text.trim().replace(/^["'«“]+|["'»”]+$/g, "").replace(/\s+/g, " ").slice(0, 150);
}

export async function aiTranslate(text: string, to: Lang, kind: TranslateKind) {
  const { text: result } = await generateText({ model: MODEL, system: systemPrompt(kind, to), prompt: text, temperature: 0 });
  return clean(result);
}

/** Translates many terms in one request; entries the model skips come back as null. */
export async function aiTranslateMany(texts: string[], to: Lang) {
  if (!texts.length) return [];
  const { text } = await generateText({
    model: MODEL,
    temperature: 0,
    system: `${systemPrompt("term", to)} You receive a JSON array of strings and reply with a JSON array of the same length holding each translation in the same order, and nothing else.`,
    prompt: JSON.stringify(texts),
  });
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const parsed = JSON.parse(json) as unknown[];
    return texts.map((_, index) => (typeof parsed[index] === "string" && parsed[index] ? clean(parsed[index] as string) : null));
  } catch {
    return texts.map(() => null);
  }
}
