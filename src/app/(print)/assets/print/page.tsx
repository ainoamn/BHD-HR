import { OfficialDocSheet, type OfficialDocRow } from "@/components/official-doc-sheet";
import { OfficialPrintBar } from "@/components/official-print-bar";
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABEL, ASSET_STATUSES, ASSET_STATUS_LABEL } from "@/lib/assets";
import { requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { readOrient } from "@/lib/official-print";
import { officialPrintSeal } from "@/lib/official-print-seal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { money } from "@/lib/utils";

export default async function AssetsOfficialPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; orient?: string; download?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("assets.view");
  const { lang, t } = await getI18n();
  const orient = readOrient(sp.orient);
  const status = (ASSET_STATUSES as readonly string[]).includes(sp.status || "") ? sp.status! : "";
  const category = (ASSET_CATEGORIES as readonly string[]).includes(sp.category || "") ? sp.category! : "";
  const q = (sp.q || "").trim().slice(0, 80);

  const assets = await prisma.asset.findMany({
    where: {
      companyId: user.companyId,
      ...(status ? { status } : { status: { not: "RETIRED" } }),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { tag: { contains: q, mode: "insensitive" as const } },
              { serialNo: { contains: q, mode: "insensitive" as const } },
              { employee: { fullName: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { employee: { select: { fullName: true, nameEn: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 500,
  });

  const filterParts: string[] = [];
  if (q) filterParts.push(t(`بحث: ${q}`, `Search: ${q}`));
  if (status) filterParts.push(pick(ASSET_STATUS_LABEL[status], lang, status));
  if (category) filterParts.push(pick(ASSET_CATEGORY_LABEL[category], lang, category));
  const subtitle = filterParts.length ? filterParts.join(" · ") : t("كل العهد عدا المستبعدة", "All but retired");

  const live = new URLSearchParams();
  if (q) live.set("q", q);
  if (status) live.set("status", status);
  if (category) live.set("category", category);
  const liveHref = `/assets${live.toString() ? `?${live}` : ""}`;
  const origin = await requestOrigin();
  const { header, printedAt, seal } = await officialPrintSeal(user.company, `${origin}${liveHref}`, user.name);

  const columns = [
    { key: "index", ar: "#", en: "#" },
    { key: "name", ar: "العهدة", en: "Asset" },
    { key: "category", ar: "النوع", en: "Category" },
    { key: "tag", ar: "رقم الأصل", en: "Tag" },
    { key: "status", ar: "الحالة", en: "Status" },
    { key: "held", ar: "مع", en: "Held by" },
    { key: "amount", ar: "القيمة", en: "Value" },
  ];
  const rows: OfficialDocRow[] = assets.map((asset) => ({
    key: asset.id,
    name: asset.name,
    category: pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category),
    tag: asset.tag,
    status: pick(ASSET_STATUS_LABEL[asset.status], lang, asset.status),
    held: asset.employee ? (lang === "en" && asset.employee.nameEn ? asset.employee.nameEn : asset.employee.fullName) : null,
    amount: asset.value ? money(asset.value, user.company.currency) : null,
  }));

  const fileName = `assets-${printedAt.toISOString().slice(0, 10)}.pdf`;

  return (
    <div className={`mx-auto px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0 ${orient === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
      <OfficialPrintBar targetId="official-sheet" fileName={fileName} backHref={liveHref} backLabel={t("رجوع للعهد", "Back to assets")} autoDownload={sp.download === "1"} />
      <OfficialDocSheet
        header={header}
        titleAr="كشف العهد والأصول"
        titleEn="Assets & custody register"
        subtitle={subtitle}
        printedAt={printedAt}
        columns={columns}
        rows={rows}
        seal={seal}
        emptyText={{ ar: "لا توجد عهد في هذه التصفية.", en: "No assets in this filter." }}
        orient={orient}
      />
    </div>
  );
}
