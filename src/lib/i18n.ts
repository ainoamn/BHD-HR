export type Lang = "ar" | "en";
export type Bi = { ar: string; en: string };
export type T = (ar: string, en: string) => string;

export const LANG_COOKIE = "lang";

export function normalizeLang(value?: string | null): Lang {
  return value === "en" ? "en" : "ar";
}

export function makeT(lang: Lang): T {
  return (ar, en) => (lang === "en" ? en : ar);
}

export function pick(label: Bi | undefined, lang: Lang, fallback = "") {
  if (!label) return fallback;
  return label[lang] || label.ar || fallback;
}

export function both(label: Bi) {
  return `${label.ar} / ${label.en}`;
}
