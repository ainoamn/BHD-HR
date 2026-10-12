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

/** A few lines telling the owner what needs attention today, ordered by urgency. Only the given facts may be used. */
export async function aiDailyBrief(input: { lang: Lang; companyName: string; today: string; facts: string[] }) {
  const { text } = await generateText({
    model: MODEL,
    temperature: 0.2,
    system: [
      "You are the HR assistant of a company in the Sultanate of Oman. Write the owner's morning brief from the facts given, and nothing else: never invent numbers, names or dates.",
      input.lang === "en" ? "Write in clear, plain English." : "Write in clear Modern Standard Arabic as used in Omani companies.",
      "Start with one sentence on the overall situation, then at most 5 short lines, each starting with '- ', most urgent first, each saying what to do. Group similar items (e.g. 'three residence cards expire this week'). No markdown other than the '- ' lines, no greeting, no sign-off.",
      "If there is nothing needing attention, say so in one sentence.",
    ].join(" "),
    prompt: JSON.stringify({ company: input.companyName, today: input.today, facts: input.facts }),
  });
  return text.trim().slice(0, 1500);
}

/** Reading scanned documents needs a stronger model than the short text tasks above. */
const VISION_MODEL = process.env.AI_VISION_MODEL || "google/gemini-2.5-flash";

export const READ_DOC_TYPES = ["ID_CARD", "PASSPORT", "RESIDENCE", "DRIVING_LICENSE", "CONTRACT", "INSURANCE", "CERTIFICATE", "OTHER"] as const;

export type ReadDocument = {
  type: (typeof READ_DOC_TYPES)[number];
  number: string;
  expiry: string;
  fullName: string;
  nameEn: string;
  nationality: string;
  dateOfBirth: string;
  gender: "" | "MALE" | "FEMALE";
};

/** Fields printed on an identity or HR document image / PDF. Unreadable fields come back empty, never guessed. */
export async function aiReadDocument(data: Uint8Array, mediaType: string): Promise<ReadDocument | null> {
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0,
    system: [
      "You read identity and HR documents for an HR system in the Sultanate of Oman and copy the printed data exactly. Never guess: leave a field empty when it is not clearly printed.",
      `type is one of ${READ_DOC_TYPES.join(", ")}. An Omani citizen's national ID card is ID_CARD; a resident card / labour card issued to a non-Omani is RESIDENCE.`,
      "number is the document number exactly as printed (Latin digits, no spaces). For passports use the passport number, not the personal number.",
      "Dates are YYYY-MM-DD with Gregorian dates; convert Hijri only if no Gregorian date is printed. expiry is the expiry date of the document.",
      "fullName is the holder's full name in Arabic script, nameEn in Latin script as printed. nationality is the ISO 3166 alpha-2 code (e.g. OM, IN, PK, BD, EG, PH). gender is MALE or FEMALE.",
      'Reply with JSON only: {"type":"","number":"","expiry":"","fullName":"","nameEn":"","nationality":"","dateOfBirth":"","gender":""}',
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Read this document." },
          { type: "file", data, mediaType },
        ],
      },
    ],
  });
  const parsed = parseJson<Record<string, unknown>>(text, "{");
  if (!parsed) return null;
  const field = (key: string, max = 120) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim().slice(0, max) : "");
  const date = (key: string) => {
    const value = field(key, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
  };
  const type = field("type").toUpperCase();
  const gender = field("gender").toUpperCase();
  const nationality = field("nationality", 2).toUpperCase();
  return {
    type: (READ_DOC_TYPES as readonly string[]).includes(type) ? (type as ReadDocument["type"]) : "OTHER",
    number: field("number", 60).replace(/\s+/g, ""),
    expiry: date("expiry"),
    fullName: field("fullName"),
    nameEn: field("nameEn"),
    nationality: /^[A-Z]{2}$/.test(nationality) ? nationality : "",
    dateOfBirth: date("dateOfBirth"),
    gender: gender === "MALE" || gender === "FEMALE" ? gender : "",
  };
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
