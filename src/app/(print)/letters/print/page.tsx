import type { Prisma } from "@prisma/client";
import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { LETTER_KIND, WARNING_KINDS, isLetterKind, letterState, type LetterKind } from "@/lib/letters";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";

export default async function LettersOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; employeeId?: string; state?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("letters.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const kind = sp.kind === "warnings" ? "warnings" : isLetterKind(sp.kind || "") ? sp.kind! : "";
  const state = ["unconfirmed", "pending", "cancelled"].includes(sp.state || "") ? sp.state! : "";
  const q = (sp.q || "").trim().slice(0, 100);

  const where: Prisma.LetterWhereInput = { companyId: user.companyId };
  const and: Prisma.LetterWhereInput[] = [];
  if (kind === "warnings") and.push({ kind: { in: WARNING_KINDS } });
  else if (kind) and.push({ kind });
  if (sp.employeeId) and.push({ employeeId: sp.employeeId });
  if (q) and.push({ OR: [{ refNo: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { employee: { fullName: { contains: q, mode: "insensitive" } } }] });
  if (state === "unconfirmed") and.push({ acknowledgedAt: null, cancelledAt: null });
  if (state === "pending") and.push({ cancelledAt: null, deliveries: { some: { status: "PENDING" } } });
  if (state === "cancelled") and.push({ cancelledAt: { not: null } });
  if (and.length) where.AND = and;

  const letters = await prisma.letter.findMany({
    where,
    include: { employee: { select: { fullName: true, nameEn: true, employeeNumber: true } }, deliveries: { select: { status: true } } },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const filterParts: string[] = [];
  if (q) filterParts.push(t(`بحث: ${q}`, `Search: ${q}`));
  if (kind === "warnings") filterParts.push(t("كل الإنذارات", "All warnings"));
  else if (kind) filterParts.push(pick(LETTER_KIND[kind as LetterKind].label, lang));
  if (state === "unconfirmed") filterParts.push(t("لم يؤكَّد استلامها", "Not confirmed"));
  if (state === "pending") filterParts.push(t("نسخ بانتظار الإرسال", "Copies waiting"));
  if (state === "cancelled") filterParts.push(t("الملغاة", "Cancelled"));
  if (sp.employeeId && letters[0]) {
    const employee = letters[0].employee;
    filterParts.push(lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  }
  const subtitle = filterParts.length ? filterParts.join(" · ") : t("كل الخطابات", "All letters");

  const live = new URLSearchParams();
  if (kind) live.set("kind", kind);
  if (sp.employeeId) live.set("employeeId", sp.employeeId);
  if (q) live.set("q", q);
  if (state) live.set("state", state);
  const liveHref = `/letters${live.toString() ? `?${live}` : ""}`;
  const origin = await requestOrigin();
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${liveHref}`, user.name);

  const columns = [
    { key: "index", ar: "#", en: "#" },
    { key: "ref", ar: "الرقم المرجعي", en: "Reference" },
    { key: "kind", ar: "النوع", en: "Type" },
    { key: "subject", ar: "الموضوع", en: "Subject" },
    { key: "employee", ar: "الموظف", en: "Employee" },
    { key: "date", ar: "التاريخ", en: "Date" },
    { key: "status", ar: "الحالة", en: "Status" },
  ];
  const rows: OfficialDocRow[] = letters.map((letter) => ({
    key: letter.id,
    ref: letter.refNo,
    kind: pick((LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL).label, lang),
    subject: letter.subject,
    employee: lang === "en" && letter.employee.nameEn ? letter.employee.nameEn : letter.employee.fullName,
    date: formatDate(letter.issuedAt),
    status: pick(letterState(letter).label, lang),
  }));

  const fileName = `letters-${printedAt.toISOString().slice(0, 10)}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={liveHref} backLabel={t("رجوع للخطابات", "Back to letters")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="سجل الإنذارات والخطابات"
        titleEn="Warnings & letters register"
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا توجد خطابات في هذه التصفية.", en: "No letters in this filter." }}
        orient={orient}
      />
    </div>
  );
}
