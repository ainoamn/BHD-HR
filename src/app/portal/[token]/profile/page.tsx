import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ProfileSheet } from "@/components/profile-sheet";
import { secondaryBtn } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { loadProfile } from "@/lib/profile";
import { requestOrigin } from "@/lib/request-origin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const chip = "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition";

/** The employee's own full profile as a CV, ready to print or save as PDF. */
export default async function PortalProfilePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; docs?: string; salary?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { lang: uiLang, t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const lang = sp.lang === "en" || sp.lang === "ar" ? sp.lang : uiLang;
  const options = { docs: sp.docs !== "0", salary: sp.salary === "1" };
  const data = await loadProfile(employee.id, employee.companyId, { lang, origin: await requestOrigin(), inline: true, documents: options.docs, salary: options.salary });
  if (!data) notFound();
  const base = `/portal/${token}`;
  const href = (patch: Partial<{ lang: string; docs: string; salary: string }>) =>
    `${base}/profile?${new URLSearchParams({ lang: data.lang, docs: options.docs ? "1" : "0", salary: options.salary ? "1" : "0", ...patch })}`;
  const toggle = (on: boolean, label: string, patch: Partial<{ docs: string; salary: string }>) => (
    <Link href={href(patch)} replace className={cn(chip, on ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")} aria-pressed={on}>
      {on ? "✓ " : ""}
      {label}
    </Link>
  );

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
        <style>{`@page { size: A4; margin: 10mm; }`}</style>
        <div className="no-print mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`${base}#cv`} className="text-sm font-semibold text-teal-800">
              {t("رجوع إلى صفحتي", "Back to my page")}
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/cv?lang=${data.lang}`} className={secondaryBtn}>
                <Pencil size={16} />
                {t("تعديل سيرتي", "Edit my CV")}
              </Link>
              <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-slate-200">
            {(["ar", "en"] as const).map((item) => (
              <Link key={item} href={href({ lang: item })} replace className={cn(chip, data.lang === item ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")}>
                {item === "ar" ? "العربية" : "English"}
              </Link>
            ))}
            <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
            {toggle(options.docs, t("الوثائق الرسمية", "Official documents"), { docs: options.docs ? "0" : "1" })}
            {toggle(options.salary, t("الراتب والبدلات", "Salary"), { salary: options.salary ? "0" : "1" })}
          </div>
          {data.lang !== lang ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-100">
              {t("لا توجد سيرة بهذه اللغة بعد، فعُرضت النسخة المتوفرة. أضفها من «تعديل سيرتي».", "There is no CV in that language yet, so the available version is shown. Add it from “Edit my CV”.")}
            </p>
          ) : null}
        </div>
        <ProfileSheet data={data} />
      </div>
    </div>
  );
}
