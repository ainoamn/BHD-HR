import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PrintButton } from "@/components/print-button";
import { ResignationSheet } from "@/components/resignation-sheet";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { ToneBadge } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { REQUEST_STATUS } from "@/lib/requests";
import { resignationSeal } from "@/lib/resignation-seal";
import { cancelEmployeeRequest } from "@/server/employee-request-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The employee's copy of the resignation they signed in the portal, with the decision once made. */
export default async function PortalResignationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [{ token, id }, sp] = await Promise.all([params, searchParams]);
  const { lang, t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const request = await prisma.employeeRequest.findFirst({ where: { id, employeeId: employee.id, type: "RESIGNATION" }, include: { letter: { select: { refNo: true, token: true, cancelledAt: true } } } });
  if (!request) notFound();
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, employee.company);
  header.logoUrl = await inlineLogo(header.logoUrl, employee.companyId);
  const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.PENDING;

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-8 print:px-0 print:py-0">
        <div className="no-print mb-3">
          <Link href={`/portal/${token}#requests`} className="text-sm font-semibold text-teal-800">
            {t("رجوع إلى صفحتي", "Back to my page")}
          </Link>
        </div>
        <div className="no-print">
          <Flash error={sp.error} message={sp.message} />
        </div>
        <div className="no-print mb-4 flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600">
            <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
            {request.status === "APPROVED" && request.letter && !request.letter.cancelledAt ? (
              <Link href={`/letter/${request.letter.token}`} className="font-bold text-teal-800 underline-offset-4 hover:underline">
                {t(`خطاب قبول الاستقالة ${request.letter.refNo}`, `Acceptance letter ${request.letter.refNo}`)}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {request.status === "PENDING" ? (
              <form action={cancelEmployeeRequest}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="id" value={request.id} />
                <SubmitButton variant="danger" confirm={t("سحب الاستقالة قبل أن تبتّ فيها الإدارة؟", "Withdraw your resignation before management decides?")}>
                  {t("سحب الاستقالة", "Withdraw resignation")}
                </SubmitButton>
              </form>
            ) : null}
            <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
          </div>
        </div>
        <ResignationSheet request={{ ...request, employee }} header={header} seal={resignationSeal(request)} />
      </div>
    </div>
  );
}
