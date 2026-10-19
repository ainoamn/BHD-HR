import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND } from "@/lib/constants";
import { readContactKind } from "@/lib/contacts";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

export default async function EmployersOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; view?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employers.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const q = (sp.q || "").trim().slice(0, 100);
  const rawKind = readContactKind(sp.kind);
  const kind = rawKind === "COMPANY" || rawKind === "PERSON" ? rawKind : "";

  const employers = await prisma.employer.findMany({
    where: {
      companyId: user.companyId,
      ...(kind ? { kind } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nameEn: { contains: q, mode: "insensitive" } },
              { idNumber: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { employees: { select: { status: true } } },
    orderBy: { name: "asc" },
  });

  const filterParts: string[] = [];
  if (q) filterParts.push(t(`بحث: ${q}`, `Search: ${q}`));
  if (kind) filterParts.push(pick(EMPLOYER_KIND[kind], lang, kind));
  const subtitle = filterParts.length ? filterParts.join(" · ") : t("كل الكفلاء", "All sponsors");

  const live = new URLSearchParams();
  if (kind) live.set("kind", kind);
  if (q) live.set("q", q);
  const liveHref = `/employers${live.toString() ? `?${live}` : ""}`;
  const origin = await requestOrigin();
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${liveHref}`, user.name);

  const columns = [
    { key: "index", ar: "#", en: "#" },
    { key: "name", ar: "الكفيل", en: "Sponsor" },
    { key: "kind", ar: "النوع", en: "Type" },
    { key: "idNumber", ar: "السجل / المدني", en: "CR / ID" },
    { key: "phone", ar: "الهاتف", en: "Phone" },
    { key: "email", ar: "البريد", en: "Email" },
    { key: "staff", ar: "الموظفون", en: "Staff" },
  ];
  const rows: OfficialDocRow[] = employers.map((employer) => {
    const active = employer.employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION").length;
    return {
      key: employer.id,
      name: lang === "en" && employer.nameEn ? employer.nameEn : employer.name,
      kind: pick(EMPLOYER_KIND[employer.kind], lang, employer.kind),
      idNumber: employer.idNumber,
      phone: formatPhone(employer.phone) || employer.phone,
      email: employer.email,
      staff: employer.employees.length > active ? `${active} / ${employer.employees.length}` : String(active),
    };
  });

  const fileName = `employers-${printedAt.toISOString().slice(0, 10)}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={liveHref} backLabel={t("رجوع للكفلاء", "Back to sponsors")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="كشف الكفلاء"
        titleEn="Sponsors register"
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا يوجد كفلاء في هذه التصفية.", en: "No sponsors in this filter." }}
        orient={orient}
      />
    </div>
  );
}
