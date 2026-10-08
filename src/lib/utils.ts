export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function round3(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function money(value: number, currency = "ر.ع") {
  const formatted = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${formatted} ${currency}`;
}

export function text(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : "—";
}

export function daysLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function daysPhrase(days: number, lang: "ar" | "en" = "ar") {
  const count = Math.abs(days);
  if (lang === "en") return count === 1 ? "1 day" : `${count} days`;
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومين";
  if (count >= 3 && count <= 10) return `${count} أيام`;
  return `${count} يوماً`;
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()} ${hours}:${minutes}`;
}

export function formatLongDate(lang: "ar" | "en" = "ar", date = new Date()) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-OM", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function currentPeriod(date = new Date()) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function readPeriod(input: { year?: string; month?: string }) {
  const now = currentPeriod();
  const year = Number(input.year || now.year);
  const month = Number(input.month || now.month);
  return {
    year: year >= 2000 && year <= 2100 ? year : now.year,
    month: month >= 1 && month <= 12 ? month : now.month,
  };
}

export function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function calendarDays(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function parseDateInput(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function toDateInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function req(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function str(formData: FormData, key: string) {
  const value = req(formData, key);
  return value ? value : null;
}

export function clip(value: string | null, max: number) {
  if (!value) return null;
  return value.slice(0, max);
}

export function num(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? round3(value) : 0;
}

export function intValue(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  return Number.isFinite(value) ? value : 0;
}

export function safeReturn(value: FormDataEntryValue | null, fallback: string) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}

export function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}
