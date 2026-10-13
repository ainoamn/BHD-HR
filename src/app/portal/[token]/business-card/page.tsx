import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCardSheet } from "@/components/business-card";
import { PrintButton } from "@/components/print-button";
import { businessCardData } from "@/lib/business-card";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const chip = "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition";

export default async function PortalBusinessCardPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const data = await businessCardData(employee, true);
  const sheet = sp.layout !== "single";
  const base = `/portal/${token}`;

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
        <style>{`@page { size: A4; margin: 12mm; }`}</style>
        <div className="no-print mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`${base}#cv`} className="text-sm font-semibold text-teal-800">
              {t("رجوع إلى صفحتي", "Back to my page")}
            </Link>
            <PrintButton label={t("طباعة بطاقة العمل", "Print business card")} />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-slate-200">
            {[
              { value: "sheet", label: t("ورقة A4 (10 بطاقات)", "A4 sheet (10 cards)") },
              { value: "single", label: t("بطاقة واحدة", "One card") },
            ].map((option) => (
              <Link
                key={option.value}
                href={`${base}/business-card?layout=${option.value}`}
                replace
                className={cn(chip, (option.value === "sheet") === sheet ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
            {t(
              "مقاس 90 × 50 مم. اطبع بمقياس 100% وعلى الوجهين ثم قصّ على الخطوط. رمز QR يحفظ بياناتك في هاتف من يمسحه. لتصحيح الهاتف أو البريد تواصل مع الموارد البشرية.",
              "Size 90 × 50 mm. Print at 100%, double-sided, then cut along the lines. The QR code saves your details on the phone that scans it. To correct your phone or email, contact HR.",
            )}
          </p>
        </div>
        <BusinessCardSheet data={data} sheet={sheet} />
      </div>
    </div>
  );
}
