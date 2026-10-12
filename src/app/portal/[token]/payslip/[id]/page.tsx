import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Payslip, SalaryReceipt, headerFor } from "@/components/salary-docs";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** A paid salary of the link's own employee: payslip and receipt, ready to print. */
export default async function PortalPayslipPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const { t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const salary = await prisma.salary.findFirst({
    where: { id, employeeId: employee.id, paid: true },
    include: { employer: true, lines: { orderBy: { title: "asc" } } },
  });
  if (!salary) notFound();
  const header = headerFor(salary, employee.company);
  header.logoUrl = await inlineLogo(header.logoUrl, employee.companyId);

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
        <style>{`@page { size: A4; margin: 12mm; } .slip-break { break-before: page; }`}</style>
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/portal/${token}#payslips`} className="text-sm font-semibold text-teal-800">
            {t("رجوع إلى صفحتي", "Back to my page")}
          </Link>
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
        <Payslip header={header} salary={salary} currency={employee.company.currency} />
        <div className="slip-break mt-8 print:mt-0">
          <SalaryReceipt header={header} salary={salary} currency={employee.company.currency} />
        </div>
      </div>
    </div>
  );
}
