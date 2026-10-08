import { cookies } from "next/headers";
import { cache } from "react";
import { LANG_COOKIE, makeT, normalizeLang } from "./i18n";

export const getI18n = cache(async () => {
  const jar = await cookies();
  const lang = normalizeLang(jar.get(LANG_COOKIE)?.value);
  return { lang, t: makeT(lang) };
});
