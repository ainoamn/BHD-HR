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
/** Tried in order when the main model is rate-limited or down; both read PDFs and images. */
const VISION_FALLBACKS = ["anthropic/claude-haiku-4.5", "openai/gpt-4.1-mini"].filter((model) => model !== VISION_MODEL);

/** True when the AI Gateway refused the call for the team's per-minute limit. */
export function isRateLimited(error: unknown) {
  return /rate limit/i.test(String((error as { lastError?: unknown })?.lastError ?? error));
}

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

export type CandidateScreening = {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  fullName: string;
  email: string;
  phone: string;
  currentTitle: string;
  experienceYears: number | null;
};

/** Reads a CV (PDF or image) and rates it against the job. The score is advice for HR, never a decision. */
export async function aiScreenCandidate(input: {
  lang: Lang;
  job: { title: string; description: string | null; employmentType: string; location: string | null };
  cv: { data: Uint8Array; mediaType: string } | null;
  profile: string;
}): Promise<CandidateScreening | null> {
  const content: ({ type: "text"; text: string } | { type: "file"; data: Uint8Array; mediaType: string })[] = [
    { type: "text", text: JSON.stringify({ job: input.job, candidateDetailsFromForm: input.profile || undefined }) },
  ];
  if (input.cv) content.push({ type: "file", data: input.cv.data, mediaType: input.cv.mediaType });
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      "You screen job applicants for an HR team in the Sultanate of Oman. Compare the candidate's CV (and form details) with the job's duties and requirements.",
      "Judge only job-relevant evidence: skills, experience, qualifications, languages, certificates and location/availability when the job requires them. Never use or mention age, gender, nationality, religion, marital status, photo or appearance.",
      "score is 0–100: how well the evidence matches the requirements (90+ excellent, 70–89 good, 50–69 partial, below 50 weak). With no CV and little detail, keep the score low and say the evidence is thin.",
      input.lang === "en" ? "Write summary, strengths and gaps in clear English." : "Write summary, strengths and gaps in clear Modern Standard Arabic.",
      "summary: 2–3 sentences. strengths and gaps: up to 4 short items each, concrete. Copy fullName, email, phone, currentTitle exactly from the CV when printed, else empty; experienceYears is total relevant years as a number or null.",
      'Reply with JSON only: {"score":0,"summary":"","strengths":[],"gaps":[],"fullName":"","email":"","phone":"","currentTitle":"","experienceYears":null}',
    ].join(" "),
    messages: [{ role: "user", content }],
  });
  const parsed = parseJson<Record<string, unknown>>(text, "{");
  if (!parsed) return null;
  const field = (key: string, max = 160) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim().slice(0, max) : "");
  const list = (key: string) =>
    (Array.isArray(parsed[key]) ? (parsed[key] as unknown[]) : [])
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim().slice(0, 200))
      .slice(0, 4);
  const score = Math.round(Number(parsed.score));
  const years = Number(parsed.experienceYears);
  const summary = field("summary", 800);
  if (!summary || !Number.isFinite(score)) return null;
  return {
    score: Math.min(100, Math.max(0, score)),
    summary,
    strengths: list("strengths"),
    gaps: list("gaps"),
    fullName: field("fullName"),
    email: field("email").toLowerCase(),
    phone: field("phone", 40),
    currentTitle: field("currentTitle"),
    experienceYears: parsed.experienceYears !== null && Number.isFinite(years) && years >= 0 && years < 60 ? Math.round(years * 10) / 10 : null,
  };
}

/** Wording for a performance review, built only from facts in the employee's file for the review period. */
export async function aiDraftReview(input: { lang: Lang; employeeName: string; jobTitle: string | null; period: string; criteria: string[]; facts: string[] }) {
  const { text } = await generateText({
    model: MODEL,
    temperature: 0.2,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      "You help a manager in a company in the Sultanate of Oman write an employee's performance review. Use only the facts given; never invent achievements, incidents or numbers. Where facts are thin, write neutral, general wording the manager can edit.",
      input.lang === "en" ? "Write in clear, professional English." : "Write in clear, professional Modern Standard Arabic.",
      "strengths: 2–4 lines; improvements: 1–3 lines, constructive; goals: 2–3 specific, measurable goals for the next period. Each line starts with '- '. No markdown otherwise, no greeting.",
      'Reply with JSON only: {"strengths":"","improvements":"","goals":""}',
    ].join(" "),
    prompt: JSON.stringify({ employee: input.employeeName, jobTitle: input.jobTitle || undefined, period: input.period, criteria: input.criteria, facts: input.facts }),
  });
  const parsed = parseJson<{ strengths?: unknown; improvements?: unknown; goals?: unknown }>(text, "{");
  if (!parsed) return null;
  const pickText = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 2000) : "");
  const result = { strengths: pickText(parsed.strengths), improvements: pickText(parsed.improvements), goals: pickText(parsed.goals) };
  return result.strengths || result.goals ? result : null;
}

/** A short reading of the owner's analytics: what changed, what is a risk, what to do. Only the given figures may be used. */
export async function aiOwnerInsights(input: { lang: Lang; companyName: string; facts: string[] }) {
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0.2,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      "You are an HR and payroll analyst advising the owner of a company in the Sultanate of Oman. Read the figures given and write the most useful insights. Never invent figures; quote the numbers you use.",
      input.lang === "en" ? "Write in clear, plain English." : "Write in clear Modern Standard Arabic as used in Omani companies.",
      "Write 4–6 lines, each starting with '- ', most important first: trends in cost and headcount, risks (absence, turnover, expiring contracts, end-of-service liability, Omanization), and one concrete action per risk. No markdown other than the '- ' lines, no greeting.",
    ].join(" "),
    prompt: JSON.stringify({ company: input.companyName, figures: input.facts }),
  });
  return text.replace(/\*\*/g, "").trim().slice(0, 2500);
}

/**
 * Rewrites a CV in polished, professional wording in the target language (translating when the source is in the other one).
 * Facts — employers, titles, dates, degrees, grades, numbers — are kept exactly; nothing is invented.
 */
export async function aiPolishCv(input: { to: Lang; cv: unknown; jobTitle: string | null; company: string }) {
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0.3,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      "You are an expert CV writer for professionals in the Gulf (Sultanate of Oman). You receive a CV as JSON and return the same JSON structure, rewritten to read polished, confident and professional.",
      input.to === "en"
        ? "Write every text value in clear, professional British English. Translate any Arabic text. Transliterate Arabic names of companies and places as they are commonly written in English."
        : "Write every text value in polished Modern Standard Arabic as used in professional Gulf CVs. Translate any English text; keep well-known brand and product names (e.g. Microsoft Excel, SAP) in Latin letters.",
      "Never invent facts: keep employers, job titles' meaning, dates (from/to/current), degrees, institutions, grades, years and numbers exactly as given. Do not add experiences, skills, certificates or achievements that are not in the input. Keep the same number of entries in the same order.",
      "headline: a short professional title (max 8 words). summary: 3–4 sentences in first person implied (no 'I'), highlighting experience, strengths and value. experience[].description: 2–5 lines, each starting with '- ' and a strong action verb, concrete. skills: concise skill names. achievements: concise lines.",
      "Keep linkedin and website unchanged. Leave empty fields empty. Reply with the rewritten value of \"cv\" only, as a JSON object with the same keys (headline, summary, experience, ...), without the surrounding currentJobTitle/currentEmployer wrapper.",
    ].join(" "),
    prompt: JSON.stringify({ currentJobTitle: input.jobTitle || undefined, currentEmployer: input.company, cv: input.cv }),
  });
  const result = parseJson<Record<string, unknown>>(text, "{");
  return result && typeof result.cv === "object" && result.cv ? (result.cv as Record<string, unknown>) : result;
}

/** A standard bilingual job description for a job title in an Omani company, for HR to review and edit. */
export async function aiJobDescription(input: { titleAr: string; titleEn: string | null; department: string | null; company: string; reportsTo: string | null }) {
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0.3,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      "You are a senior HR consultant in the Sultanate of Oman writing a formal job description for a company's HR file, aligned with the Omani Labour Law and common Gulf HR practice.",
      "Write each part in formal Modern Standard Arabic (…Ar) and a faithful professional English version (…En) with the same items in the same order.",
      "purpose: 2–3 sentences on why the job exists. responsibilities: 8–12 concrete duties starting with a verb. qualifications: 3–6 items (education, years of experience, licences). skills: 5–8 skills and competencies. kpis: 4–6 measurable performance indicators.",
      "Keep it realistic for the job's level; no salary, no company-specific facts you were not given, no markdown or numbering inside items.",
      'Reply with JSON only: {"purposeAr":"","purposeEn":"","responsibilitiesAr":[],"responsibilitiesEn":[],"qualificationsAr":[],"qualificationsEn":[],"skillsAr":[],"skillsEn":[],"kpisAr":[],"kpisEn":[]}',
    ].join(" "),
    prompt: JSON.stringify({ jobTitle: input.titleAr, jobTitleEn: input.titleEn || undefined, department: input.department || undefined, company: input.company, reportsTo: input.reportsTo || undefined }),
  });
  return parseJson<Record<string, unknown>>(text, "{");
}

/** Answers a how-to question from the help centre's topics only, naming the topics to open. */
export async function aiHelpAnswer(input: { question: string; corpus: string; lang: Lang; audience: string }) {
  const { text } = await generateText({
    model: VISION_MODEL,
    temperature: 0.2,
    providerOptions: { gateway: { models: VISION_FALLBACKS } },
    system: [
      `You are the help desk of BHD HR, an HR and payroll web app used in Oman. The person asking is ${input.audience === "employee" ? "an employee using their personal portal" : input.audience === "team" ? "a team manager or sponsor using the team area" : "a company HR or admin user"}.`,
      "Answer only from the guide below; if the guide does not cover it, say so briefly and suggest the closest topic. Never invent buttons, pages or features.",
      input.lang === "ar"
        ? "Reply in clear Modern Standard Arabic. Quote button and page names exactly as written in the guide, between « »."
        : "Reply in clear English. Quote button and page names exactly as written in the guide, in quotes.",
      "Keep it short: one sentence, then numbered steps (max 7), then at most one tip. Plain text, no markdown headings or bold.",
      'Reply with JSON only: {"answer":"…","topics":["slug", …]} where topics are 1–3 slugs from the guide (the [slug] before each title) most useful to open next.',
      `GUIDE:\n${input.corpus}`,
    ].join("\n"),
    prompt: input.question,
  });
  return parseJson<{ answer?: unknown; topics?: unknown }>(text, "{");
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
