import { DOC_LABEL } from "./constants";

/** Types that can be toggled for expiry alerts / documents views. */
export const ALERT_DOC_TYPES = Object.keys(DOC_LABEL);

/** When Company.alertDocTypes is null/empty, every known type is tracked (current behaviour). */
export function readAlertDocTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [...ALERT_DOC_TYPES];
  const allowed = new Set(ALERT_DOC_TYPES);
  const picked = value.filter((item): item is string => typeof item === "string" && allowed.has(item));
  return picked.length ? picked : [...ALERT_DOC_TYPES];
}

export function tracksAlertDoc(types: readonly string[], type: string) {
  return types.includes(type);
}
