import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ResignationSheet } from "@/components/resignation-sheet";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { resignationSeal } from "@/lib/resignation-seal";

export default async function ResignationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const request = await prisma.employeeRequest.findFirst({
    where: { id, companyId: user.companyId, type: "RESIGNATION" },
    include: { employee: { include: { employer: true } }, letter: { select: { refNo: true } } },
  });
  if (!request) notFound();
  const employer = request.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);
  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/approvals/resignation/${request.id}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع للاستقالة", "Back to the resignation")}
        </Link>
        <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
      </div>
      <ResignationSheet request={request} header={header} seal={resignationSeal(request)} />
    </div>
  );
}
