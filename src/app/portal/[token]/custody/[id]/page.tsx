import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { CustodySheet } from "@/components/custody-sheet";
import { Flash } from "@/components/flash";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { acknowledgeCustodyForm } from "@/server/custody-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The employee's copy of a receipt or handover form of their originals, with the online acknowledgement. */
export default async function PortalCustodyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [{ token, id }, sp] = await Promise.all([params, searchParams]);
  const { t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const form = await prisma.custodyForm.findFirst({ where: { id, employeeId: employee.id }, include: { items: { orderBy: { label: "asc" } } } });
  if (!form) notFound();
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, employee.company);
  header.logoUrl = await inlineLogo(header.logoUrl, employee.companyId);
  const out = form.direction === "OUT";

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-8 print:px-0 print:py-0">
        <div className="no-print mb-3">
          <Link href={`/portal/${token}#custody`} className="text-sm font-semibold text-teal-800">
            {t("رجوع إلى صفحتي", "Back to my page")}
          </Link>
        </div>
        <div className="no-print">
          <Flash error={sp.error} message={sp.message} />
        </div>
        <div className="no-print mb-4 flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          {form.acknowledgedAt ? (
            <p className="flex items-center gap-2 font-semibold text-emerald-700">
              <CheckCircle2 size={18} />
              {t(`سُجّل إقرارك في ${formatDateTime(form.acknowledgedAt)}`, `Acknowledged on ${formatDateTime(form.acknowledgedAt)}`)}
            </p>
          ) : (
            <form action={acknowledgeCustodyForm} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="id" value={form.id} />
              <p className="text-sm text-slate-600">
                {out
                  ? t("بعد استلام المستندات الأصلية المبيّنة، أقرّ باستلامها:", "Once you have the originals listed, confirm you received them:")
                  : t("راجع المستندات التي سلّمتها للمنشأة، ثم أقرّ بالتسليم:", "Check the documents you handed to the company, then confirm:")}
              </p>
              <SubmitButton pendingLabel={t("جارٍ التسجيل...", "Recording...")}>
                <CheckCircle2 size={16} />
                {out ? t("أقرّ باستلام المستندات", "I confirm receipt") : t("أقرّ بتسليم المستندات", "I confirm the handover")}
              </SubmitButton>
            </form>
          )}
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
        <CustodySheet form={{ ...form, employee }} header={header} />
      </div>
    </div>
  );
}
