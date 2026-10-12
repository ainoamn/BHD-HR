import Link from "next/link";
import { notFound } from "next/navigation";
import { LetterSheet } from "@/components/letter-sheet";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { sealedLetter } from "@/lib/letter-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

export default async function LetterPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("letters.view");
  const { t } = await getI18n();
  const found = await prisma.letter.findFirst({ where: { id, companyId: user.companyId }, include: { employee: { include: { employer: true } } } });
  if (!found) notFound();
  const { letter, seal } = await sealedLetter(found, await requestOrigin(), false);
  const employer = letter.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);
  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/letters/${letter.id}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للخطاب", "Back to the letter")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>
      <LetterSheet letter={letter} header={header} seal={seal} />
    </div>
  );
}
