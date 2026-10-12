/** Banks licensed in Oman with their SWIFT/BIC, used by the WPS salary file. Confirm the code with the bank before the first file. */
export const OMAN_BANKS: { bic: string; ar: string; en: string }[] = [
  { bic: "BMUSOMRX", ar: "بنك مسقط", en: "Bank Muscat" },
  { bic: "NBOMOMRX", ar: "البنك الوطني العماني", en: "National Bank of Oman" },
  { bic: "BDOFOMRU", ar: "بنك ظفار", en: "Bank Dhofar" },
  { bic: "BSHROMRU", ar: "صحار الدولي", en: "Sohar International" },
  { bic: "OMABOMRU", ar: "بنك العربي العماني", en: "Oman Arab Bank" },
  { bic: "BBMEOMRX", ar: "إتش إس بي سي عُمان", en: "HSBC Bank Oman" },
  { bic: "AUBOOMRU", ar: "البنك الأهلي", en: "Ahli Bank" },
  { bic: "BNZWOMRX", ar: "بنك نزوى", en: "Bank Nizwa" },
  { bic: "IZZBOMRU", ar: "العز الإسلامي", en: "Alizz Islamic Bank" },
  { bic: "SCBLOMRX", ar: "ستاندرد تشارترد", en: "Standard Chartered" },
  { bic: "QNBAOMRX", ar: "بنك قطر الوطني", en: "Qatar National Bank" },
  { bic: "NBADOMRX", ar: "بنك أبوظبي الأول", en: "First Abu Dhabi Bank" },
  { bic: "HABBOMRX", ar: "بنك حبيب", en: "Habib Bank" },
  { bic: "SBINOMRX", ar: "بنك الدولة الهندي", en: "State Bank of India" },
  { bic: "BARBOMMX", ar: "بنك بارودا", en: "Bank of Baroda" },
];

export function bankName(bic: string | null | undefined, lang: "ar" | "en") {
  if (!bic) return null;
  const bank = OMAN_BANKS.find((item) => item.bic === bic.toUpperCase());
  return bank ? bank[lang] : bic;
}

export function bankOptions(lang: "ar" | "en") {
  return OMAN_BANKS.map((bank) => ({ value: bank.bic, label: bank[lang], hint: bank.bic }));
}

/** Account numbers keep digits and letters only; BICs are 8 or 11 characters. */
export function cleanAccount(value: string | null | undefined) {
  const clean = (value || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return clean ? clean.slice(0, 34) : null;
}

export function cleanBic(value: string | null | undefined) {
  const clean = (value || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(clean) ? clean : null;
}
