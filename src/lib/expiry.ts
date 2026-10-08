import type { Lang } from "./i18n";
import { daysPhrase } from "./utils";

export type ExpiryInfo = {
  key: "none" | "expired" | "today" | "urgent" | "warning" | "early" | "ok";
  label: string;
  days: number;
  tone: "slate" | "red" | "orange" | "amber" | "sky" | "green";
};

export function daysUntil(date: Date) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((target - todayUtc) / 86400000);
}

export function describeExpiry(
  date: Date | null | undefined,
  limits: { urgent: number; warning: number; early: number },
  lang: Lang = "ar",
): ExpiryInfo {
  const en = lang === "en";
  if (!date) return { key: "none", label: en ? "No date" : "بدون تاريخ", days: 9999, tone: "slate" };
  const days = daysUntil(new Date(date));
  const phrase = daysPhrase(days, lang);
  const soon = en ? `Expires in ${phrase}` : `تنتهي بعد ${phrase}`;
  if (days < 0) return { key: "expired", label: en ? `Expired ${phrase} ago` : `منتهية منذ ${phrase}`, days, tone: "red" };
  if (days === 0) return { key: "today", label: en ? "Expires today" : "تنتهي اليوم", days, tone: "red" };
  if (days <= limits.urgent) return { key: "urgent", label: soon, days, tone: "orange" };
  if (days <= limits.warning) return { key: "warning", label: soon, days, tone: "amber" };
  if (days <= limits.early) return { key: "early", label: soon, days, tone: "sky" };
  return { key: "ok", label: en ? "Valid" : "ساري", days, tone: "green" };
}

export function worstExpiry(dates: Array<Date | null | undefined>, limits: { urgent: number; warning: number; early: number }, lang: Lang = "ar") {
  const items = dates.filter((date): date is Date => Boolean(date)).map((date) => describeExpiry(date, limits, lang));
  if (!items.length) return describeExpiry(null, limits, lang);
  return items.sort((a, b) => a.days - b.days)[0];
}
