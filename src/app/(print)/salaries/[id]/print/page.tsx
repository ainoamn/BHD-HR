import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Payslip, SalaryReceipt, headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export default async function SalaryPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { t } = await getI18n();
  const salary = await prisma.salary.findFirst({
    where: { id, employee: { companyId: user.companyId } },
    include: { employer: true },
  });
  if (!salary) notFound();

  const requested = sp.doc === "slip" || sp.doc === "receipt" || sp.doc === "both" ? sp.doc : salary.paid ? "receipt" : "slip";
  const doc = !salary.paid && requested !== "slip" ? "slip" : requested;
  const header = headerFor(salary, user.company);
  const currency = user.company.currency;
  const tabs = [
    { key: "slip", label: "قسيمة الراتب / Payslip", enabled: true },
    { key: "receipt", label: "إيصال / Receipt", enabled: salary.paid },
    { key: "both", label: "الاثنين / Both", enabled: salary.paid },
  ];

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } .slip-break { break-before: page; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/salaries/${salary.id}`} className="text-sm font-semibold text-teal-800">
          {t("رجوع لتفاصيل الراتب", "Back to salary details")}
        </Link>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) =>
            tab.enabled ? (
              <Link
                key={tab.key}
                href={`/salaries/${salary.id}/print?doc=${tab.key}`}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  doc === tab.key ? "border-teal-800 bg-teal-800 text-white" : "border-slate-300 bg-white text-slate-700",
                )}
              >
                {tab.label}
              </Link>
            ) : null,
          )}
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
      </div>
      {!salary.paid ? (
        <p className="no-print mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("الراتب غير مصروف بعد، لذلك تتوفر قسيمة الراتب فقط. الإيصال يظهر بعد الصرف.", "Salary not paid yet, so only the payslip is available. The receipt appears after payment.")}
        </p>
      ) : null}
      {doc === "slip" || doc === "both" ? <Payslip header={header} salary={salary} currency={currency} /> : null}
      {doc === "receipt" || doc === "both" ? (
        <div className={doc === "both" ? "slip-break mt-8 print:mt-0" : ""}>
          <SalaryReceipt header={header} salary={salary} currency={currency} />
        </div>
      ) : null}
    </div>
  );
}
