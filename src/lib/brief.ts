import crypto from "node:crypto";
import type { Company } from "@prisma/client";
import { aiDailyBrief } from "./ai";
import { type AlertItem, computeAlerts } from "./alerts";
import { type Lang, makeT } from "./i18n";
import { prisma } from "./prisma";

/** The model reads at most this many alerts; the rest are counted in the opening sentence. */
const FACT_LIMIT = 40;
/** Letters older than this without the employee's confirmation are worth a reminder. */
const UNCONFIRMED_AFTER_DAYS = 3;

/** Today's date in Oman (YYYY-MM-DD); the brief is renewed once a day. */
export function briefDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(now);
}

export function briefScope(permissions: readonly string[]) {
  return crypto.createHash("sha1").update([...permissions].sort().join(",")).digest("base64url").slice(0, 12);
}

async function briefFacts(company: Company, permissions: readonly string[], lang: Lang) {
  const t = makeT(lang);
  const alerts = await computeAlerts(company, permissions, lang);
  const facts = alerts.slice(0, FACT_LIMIT).map((alert) => `[${alert.severity}] ${alert.title} — ${alert.message}`);
  if (alerts.length > FACT_LIMIT) facts.push(t(`و${alerts.length - FACT_LIMIT} تنبيهات أخرى أقل أهمية`, `and ${alerts.length - FACT_LIMIT} more, less urgent alerts`));
  if (permissions.includes("letters.view")) {
    const unconfirmed = await prisma.letter.count({
      where: { companyId: company.id, cancelledAt: null, acknowledgedAt: null, issuedAt: { lt: new Date(Date.now() - UNCONFIRMED_AFTER_DAYS * 86400000) } },
    });
    if (unconfirmed) facts.push(t(`${unconfirmed} خطاب لم يؤكد الموظفون استلامها منذ أكثر من ${UNCONFIRMED_AFTER_DAYS} أيام`, `${unconfirmed} letter(s) not confirmed by the employee for over ${UNCONFIRMED_AFTER_DAYS} days`));
  }
  return { alerts, facts };
}

/** Plain summary used when the AI is unavailable. */
function fallbackBrief(alerts: AlertItem[], lang: Lang) {
  const t = makeT(lang);
  if (!alerts.length) return t("لا يوجد ما يحتاج متابعتك اليوم.", "Nothing needs your attention today.");
  const urgent = alerts.filter((alert) => alert.severity === "danger").length;
  const head = urgent
    ? t(`لديك ${alerts.length} تنبيه، منها ${urgent} عاجل.`, `You have ${alerts.length} alert(s), ${urgent} of them urgent.`)
    : t(`لديك ${alerts.length} تنبيه، لا شيء منها عاجل.`, `You have ${alerts.length} alert(s), none of them urgent.`);
  return [head, ...alerts.slice(0, 5).map((alert) => `- ${alert.title} — ${alert.message}`)].join("\n");
}

export type DailyBrief = { text: string; ai: boolean; alertCount: number; createdAt: Date };

/** Cached per company, day, language and permission set. Pass `refresh` to rebuild it now. */
export async function getDailyBrief(company: Company, permissions: readonly string[], lang: Lang, options: { refresh?: boolean } = {}): Promise<DailyBrief> {
  const key = { companyId: company.id, day: briefDay(), lang, scope: briefScope(permissions) };
  if (!options.refresh) {
    const cached = await prisma.dailyBrief.findUnique({ where: { companyId_day_lang_scope: key } });
    if (cached) return { text: cached.text, ai: true, alertCount: -1, createdAt: cached.createdAt };
  }
  const { alerts, facts } = await briefFacts(company, permissions, lang);
  if (!facts.length) return { text: fallbackBrief([], lang), ai: false, alertCount: 0, createdAt: new Date() };
  let text: string | null = null;
  try {
    text = await aiDailyBrief({ lang, companyName: lang === "en" && company.nameEn ? company.nameEn : company.name, today: key.day, facts });
  } catch {
    text = null;
  }
  if (!text) return { text: fallbackBrief(alerts, lang), ai: false, alertCount: alerts.length, createdAt: new Date() };
  const saved = await prisma.dailyBrief.upsert({ where: { companyId_day_lang_scope: key }, create: { ...key, text }, update: { text, createdAt: new Date() } });
  return { text, ai: true, alertCount: alerts.length, createdAt: saved.createdAt };
}
