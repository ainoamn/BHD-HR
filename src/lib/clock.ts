/** Oman has no daylight saving: Muscat is always UTC+4. */
const MUSCAT_OFFSET_MS = 4 * 3600000;

/** YYYY-MM-DD of a moment in Muscat time; clock entries are stored per Muscat day. */
export function muscatDay(date = new Date()) {
  return new Date(date.getTime() + MUSCAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** HH:MM of a moment in Muscat time. */
export function muscatTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(new Date(date).getTime() + MUSCAT_OFFSET_MS).toISOString().slice(11, 16);
}

/** DD/MM/YYYY HH:MM in Muscat time, for appointments such as interviews. */
export function muscatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  const iso = new Date(new Date(date).getTime() + MUSCAT_OFFSET_MS).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

/** Value for <input type="datetime-local"> in Muscat time. */
export function muscatInputValue(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(new Date(date).getTime() + MUSCAT_OFFSET_MS).toISOString().slice(0, 16);
}

export function parseWorkStart(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() || "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** Minutes after the start time on that Muscat day; 0 when early, on time or no start time is set. */
export function lateMinutes(at: Date, workStart: string | null | undefined) {
  const start = parseWorkStart(workStart);
  if (start === null) return 0;
  const local = new Date(at.getTime() + MUSCAT_OFFSET_MS);
  return Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - start);
}

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function validCoords(lat: unknown, lng: unknown): [number, number] | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
}

/** Hours and minutes between clock-in and clock-out, e.g. "8:05". */
export function workedLabel(inAt: Date | string, outAt: Date | string | null | undefined) {
  if (!outAt) return "—";
  const minutes = Math.max(0, Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
