import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Printer } from "lucide-react";
import { EmployeeRequestCard } from "@/components/employee-request-card";
import { Flash } from "@/components/flash";
import { ResignationSheet } from "@/components/resignation-sheet";
import { headerFor } from "@/components/salary-docs";
import { ToneBadge, linkAction, secondaryBtn } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { REQUEST_STATUS } from "@/lib/requests";
import { resignationSeal } from "@/lib/resignation-seal";

/** A resignation the employee signed in the portal; management reads it in full and accepts or rejects it here. */
export default async function ResignationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const request = await prisma.employeeRequest.findFirst({
    where: { id, companyId: user.companyId, type: "RESIGNATION" },
    include: {
      employee: { include: { employer: true } },
      letter: { select: { id: true, refNo: true } },
    },
  });
  if (!request) notFound();
  const employer = request.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);
  const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.PENDING;
  const seal = resignationSeal(request);

  return (
    <div className="page-wide">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/approvals#requests" className={linkAction}>
          <ArrowRight size={15} className="ltr:rotate-180" />
          {t("طلبات الموظفين", "Employee requests")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
          {seal ? (
            <ToneBadge tone={seal.intact ? "green" : "red"}>
              {seal.intact ? t("التوقيع سليم ومطابق", "Signature intact") : t("النص لا يطابق ما وُقّع", "Text differs from what was signed")}
            </ToneBadge>
          ) : null}
          {request.letter ? (
            <Link href={`/letters/${request.letter.id}`} className={secondaryBtn}>
              {t(`خطاب القبول ${request.letter.refNo}`, `Acceptance letter ${request.letter.refNo}`)}
            </Link>
          ) : null}
          <Link href={`/approvals/resignation/${request.id}/print`} className={secondaryBtn}>
            <Printer size={16} />
            {t("طباعة / PDF", "Print / PDF")}
          </Link>
        </div>
      </div>
      <Flash error={sp.error} message={sp.message} />
      {request.status === "PENDING" ? (
        <ul className="mb-5">
          <EmployeeRequestCard request={request} user={user} lang={lang} t={t} currency={user.company.currency} returnTo={`/approvals/resignation/${request.id}`} docLink={false} />
        </ul>
      ) : null}
      <div className="min-w-0 overflow-hidden">
        <ResignationSheet request={request} header={header} seal={seal} />
      </div>
    </div>
  );
}
