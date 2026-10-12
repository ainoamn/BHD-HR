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

function parseJson<T>(text: string, open: "{" | "["): T | null {
  const close = open === "{" ? "}" : "]";
  try {
    return JSON.parse(text.slice(text.indexOf(open), text.lastIndexOf(close) + 1)) as T;
  } catch {
    return null;
  }
}

/** Formal management letter in Arabic and English. The recipient block is printed separately, so the body has no greeting or signature. */
export async function aiDraftLetter(input: { kind: string; kindAr: string; kindEn: string; reason: string; companyName: string; jobTitle?: string | null }) {
  const { text } = await generateText({
    model: MODEL,
    temperature: 0.3,
    system: [
      "You are an HR officer in a company in the Sultanate of Oman writing official letters from management to an employee.",
      "Write in formal, respectful Modern Standard Arabic as used in Omani companies, plus a faithful formal English version.",
      "The letter header, recipient name, date, reference number and signature are printed by the system: do NOT include a greeting, the employee's name, dates, a reference number or a signature.",
      "Warnings must state the violation factually, ask for compliance, and mention the consequence of repetition under the Omani Labour Law and the company's penalties policy, escalating with the warning level. Appreciation letters are warm and specific.",
      "Use plural respectful address in Arabic (لكم / منكم). 2–4 short paragraphs, no bullet symbols, no markdown.",
      'Reply with JSON only: {"subject":"…","subjectEn":"…","body":"…","bodyEn":"…"}',
    ].join(" "),
    prompt: JSON.stringify({ letterType: `${input.kindAr} / ${input.kindEn}`, details: input.reason, company: input.companyName, jobTitle: input.jobTitle || undefined }),
  });
  const parsed = parseJson<{ subject?: unknown; subjectEn?: unknown; body?: unknown; bodyEn?: unknown }>(text, "{");
  if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) return null;
  const pickText = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  return {
    subject: pickText(parsed.subject, 150),
    subjectEn: pickText(parsed.subjectEn, 150),
    body: pickText(parsed.body, 4000),
    bodyEn: pickText(parsed.bodyEn, 4000),
  };
}

/** Short, concrete checklist steps for a task, in the language the task is written in. */
export async function aiTaskChecklist(title: string, description?: string | null) {
  const { text } = await generateText({
    model: MODEL,
    temperature: 0.2,
    system:
      "You help an HR team in Oman break a task into 3–7 short, concrete checklist steps (max 80 characters each), in the same language as the task. Reply with a JSON array of strings only.",
    prompt: JSON.stringify({ task: title, details: description || undefined }),
  });
  const parsed = parseJson<unknown[]>(text, "[");
  return (parsed || [])
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().replace(/^[-*•\d.)\s]+/, "").slice(0, 120))
    .filter(Boolean)
    .slice(0, 7);
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
