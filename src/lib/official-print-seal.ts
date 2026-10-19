import { qrSvg } from "@/lib/badge";
import { inlineLogo } from "@/lib/inline-logo";
import { headerFor, type DocHeader } from "@/components/salary-docs";
import type { Company } from "@prisma/client";

/** Builds company letterhead + logo QR pointing at the live page URL. */
export async function officialPrintSeal(company: Company, pageUrl: string, signedBy: string) {
  const header: DocHeader = headerFor({}, company);
  const logo = (await inlineLogo(company.logoUrl, company.id)) || company.logoUrl;
  if (logo) header.logoUrl = logo;
  const printedAt = new Date();
  const qr = await qrSvg(pageUrl, logo);
  const serial = `PR-${printedAt.getUTCFullYear()}${String(printedAt.getUTCMonth() + 1).padStart(2, "0")}${String(printedAt.getUTCDate()).padStart(2, "0")}-${printedAt.getUTCHours()}${printedAt.getUTCMinutes()}`;
  return {
    header,
    printedAt,
    seal: { qr, url: pageUrl, signedBy, signedAt: printedAt, serial },
  };
}
