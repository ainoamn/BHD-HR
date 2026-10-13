import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Printer } from "lucide-react";
import { CustodySheet } from "@/components/custody-sheet";
import { Flash } from "@/components/flash";
import { headerFor } from "@/components/salary-docs";
import { ToneBadge, linkAction, secondaryBtn } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { CUSTODY_DIRECTION } from "@/lib/custody";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function CustodyFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requirePermission("documents.view");
  const { lang, t } = await getI18n();
  const form = await prisma.custodyForm.findFirst({
    where: { id, companyId: user.companyId },
    include: { items: { orderBy: { label: "asc" } }, employee: { include: { employer: true } }, request: { select: { id: true } } },
  });
  if (!form) notFound();
  const employer = form.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);

  return (
    <div className="page-wide">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/documents/custody?employee=${form.employeeId}`} className={linkAction}>
          <ArrowRight size={15} className="ltr:rotate-180" />
          {t("عهدة الموظف", "Employee's custody")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {form.acknowledgedAt ? (
            <ToneBadge tone="green">{t(`أقرّ الموظف ${formatDateTime(form.acknowledgedAt)}`, `Acknowledged ${formatDateTime(form.acknowledgedAt)}`)}</ToneBadge>
          ) : (
            <ToneBadge tone="amber">{t("بانتظار إقرار الموظف من بوابته", "Awaiting acknowledgement in the portal")}</ToneBadge>
          )}
          <Link href={`/documents/custody/${form.id}/print`} className={secondaryBtn}>
            <Printer size={16} />
            {t("طباعة / PDF", "Print / PDF")}
          </Link>
        </div>
      </div>
      <Flash error={sp.error} message={sp.message} />
      <p className="mb-4 text-sm text-slate-500">
        {pick(CUSTODY_DIRECTION[form.direction]?.short, lang, form.direction)}
        {form.request ? ` · ${t("بناءً على طلب الموظف من البوابة", "at the employee's portal request")}` : ""}
        {form.createdByName ? ` · ${t(`سجّلها ${form.createdByName}`, `recorded by ${form.createdByName}`)}` : ""}
      </p>
      <div className="min-w-0 overflow-hidden">
        <CustodySheet form={form} header={header} />
      </div>
    </div>
  );
}
