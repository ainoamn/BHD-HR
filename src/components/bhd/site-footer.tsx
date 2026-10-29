"use client";

import { BhdProgramsGrid } from "./BhdProgramsGrid";
import { BHD_PORTAL_ORIGIN, type UiLocale } from "@/lib/bhd/identity-public";

const FOOTER_COPY = {
  ar: {
    programs: "برامجنا",
    about: "عن الشركة",
    brand: "هوية الشركة",
    apps: "برامجنا",
    privacy: "الخصوصية",
    terms: "الشروط",
    security: "الأمان",
    admin: "دخول الإدارة",
    place: "مسقط · سلطنة عُمان",
    promise: "ابنِ أحلامًا أكبر.",
    rights: "شركة بن حمود للتطوير. جميع الحقوق محفوظة.",
  },
  en: {
    programs: "Our programs",
    about: "About",
    brand: "Brand",
    apps: "Programs",
    privacy: "Privacy",
    terms: "Terms",
    security: "Security",
    admin: "Admin sign-in",
    place: "Muscat · Sultanate of Oman",
    promise: "Build Higher Dreams.",
    rights: "Bin Hamood Development. All rights reserved.",
  },
} as const;

export function SiteFooter({ locale }: { locale: UiLocale }) {
  const t = FOOTER_COPY[locale];
  const isArabic = locale === "ar";
  const site = (path: string) => `${BHD_PORTAL_ORIGIN}${path}`;
  return (
    <footer className="site-footer no-print" lang={locale} dir={isArabic ? "rtl" : "ltr"}>
      <div className="footer-wrap">
        <BhdProgramsGrid locale={locale} />
      </div>
      <div className="footer-wrap footer-top">
        <div className="footer-brand">
          <span className="official-logo official-logo-full official-logo-light footer-official-logo" aria-hidden="true" />
        </div>
        <p>{t.promise}</p>
        <nav className="footer-links" aria-label={t.programs}>
          <a href={site("/about")}>{t.about}</a>
          <a href={site("/brand")}>{t.brand}</a>
          <a href={site("/apps")}>{t.apps}</a>
          <a href={site("/privacy")}>{t.privacy}</a>
          <a href={site("/terms")}>{t.terms}</a>
          <a href={site("/security")}>{t.security}</a>
          <a href="/api/auth/admin-entry">{t.admin}</a>
        </nav>
      </div>
      <div className="footer-wrap footer-bottom">
        <span>© 2026 {t.rights}</span>
        <span>{t.place}</span>
      </div>
    </footer>
  );
}
