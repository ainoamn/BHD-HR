import Link from "next/link";
import { ChevronDown, LaptopMinimal, PackageCheck, Plus, UserRound, Wrench } from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, PageHeader, Stat, ToneBadge, fieldClass, secondaryBtn } from "@/components/ui";
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABEL, ASSET_STATUSES, ASSET_STATUS_LABEL, ASSET_STATUS_TONE } from "@/lib/assets";
import { can, requirePermission } from "@/lib/auth";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, money, round3 } from "@/lib/utils";
import { saveAsset } from "@/server/asset-actions";

const COLUMNS = ["name", "status", "held", "value"];

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string; sort?: string; dir?: string; fname?: string; fstatus?: string; fheld?: string; fvalue?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("assets.view");
  const { lang, t } = await getI18n();
  const status = (ASSET_STATUSES as readonly string[]).includes(sp.status || "") ? sp.status! : "";
  const category = (ASSET_CATEGORIES as readonly string[]).includes(sp.category || "") ? sp.category! : "";
  const q = (sp.q || "").trim().slice(0, 80);
  const [grouped, assets, employees] = await Promise.all([
    prisma.asset.groupBy({ by: ["status"], where: { companyId: user.companyId }, _count: true, _sum: { value: true } }),
    prisma.asset.findMany({
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
      include: { employee: { select: { id: true, fullName: true, nameEn: true, status: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 300,
    }),
    can(user, "assets.create")
      ? prisma.employee.findMany({ where: { companyId: user.companyId, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, nameEn: true, employeeNumber: true }, orderBy: { fullName: "asc" } })
      : [],
  ]);
  const count = (key: string) => grouped.find((item) => item.status === key)?._count || 0;
  const totalValue = round3(grouped.filter((item) => item.status !== "RETIRED").reduce((sum, item) => sum + (item._sum.value || 0), 0));
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const locale = lang === "en" ? "en" : "ar";
  const rows = assets
    .map((asset) => ({
      asset,
      statusLabel: pick(ASSET_STATUS_LABEL[asset.status], lang, asset.status),
      heldName: asset.employee ? nameOf(asset.employee) : "",
      assetText: `${asset.name} ${pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category)} ${asset.tag || ""}`,
    }))
    .filter(
      (row) =>
        includesText(row.assetText, sp.fname) &&
        includesText(row.statusLabel, sp.fstatus) &&
        includesText(row.heldName, sp.fheld) &&
        includesText(row.asset.value ? `${row.asset.value} ${money(row.asset.value, user.company.currency)}` : "", sp.fvalue),
    );
  const { sort, dir } = readSort(sp, COLUMNS, "name");
  rows.sort((a, b) => {
    if (!sp.sort) return 0; // keep the database order (status, then name)
    if (sort === "status") return compareText(a.statusLabel, b.statusLabel, dir, locale);
    if (sort === "held") return compareText(a.heldName, b.heldName, dir, locale);
    if (sort === "value") return compareNumber(a.asset.value || 0, b.asset.value || 0, dir);
    return compareText(a.asset.name, b.asset.name, dir, locale);
  });

  return (
    <div className="page-wide">
      <PageHeader
        icon={LaptopMinimal}
        title={t("العُهد والأصول", "Assets & custody")}
        description={t(
          "أجهزة ومركبات وبطاقات الشركة، ومن يحملها الآن.",
          "Company devices, vehicles and cards, and who holds them now.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat icon={UserRound} tone="navy" label={t("بعهدة موظفين", "With employees")} value={String(count("ASSIGNED"))} />
        <Stat icon={PackageCheck} label={t("متاحة", "Available")} value={String(count("AVAILABLE"))} />
        <Stat icon={Wrench} tone="gold" label={t("في الصيانة", "In maintenance")} value={String(count("MAINTENANCE"))} />
        <Stat icon={LaptopMinimal} label={t("القيمة المسجلة", "Recorded value")} value={money(totalValue, user.company.currency)} />
      </div>

      {can(user, "assets.create") ? (
        <details className="group mb-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-3 font-bold text-slate-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={18} />
              </span>
              {t("إضافة عهدة", "Add an asset")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <form action={saveAsset} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:grid-cols-2 sm:px-5">
            <Field label={t("الاسم", "Name")}>
              <input name="name" required maxLength={120} className={`${fieldClass} w-full`} placeholder={t("مثال: حاسوب Dell Latitude 5440", "e.g. Dell Latitude 5440 laptop")} />
            </Field>
            <Field label={t("النوع", "Category")}>
              <select name="category" defaultValue="LAPTOP" className={`${fieldClass} w-full`}>
                {ASSET_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {pick(ASSET_CATEGORY_LABEL[item], lang, item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("رقم الأصل / اللوحة", "Asset tag / plate")}>
              <input name="tag" maxLength={60} dir="ltr" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("الرقم التسلسلي", "Serial number")}>
              <input name="serialNo" maxLength={80} dir="ltr" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={`${t("القيمة", "Value")} (${user.company.currency})`}>
              <input name="value" type="number" step="0.001" min="0" inputMode="decimal" dir="ltr" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("تاريخ الشراء", "Purchase date")}>
              <input name="purchaseDate" type="date" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("تسليمها الآن إلى (اختياري)", "Hand it now to (optional)")}>
              <select name="employeeId" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">{t("— تبقى متاحة —", "— keep available —")}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {nameOf(employee)} — {employee.employeeNumber}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("ملاحظات", "Notes")}>
              <input name="notes" maxLength={500} className={`${fieldClass} w-full`} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton className="w-full sm:w-auto">{t("حفظ العهدة", "Save asset")}</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      <Card>
        <GetForm className="mb-4 grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <label className="col-span-2 min-w-0 flex-1 space-y-1.5 text-xs font-medium text-slate-500 sm:min-w-48">
            {t("بحث", "Search")}
            <input name="q" defaultValue={q} className={`${fieldClass} block w-full`} placeholder={t("الاسم، الرقم، أو الموظف", "Name, tag or employee")} />
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الحالة", "Status")}
            <select name="status" defaultValue={status} className={`${fieldClass} block w-full sm:w-40`}>
              <option value="">{t("الكل عدا المستبعدة", "All but retired")}</option>
              {ASSET_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {pick(ASSET_STATUS_LABEL[item], lang, item)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("النوع", "Category")}
            <select name="category" defaultValue={category} className={`${fieldClass} block w-full sm:w-40`}>
              <option value="">{t("الكل", "All")}</option>
              {ASSET_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {pick(ASSET_CATEGORY_LABEL[item], lang, item)}
                </option>
              ))}
            </select>
          </label>
          {columnHiddenFields(sp, COLUMNS).map((field) => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <button type="submit" className={`${secondaryBtn} col-span-2`}>
            {t("عرض", "Show")}
          </button>
        </GetForm>

        {assets.length === 0 ? (
          <EmptyState icon={LaptopMinimal} title={t("لا توجد عهد", "No assets")} text={t("أضف أجهزة الشركة وسلّمها للموظفين ليبقى سجل العهد واضحاً.", "Add company equipment and hand it to employees to keep a clear custody record.")} />
        ) : (
          <div className="table-shell">
            <table className="table-stack table-tools w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <ColumnHead column="name" label={t("العهدة", "Asset")} />
                  <ColumnHead column="status" label={t("الحالة", "Status")} />
                  <ColumnHead column="held" label={t("مع", "Held by")} />
                  <ColumnHead column="value" label={t("القيمة", "Value")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ asset }) => (
                  <tr key={asset.id}>
                    <td className="cell-title px-3 py-2.5" data-label={t("العهدة", "Asset")}>
                      <Link href={`/assets/${asset.id}`} className="font-semibold text-slate-900 hover:text-teal-700">
                        {asset.name}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category)}
                        {asset.tag ? (
                          <>
                            {" · "}
                            <span dir="ltr">{asset.tag}</span>
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الحالة", "Status")}>
                      <ToneBadge tone={ASSET_STATUS_TONE[asset.status] || "slate"}>{pick(ASSET_STATUS_LABEL[asset.status], lang, asset.status)}</ToneBadge>
                    </td>
                    <td className="px-3 py-2.5" data-label={t("مع", "Held by")}>
                      {asset.employee ? (
                        <>
                          <Link href={`/employees/${asset.employee.id}?tab=hr`} className={asset.employee.status === "TERMINATED" ? "font-semibold text-red-700 hover:underline" : "text-slate-800 hover:text-teal-700"}>
                            {nameOf(asset.employee)}
                          </Link>
                          <span className="block text-xs text-slate-500">
                            {asset.employee.status === "TERMINATED" ? t("انتهت خدمته — استلم العهدة", "Has left — collect it") : t(`منذ ${formatDate(asset.assignedAt)}`, `since ${formatDate(asset.assignedAt)}`)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tabular px-3 py-2.5 text-slate-700" data-label={t("القيمة", "Value")}>
                      {asset.value ? money(asset.value, user.company.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{t("لا توجد عهد تطابق البحث.", "No assets match the filters.")}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
