import { notFound } from "next/navigation";
import { CustodySheet } from "@/components/custody-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { qrSvg } from "@/lib/badge";
import { getI18n } from "@/lib/lang";
import { inlineLogo } from "@/lib/inline-logo";
import { readOrient } from "@/lib/official-print";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

export default async function CustodyPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orient?: string; download?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("documents.view");
  const { t } = await getI18n();
  const orient = readOrient(sp.orient);
  const form = await prisma.custodyForm.findFirst({
    where: { id, companyId: user.companyId },
    include: { items: { orderBy: { label: "asc" } }, employee: { include: { employer: true } } },
  });
  if (!form) notFound();
  const employer = form.employee.employer;
  const header = headerFor({ employerName: employer?.name, employerNameEn: employer?.nameEn, employer }, user.company);
  const logo = (await inlineLogo(header.logoUrl || user.company.logoUrl, user.companyId)) || header.logoUrl || user.company.logoUrl;
  if (logo) header.logoUrl = logo;
  const origin = await requestOrigin();
  const backHref = `/documents/custody/${form.id}`;
  const pageUrl = `${origin}${backHref}`;
  const qr = await qrSvg(pageUrl, logo);
  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar
        targetId="official-sheet"
        fileName={`custody-${form.refNo}.pdf`}
        backHref={backHref}
        backLabel={t("رجوع للاستمارة", "Back to the form")}
        autoDownload={sp.download === "1"}
      />
      <CustodySheet
        id="official-sheet"
        orient={orient}
        form={form}
        header={header}
        seal={{
          qr,
          url: pageUrl,
          signedBy: form.createdByName || user.name,
          signedAt: form.createdAt,
          serial: form.refNo,
        }}
      />
    </div>
  );
}
