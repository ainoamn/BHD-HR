import Link from "next/link";
import { notFound } from "next/navigation";
import { CustodySheet } from "@/components/custody-sheet";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";

export default async function CustodyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("documents.view");
  const { t } = await getI18n();
  const form = await prisma.custodyForm.findFirst({
    where: { id, companyId: user.companyId },
    include: { items: { orderBy: { label: "asc" } }, employee: { include: { employer: true } } },
  });
  if (!form) notFound();
  const employer = form.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);
  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/documents/custody/${form.id}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للاستمارة", "Back to the form")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>
      <CustodySheet form={form} header={header} />
    </div>
  );
}
