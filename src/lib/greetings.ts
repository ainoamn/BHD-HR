import { randomBytes } from "crypto";
import { aiGreetingDesign, aiGreetingImage } from "./ai";
import { channelReady, sendEmailMessage } from "./delivery";
import { noticeLang } from "./notify";
import { prisma } from "./prisma";
import { companyAccess } from "./subscription";

export type GreetingAudience = {
  all?: boolean;
  genders?: ("MALE" | "FEMALE")[];
  omanis?: boolean;
  expats?: boolean;
  nationalities?: string[];
  youthMaxAge?: number;
  companyIds?: string[];
};

export const GREETING_STATUS: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft" },
  READY: { ar: "جاهز للمعاينة", en: "Ready to preview" },
  SCHEDULED: { ar: "مجدول", en: "Scheduled" },
  SENT: { ar: "أُرسل", en: "Sent" },
  FAILED: { ar: "فشل", en: "Failed" },
  CANCELLED: { ar: "ملغى", en: "Cancelled" },
};

export function readAudience(raw: unknown): GreetingAudience {
  if (!raw || typeof raw !== "object") return { all: true };
  const value = raw as GreetingAudience;
  return {
    all: Boolean(value.all),
    genders: Array.isArray(value.genders) ? value.genders.filter((g): g is "MALE" | "FEMALE" => g === "MALE" || g === "FEMALE") : undefined,
    omanis: value.omanis ? true : undefined,
    expats: value.expats ? true : undefined,
    nationalities: Array.isArray(value.nationalities) ? value.nationalities.map(String).map((c) => c.toUpperCase()).filter(Boolean).slice(0, 40) : undefined,
    youthMaxAge: typeof value.youthMaxAge === "number" && value.youthMaxAge > 0 && value.youthMaxAge <= 100 ? Math.round(value.youthMaxAge) : undefined,
    companyIds: Array.isArray(value.companyIds) ? value.companyIds.map(String).filter(Boolean).slice(0, 100) : undefined,
  };
}

export function audienceFromForm(formData: FormData): GreetingAudience {
  const all = formData.get("aud_all") === "1";
  const genders = formData.getAll("aud_gender").map(String).filter((g): g is "MALE" | "FEMALE" => g === "MALE" || g === "FEMALE");
  const omanis = formData.get("aud_omanis") === "1";
  const expats = formData.get("aud_expats") === "1";
  const nationalities = formData
    .getAll("aud_nationality")
    .map(String)
    .map((c) => c.toUpperCase())
    .filter(Boolean);
  const youthRaw = String(formData.get("aud_youth") || "");
  const youthMaxAge = youthRaw === "1" ? 35 : Number(formData.get("aud_youth_age") || 0) || undefined;
  const companyIds = formData.getAll("aud_company").map(String).filter(Boolean);
  if (all && !genders.length && !omanis && !expats && !nationalities.length && !youthMaxAge && !companyIds.length) {
    return { all: true };
  }
  return {
    all: all || (!genders.length && !omanis && !expats && !nationalities.length && !youthMaxAge && !companyIds.length),
    genders: genders.length ? genders : undefined,
    omanis: omanis || undefined,
    expats: expats || undefined,
    nationalities: nationalities.length ? nationalities : undefined,
    youthMaxAge: youthMaxAge && youthMaxAge > 0 ? youthMaxAge : undefined,
    companyIds: companyIds.length ? companyIds : undefined,
  };
}

export function describeAudience(audience: GreetingAudience, t: (ar: string, en: string) => string) {
  if (audience.all && !audience.genders?.length && !audience.omanis && !audience.expats && !audience.nationalities?.length && !audience.youthMaxAge && !audience.companyIds?.length) {
    return t("الكل", "Everyone");
  }
  const parts: string[] = [];
  if (audience.genders?.includes("MALE")) parts.push(t("الرجال", "Men"));
  if (audience.genders?.includes("FEMALE")) parts.push(t("النساء", "Women"));
  if (audience.omanis) parts.push(t("العمانيون", "Omanis"));
  if (audience.expats) parts.push(t("الوافدون", "Expatriates"));
  if (audience.nationalities?.length) parts.push(t(`جنسيات: ${audience.nationalities.join(", ")}`, `Nationalities: ${audience.nationalities.join(", ")}`));
  if (audience.youthMaxAge) parts.push(t(`الشباب (≤ ${audience.youthMaxAge})`, `Youth (≤ ${audience.youthMaxAge})`));
  if (audience.companyIds?.length) parts.push(t(`${audience.companyIds.length} منشأة`, `${audience.companyIds.length} companies`));
  return parts.join(" · ") || t("الكل", "Everyone");
}

function ageYears(dob: Date | null | undefined, on: Date) {
  if (!dob) return null;
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age -= 1;
  return age;
}

/** Employees matching the audience across active companies (not terminated/transferred). */
export async function resolveGreetingRecipients(audience: GreetingAudience) {
  const companies = await prisma.company.findMany({ select: { id: true, name: true, nameEn: true, logoUrl: true } });
  const activeIds: string[] = [];
  for (const company of companies) {
    if (audience.companyIds?.length && !audience.companyIds.includes(company.id)) continue;
    if ((await companyAccess(company.id)).active) activeIds.push(company.id);
  }
  if (!activeIds.length) return [] as { id: string; fullName: string; email: string | null; phone: string | null; nationality: string | null; companyId: string; companyName: string }[];

  const employees = await prisma.employee.findMany({
    where: {
      companyId: { in: activeIds },
      status: { notIn: ["TERMINATED", "TRANSFERRED"] },
      ...(audience.genders?.length ? { gender: { in: audience.genders } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      nationality: true,
      dateOfBirth: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  const now = new Date();
  return employees
    .filter((employee) => {
      const code = (employee.nationality || "").toUpperCase();
      if (audience.omanis && code !== "OM") return false;
      if (audience.expats && (!code || code === "OM")) return false;
      if (audience.nationalities?.length && !audience.nationalities.includes(code)) return false;
      if (audience.youthMaxAge) {
        const age = ageYears(employee.dateOfBirth, now);
        if (age === null || age > audience.youthMaxAge) return false;
      }
      return true;
    })
    .map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      nationality: employee.nationality,
      companyId: employee.companyId,
      companyName: employee.company.name,
    }));
}

/** SVG card used when the image model is unavailable; still looks designed and unique via accents. */
export function fallbackGreetingSvg(input: {
  title: string;
  subjectAr: string;
  bodyAr: string;
  accent: string;
  accent2: string;
}) {
  const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${esc(input.accent)}"/>
      <stop offset="100%" stop-color="${esc(input.accent2)}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="#0b1220"/>
  <rect x="40" y="40" width="1120" height="820" rx="36" fill="url(#g)" opacity="0.95"/>
  <rect x="70" y="70" width="1060" height="760" rx="28" fill="#fffdf8" opacity="0.96"/>
  <text x="600" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="${esc(input.accent)}">BHD HR</text>
  <text x="600" y="260" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#64748b">${esc(input.title.slice(0, 60))}</text>
  <text x="600" y="380" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#0f172a">${esc(input.subjectAr.slice(0, 48))}</text>
  <foreignObject x="160" y="440" width="880" height="280">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:28px;line-height:1.7;color:#334155;text-align:center;direction:rtl">${esc(input.bodyAr.slice(0, 320))}</div>
  </foreignObject>
  <text x="600" y="780" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#94a3b8">بن حمود للتطوير · Build Higher Dreams</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

export async function designGreetingVersion(input: {
  greetingId: string;
  title: string;
  meaning: string;
  brief: string;
  reviseNote?: string | null;
  previousPrompt?: string | null;
}) {
  const design = await aiGreetingDesign({
    title: input.title,
    meaning: input.meaning,
    brief: input.brief,
    reviseNote: input.reviseNote,
    previousPrompt: input.previousPrompt,
  });
  if (!design) throw new Error("design_failed");

  let image = await aiGreetingImage(design.imagePrompt);
  let mime = image?.mime || "image/svg+xml";
  let bytes = image?.bytes || fallbackGreetingSvg({ title: input.title, subjectAr: design.subjectAr, bodyAr: design.bodyAr, accent: design.accent, accent2: design.accent2 });
  if (!image) mime = "image/svg+xml";

  const version = await prisma.platformGreetingVersion.create({
    data: {
      greetingId: input.greetingId,
      token: randomBytes(18).toString("base64url"),
      subjectAr: design.subjectAr,
      subjectEn: design.subjectEn,
      bodyAr: design.bodyAr,
      bodyEn: design.bodyEn,
      imagePrompt: design.imagePrompt,
      mime,
      imageData: new Uint8Array(bytes),
      reviseNote: input.reviseNote?.slice(0, 500) || null,
    },
  });

  await prisma.platformGreeting.update({
    where: { id: input.greetingId },
    data: {
      currentVersionId: version.id,
      subjectAr: design.subjectAr,
      subjectEn: design.subjectEn,
      bodyAr: design.bodyAr,
      bodyEn: design.bodyEn,
      imagePrompt: design.imagePrompt,
      status: "READY",
      lastError: null,
    },
  });

  return version;
}

export function greetingImageUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/api/greetings/img/${token}`;
}

export async function sendGreetingEmails(input: {
  origin: string;
  greeting: {
    id: string;
    title: string;
    subjectAr: string | null;
    subjectEn: string | null;
    bodyAr: string | null;
    bodyEn: string | null;
  };
  version: { token: string; mime: string };
  recipients: { fullName: string; email: string | null; nationality: string | null; companyName: string }[];
  /** When set, only this address receives a test copy. */
  testTo?: string;
}) {
  if (!channelReady("EMAIL")) throw new Error("email_not_ready");
  const imageUrl = greetingImageUrl(input.origin, input.version.token);
  const list = input.testTo
    ? [{ fullName: "تجربة", email: input.testTo, nationality: "OM", companyName: "BHD HR" }]
    : input.recipients.filter((row) => row.email && row.email.includes("@"));

  let sent = 0;
  let failed = 0;
  for (const row of list) {
    const lang = noticeLang(row.nationality);
    const subject = (lang === "en" ? input.greeting.subjectEn : input.greeting.subjectAr) || input.greeting.title;
    const body = (lang === "en" ? input.greeting.bodyEn : input.greeting.bodyAr) || "";
    const html = `
      <div dir="${lang === "en" ? "ltr" : "rtl"}" style="font-family:Arial,sans-serif;line-height:1.8;color:#0f172a;max-width:640px;margin:0 auto">
        <p style="margin:0 0 12px;font-size:18px;font-weight:700">${escapeHtml(subject || "")}</p>
        <p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(body)}</p>
        <img src="${imageUrl}" alt="${escapeHtml(input.greeting.title)}" style="width:100%;max-width:640px;border-radius:16px;display:block;border:1px solid #e2e8f0" />
        <p style="margin:16px 0 0;font-size:12px;color:#64748b">${escapeHtml(row.companyName)} · BHD HR</p>
      </div>`;
    try {
      await sendEmailMessage({
        to: row.email!,
        subject: subject || input.greeting.title,
        text: `${body}\n\n${imageUrl}`,
        html,
        dir: lang === "en" ? "ltr" : "rtl",
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed, attempted: list.length };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** Due scheduled greetings (Muscat day has started for scheduledFor). */
export async function sendDueGreetings(origin: string) {
  const now = new Date();
  const due = await prisma.platformGreeting.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now }, currentVersionId: { not: null } },
    include: { currentVersion: true },
    take: 20,
  });
  const results: { id: string; sent: number; failed: number }[] = [];
  for (const greeting of due) {
    if (!greeting.currentVersion) continue;
    try {
      const audience = readAudience(greeting.audience);
      const recipients = await resolveGreetingRecipients(audience);
      const { sent, failed } = await sendGreetingEmails({
        origin,
        greeting,
        version: greeting.currentVersion,
        recipients,
      });
      await prisma.platformGreeting.update({
        where: { id: greeting.id },
        data: { status: sent ? "SENT" : "FAILED", sentAt: new Date(), sentCount: sent, lastError: failed && !sent ? "send_failed" : null },
      });
      results.push({ id: greeting.id, sent, failed });
    } catch (error) {
      await prisma.platformGreeting.update({
        where: { id: greeting.id },
        data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 200) : "failed" },
      });
      results.push({ id: greeting.id, sent: 0, failed: 1 });
    }
  }
  return results;
}
