import type { Lang } from "./i18n";

export const DEFAULT_PHONE_COUNTRY = "OM";

/** ISO 3166 code → international dialing code (without "+"). */
const DIAL: Record<string, string> = {
  AD: "376", AE: "971", AF: "93", AG: "1268", AI: "1264", AL: "355", AM: "374", AO: "244", AR: "54", AS: "1684",
  AT: "43", AU: "61", AW: "297", AX: "358", AZ: "994", BA: "387", BB: "1246", BD: "880", BE: "32", BF: "226",
  BG: "359", BH: "973", BI: "257", BJ: "229", BL: "590", BM: "1441", BN: "673", BO: "591", BQ: "599", BR: "55",
  BS: "1242", BT: "975", BW: "267", BY: "375", BZ: "501", CA: "1", CC: "61", CD: "243", CF: "236", CG: "242",
  CH: "41", CI: "225", CK: "682", CL: "56", CM: "237", CN: "86", CO: "57", CR: "506", CU: "53", CV: "238",
  CW: "599", CX: "61", CY: "357", CZ: "420", DE: "49", DJ: "253", DK: "45", DM: "1767", DO: "1809", DZ: "213",
  EC: "593", EE: "372", EG: "20", EH: "212", ER: "291", ES: "34", ET: "251", FI: "358", FJ: "679", FK: "500",
  FM: "691", FO: "298", FR: "33", GA: "241", GB: "44", GD: "1473", GE: "995", GF: "594", GG: "44", GH: "233",
  GI: "350", GL: "299", GM: "220", GN: "224", GP: "590", GQ: "240", GR: "30", GT: "502", GU: "1671", GW: "245",
  GY: "592", HK: "852", HN: "504", HR: "385", HT: "509", HU: "36", ID: "62", IE: "353", IL: "972", IM: "44",
  IN: "91", IO: "246", IQ: "964", IR: "98", IS: "354", IT: "39", JE: "44", JM: "1876", JO: "962", JP: "81",
  KE: "254", KG: "996", KH: "855", KI: "686", KM: "269", KN: "1869", KP: "850", KR: "82", KW: "965", KY: "1345",
  KZ: "7", LA: "856", LB: "961", LC: "1758", LI: "423", LK: "94", LR: "231", LS: "266", LT: "370", LU: "352",
  LV: "371", LY: "218", MA: "212", MC: "377", MD: "373", ME: "382", MF: "590", MG: "261", MH: "692", MK: "389",
  ML: "223", MM: "95", MN: "976", MO: "853", MP: "1670", MQ: "596", MR: "222", MS: "1664", MT: "356", MU: "230",
  MV: "960", MW: "265", MX: "52", MY: "60", MZ: "258", NA: "264", NC: "687", NE: "227", NF: "672", NG: "234",
  NI: "505", NL: "31", NO: "47", NP: "977", NR: "674", NU: "683", NZ: "64", OM: "968", PA: "507", PE: "51",
  PF: "689", PG: "675", PH: "63", PK: "92", PL: "48", PM: "508", PR: "1787", PS: "970", PT: "351", PW: "680",
  PY: "595", QA: "974", RE: "262", RO: "40", RS: "381", RU: "7", RW: "250", SA: "966", SB: "677", SC: "248",
  SD: "249", SE: "46", SG: "65", SH: "290", SI: "386", SJ: "47", SK: "421", SL: "232", SM: "378", SN: "221",
  SO: "252", SR: "597", SS: "211", ST: "239", SV: "503", SX: "1721", SY: "963", SZ: "268", TC: "1649", TD: "235",
  TG: "228", TH: "66", TJ: "992", TK: "690", TL: "670", TM: "993", TN: "216", TO: "676", TR: "90", TT: "1868",
  TV: "688", TW: "886", TZ: "255", UA: "380", UG: "256", US: "1", UY: "598", UZ: "998", VA: "39", VC: "1784",
  VE: "58", VG: "1284", VI: "1340", VN: "84", VU: "678", WF: "681", WS: "685", XK: "383", YE: "967", YT: "262",
  ZA: "27", ZM: "260", ZW: "263",
};

/** When several countries share a code, a stored number reads back as this one. */
const PREFERRED: Record<string, string> = {
  "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "61": "AU", "212": "MA", "262": "RE", "358": "FI", "590": "GP", "599": "CW",
};

/** Countries whose numbers keep their leading 0 after the country code. */
const KEEPS_ZERO = new Set(["IT", "SM", "VA"]);

const BY_DIAL = new Map<string, string>();
for (const [iso, dial] of Object.entries(DIAL)) if (!BY_DIAL.has(dial) || PREFERRED[dial] === iso) BY_DIAL.set(dial, iso);

export function dialCode(country: string) {
  return DIAL[country] ?? DIAL[DEFAULT_PHONE_COUNTRY];
}

const digits = (value: string) => value.replace(/\D/g, "");

/** Splits a stored phone into country and local number. Numbers saved without a code are Omani. */
export function splitPhone(raw: string | null | undefined): { country: string; number: string } {
  const value = (raw || "").trim();
  const international = value.startsWith("+") || value.startsWith("00");
  if (!international) {
    const local = digits(value);
    const omanCode = DIAL[DEFAULT_PHONE_COUNTRY];
    const typedWithCode = local.length === omanCode.length + 8 && local.startsWith(omanCode);
    return { country: DEFAULT_PHONE_COUNTRY, number: typedWithCode ? local.slice(omanCode.length) : local };
  }
  const all = digits(value).replace(/^00/, "");
  for (let length = 4; length >= 1; length -= 1) {
    const country = BY_DIAL.get(all.slice(0, length));
    if (country) return { country, number: all.slice(length) };
  }
  return { country: DEFAULT_PHONE_COUNTRY, number: all };
}

/** "+968 91234567", or null when there is no number. */
export function joinPhone(country: string, number: string) {
  let local = digits(number);
  if (!KEEPS_ZERO.has(country)) local = local.replace(/^0+/, "");
  return local ? `+${dialCode(country)} ${local}` : null;
}

/** Normalises whatever was posted (already joined by the form, or typed without a code). */
export function normalizePhone(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  const { country, number } = splitPhone(raw);
  return joinPhone(country, number);
}

/** For display: always with the country code. */
export function formatPhone(raw: string | null | undefined) {
  return normalizePhone(raw) || (raw?.trim() ? raw.trim() : null);
}

export function phoneHref(raw: string | null | undefined) {
  const formatted = formatPhone(raw);
  return formatted ? `tel:${formatted.replace(/\s/g, "")}` : undefined;
}

export type PhoneCountry = { iso: string; dial: string; name: string; other: string };

/** All countries, Oman first, then by name in the reader's language. */
export function phoneCountries(lang: Lang): PhoneCountry[] {
  const names = new Intl.DisplayNames([lang === "en" ? "en" : "ar"], { type: "region" });
  const others = new Intl.DisplayNames([lang === "en" ? "ar" : "en"], { type: "region" });
  const collator = new Intl.Collator(lang);
  return Object.entries(DIAL)
    .map(([iso, dial]) => ({ iso, dial, name: names.of(iso) || iso, other: others.of(iso) || iso }))
    .sort((a, b) => (a.iso === DEFAULT_PHONE_COUNTRY ? -1 : b.iso === DEFAULT_PHONE_COUNTRY ? 1 : collator.compare(a.name, b.name)));
}
