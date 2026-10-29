"use client";

import { BhdAppIcon } from "./BhdAppIcon";
import { gatewayApps, type BhdApp } from "@/lib/bhd/apps";
import { BHD_PORTAL_ORIGIN, type UiLocale } from "@/lib/bhd/identity-public";
import { useBhdCatalog } from "@/lib/identity/use-bhd-catalog";

const COPY = {
  ar: { title: "برامجنا", all: "كل التطبيقات وشرحها" },
  en: { title: "Our programs", all: "All apps and guides" },
} as const;

function programHref(app: BhdApp) {
  if (app.id === "office") return `${BHD_PORTAL_ORIGIN}/products/bhd-office`;
  if (app.homeUrl) return app.homeUrl;
  if (app.id === "bhd-r") return "https://r.bhd-om.com/ar";
  return `${app.origin.replace(/\/$/, "")}/`;
}

/** Same live catalog tiles used in the footer and the marketing home. */
export function BhdProgramsGrid({
  locale = "ar",
  excludePortal = true,
  heading = true,
}: {
  locale?: UiLocale;
  excludePortal?: boolean;
  heading?: boolean;
}) {
  const t = COPY[locale];
  const isArabic = locale === "ar";
  const catalogApps = useBhdCatalog();
  let programs = gatewayApps(catalogApps);
  if (excludePortal) programs = programs.filter((app) => app.id !== "portal");

  return (
    <div className="footer-programs" lang={locale} dir={isArabic ? "rtl" : "ltr"}>
      {heading ? (
        <div className="footer-programs-head">
          <p>{t.title}</p>
          <a href={`${BHD_PORTAL_ORIGIN}/apps`}>{t.all}</a>
        </div>
      ) : null}
      <div className="footer-programs-grid">
        {programs.map((app) => {
          const label = isArabic ? app.nameAr : app.nameEn;
          return (
            <a key={app.id} href={programHref(app)} className="footer-program" title={label}>
              <BhdAppIcon id={app.id} title={label} logoUrl={app.logoUrl} soft={app.soft} accent={app.accent} />
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
