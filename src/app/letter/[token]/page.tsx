import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { LetterSheet } from "@/components/letter-sheet";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { acknowledgeLetter } from "@/server/letter-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The employee's copy, opened from the email / WhatsApp link. The 32-character token is the only key. */
export default async function EmployeeLetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getI18n();
  const letter = token.length >= 20 ? await prisma.letter.findUnique({ where: { token }, include: { employee: { include: { employer: true } }, company: true } }) : null;
  if (!letter) notFound();
  if (!letter.viewedAt) await prisma.letter.update({ where: { id: letter.id }, data: { viewedAt: new Date() } });
  const employer = letter.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, letter.company);
  header.logoUrl = await inlineLogo(header.logoUrl, letter.companyId);

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-8 print:px-0 print:py-0">
        <style>{`@page { size: A4; margin: 12mm; }`}</style>
        <div className="no-print mb-4 flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          {letter.cancelledAt ? (
            <p className="font-semibold text-red-700">{t("ألغت الإدارة هذا الخطاب.", "Management has cancelled this letter.")}</p>
          ) : letter.acknowledgedAt ? (
            <p className="flex items-center gap-2 font-semibold text-emerald-700">
              <CheckCircle2 size={18} />
              {t(`تم تأكيد الاستلام في ${formatDateTime(letter.acknowledgedAt)}`, `Receipt confirmed on ${formatDateTime(letter.acknowledgedAt)}`)}
            </p>
          ) : (
            <form action={acknowledgeLetter} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-slate-600">{t("بعد قراءة الخطاب، أكّد استلامه:", "After reading the letter, confirm receipt:")}</p>
              <SubmitButton pendingLabel={t("جارٍ التأكيد...", "Confirming...")}>
                <CheckCircle2 size={16} />
                {t("أقر باستلام الخطاب", "I confirm receipt")}
              </SubmitButton>
            </form>
          )}
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
        <LetterSheet letter={letter} header={header} />
      </div>
    </div>
  );
}
