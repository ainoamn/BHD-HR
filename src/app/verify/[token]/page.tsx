import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, FileText, Fingerprint, Hash, PenLine, ShieldAlert, ShieldOff, Stamp, UserRound } from "lucide-react";
import { LetterSheet } from "@/components/letter-sheet";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { Card } from "@/components/ui";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import { letterFingerprint, sealedLetter } from "@/lib/letter-seal";
import { prisma } from "@/lib/prisma";
import { lookupByToken } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** What anyone who scans the QR code on a letter sees: whether it is authentic, and the original to download again. */
export default async function VerifyLetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { lang, t } = await getI18n();
  const found = await lookupByToken(token, (verifyToken) =>
    prisma.letter.findUnique({ where: { verifyToken }, include: { employee: { include: { employer: true } }, company: true } }),
  );
  if (!found || !found.fingerprint) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <Card className="text-center">
          <ShieldOff size={32} className="mx-auto text-red-500" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t("لم يُعثر على المستند", "Document not found")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("هذا الرمز لا يطابق أي مستند صادر من النظام. لا تعتمد الورقة التي بين يديك.", "This code doesn't match any document issued by the system. Don't rely on the paper you have.")}
          </p>
        </Card>
      </main>
    );
  }

  const { letter, seal } = await sealedLetter(found, await requestOrigin(), true);
  const employer = letter.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, letter.company);
  header.logoUrl = await inlineLogo(header.logoUrl, letter.companyId);
  const issuer = lang === "en" && header.nameEn ? header.nameEn : header.name;
  const kind = (LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL).label[lang];
  const intact = letterFingerprint(letter) === letter.fingerprint;
  const employeeName = lang === "en" && letter.employee.nameEn ? letter.employee.nameEn : letter.employee.fullName;
  const status = letter.cancelledAt
    ? {
        icon: ShieldOff,
        title: t("مستند ملغى — غير معتمد", "Cancelled document — not valid"),
        text: t(`ألغت ${issuer} هذا المستند في ${formatDate(letter.cancelledAt)}، فلم يعد معتمداً.`, `${issuer} cancelled this document on ${formatDate(letter.cancelledAt)}; it is no longer valid.`),
        tone: "bg-red-50 text-red-800 ring-red-200",
      }
    : !intact
      ? {
          icon: ShieldAlert,
          title: t("تعذّر التحقق من سلامة المحتوى", "Content integrity could not be confirmed"),
          text: t("تغيّر محتوى المستند في النظام بعد توقيعه. تواصل مع جهة الإصدار قبل الاعتماد عليه.", "The document changed in the system after it was signed. Contact the issuer before relying on it."),
          tone: "bg-amber-50 text-amber-900 ring-amber-200",
        }
      : {
          icon: BadgeCheck,
          title: t(`مستند أصلي معتمد من ${issuer}`, `Authentic document issued by ${issuer}`),
          text: t("صدر هذا المستند من النظام وموقّع إلكترونياً، ومحتواه مطابق لما وُقّع. قارن الورقة بالنسخة أدناه.", "This document was issued by the system and signed electronically, and its content matches what was signed. Compare the paper with the copy below."),
          tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        };
  const rows = [
    { icon: FileText, label: t("نوع المستند", "Document"), value: kind },
    { icon: Hash, label: t("الرقم", "Reference"), value: letter.refNo, ltr: true },
    { icon: CalendarDays, label: t("تاريخ الإصدار", "Issued on"), value: formatDate(letter.issuedAt) },
    { icon: UserRound, label: t("الموظف", "Employee"), value: employeeName },
    { icon: PenLine, label: t("وقّعه إلكترونياً", "E-signed by"), value: `${seal.signedByName || letter.signatoryName || "—"} · ${formatDateTime(seal.signedAt)}` },
    { icon: Stamp, label: t("رقم التوقيع الإلكتروني", "E-signature No."), value: seal.serial || "—", ltr: true },
    { icon: Fingerprint, label: t("رمز التحقق", "Verification code"), value: seal.code, ltr: true },
  ];

  return (
    <main className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-8 print:px-0 print:py-0">
        <section className="no-print animate-fade-up mb-4 overflow-hidden rounded-3xl border border-slate-200/90 bg-surface shadow-card">
          <div className={`flex items-start gap-3 px-4 py-4 ring-1 ring-inset sm:px-5 ${status.tone}`}>
            <status.icon size={26} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold">{status.title}</h1>
              <p className="mt-1 text-sm leading-6">{status.text}</p>
            </div>
          </div>
          <dl className="grid gap-x-6 px-4 py-2 text-sm sm:grid-cols-2 sm:px-5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <row.icon size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <dt className="w-28 shrink-0 text-slate-500">{row.label}</dt>
                <dd className={`min-w-0 flex-1 break-words font-semibold text-slate-900 ${row.ltr ? "tabular" : ""}`} dir={row.ltr ? "ltr" : undefined}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {letter.cancelledAt ? null : (
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs leading-5 text-slate-500">{t("لحفظ النسخة الأصلية اختر «حفظ بصيغة PDF» في نافذة الطباعة.", "To keep the original, choose “Save as PDF” in the print dialog.")}</p>
              <PrintButton label={t("تحميل الأصل PDF / طباعة", "Download original PDF / Print")} />
            </div>
          )}
        </section>
        {letter.cancelledAt ? null : <LetterSheet letter={letter} header={header} seal={seal} />}
      </div>
    </main>
  );
}
