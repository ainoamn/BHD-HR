import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABEL, ASSET_EVENT_LABEL, ASSET_STATUS_LABEL, ASSET_STATUS_TONE } from "@/lib/assets";
import { can, requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, money, toDateInput, todayInputValue } from "@/lib/utils";
import { assignAsset, deleteAsset, returnAsset, saveAsset, setAssetStatus } from "@/server/asset-actions";

export default async function AssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("assets.view");
  const { lang, t } = await getI18n();
  const asset = await prisma.asset.findFirst({
    where: { id, companyId: user.companyId },
    include: { employee: { select: { id: true, fullName: true, nameEn: true, status: true } }, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!asset) notFound();
  const canEdit = can(user, "assets.edit");
  const employees =
    canEdit && asset.status !== "ASSIGNED" && asset.status !== "RETIRED"
      ? await prisma.employee.findMany({ where: { companyId: user.companyId, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, nameEn: true, employeeNumber: true }, orderBy: { fullName: "asc" } })
      : [];
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const currency = user.company.currency;
  const details = [
    { label: t("النوع", "Category"), value: pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category) },
    { label: t("رقم الأصل / اللوحة", "Asset tag / plate"), value: asset.tag, ltr: true },
    { label: t("الرقم التسلسلي", "Serial number"), value: asset.serialNo, ltr: true },
    { label: t("القيمة", "Value"), value: asset.value ? money(asset.value, currency) : null },
    { label: t("تاريخ الشراء", "Purchase date"), value: asset.purchaseDate ? formatDate(asset.purchaseDate) : null },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل العهد", "All assets")}
      </Link>
      <div className="flex animate-fade-up flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900">{asset.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {asset.employee ? (
              <>
                {t("مع", "Held by")}{" "}
                <Link href={`/employees/${asset.employee.id}?tab=hr`} className="font-semibold text-teal-800 hover:underline">
                  {nameOf(asset.employee)}
                </Link>{" "}
                {t(`منذ ${formatDate(asset.assignedAt)}`, `since ${formatDate(asset.assignedAt)}`)}
              </>
            ) : (
              pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category)
            )}
          </p>
        </div>
        <ToneBadge tone={ASSET_STATUS_TONE[asset.status] || "slate"}>{pick(ASSET_STATUS_LABEL[asset.status], lang, asset.status)}</ToneBadge>
      </div>
      <Flash error={sp.error} message={sp.message} />
      {asset.employee?.status === "TERMINATED" ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-100">
          {t("انتهت خدمة الموظف والعهدة ما زالت مسجلة عليه — استلمها وسجّل الاستلام.", "This employee has left and still holds the asset — collect it and record the return.")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle>{t("البيانات", "Details")}</SectionTitle>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {details.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className="mt-0.5 break-words font-medium text-slate-900" dir={item.ltr && item.value ? "ltr" : undefined}>
                    {item.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {asset.notes ? <p className="mt-3 whitespace-pre-line break-words rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{asset.notes}</p> : null}
            {canEdit ? (
              <details className="group mt-4 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer list-none text-sm font-bold text-teal-800">{t("تعديل البيانات", "Edit details")}</summary>
                <form action={saveAsset} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={asset.id} />
                  <Field label={t("الاسم", "Name")}>
                    <input name="name" required maxLength={120} defaultValue={asset.name} className={`${fieldClass} w-full`} />
                  </Field>
                  <Field label={t("النوع", "Category")}>
                    <select name="category" defaultValue={asset.category} className={`${fieldClass} w-full`}>
                      {ASSET_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {pick(ASSET_CATEGORY_LABEL[item], lang, item)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("رقم الأصل / اللوحة", "Asset tag / plate")}>
                    <input name="tag" maxLength={60} dir="ltr" defaultValue={asset.tag || ""} className={`${fieldClass} w-full`} />
                  </Field>
                  <Field label={t("الرقم التسلسلي", "Serial number")}>
                    <input name="serialNo" maxLength={80} dir="ltr" defaultValue={asset.serialNo || ""} className={`${fieldClass} w-full`} />
                  </Field>
                  <Field label={`${t("القيمة", "Value")} (${currency})`}>
                    <input name="value" type="number" step="0.001" min="0" dir="ltr" defaultValue={asset.value ?? ""} className={`${fieldClass} w-full`} />
                  </Field>
                  <Field label={t("تاريخ الشراء", "Purchase date")}>
                    <input name="purchaseDate" type="date" defaultValue={toDateInput(asset.purchaseDate)} className={`${fieldClass} w-full`} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t("ملاحظات", "Notes")}>
                      <textarea name="notes" rows={2} maxLength={500} defaultValue={asset.notes || ""} className={`${fieldClass} w-full`} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <SubmitButton variant="secondary">{t("حفظ", "Save")}</SubmitButton>
                  </div>
                </form>
              </details>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <History size={17} className="text-teal-700" />
                {t("السجل", "History")}
              </span>
            </SectionTitle>
            <ol className="relative space-y-3 border-s border-slate-200 ps-4">
              {asset.events.map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span className="absolute -start-[1.3rem] top-1.5 size-2.5 rounded-full bg-teal-600 ring-4 ring-white" aria-hidden="true" />
                  <p className="text-slate-900">
                    <span className="font-semibold">{pick(ASSET_EVENT_LABEL[event.kind], lang, event.kind)}</span>
                    {event.employeeName ? ` ${event.employeeName}` : ""}
                  </p>
                  {event.note ? <p className="break-words text-slate-600">{event.note}</p> : null}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(event.createdAt)}
                    {event.byName ? ` · ${event.byName}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {canEdit && asset.status === "ASSIGNED" ? (
            <Card>
              <SectionTitle hint={t("عند إعادة الموظف للعهدة أو انتهاء خدمته.", "When the employee gives it back or leaves.")}>{t("تسجيل الاستلام", "Record the return")}</SectionTitle>
              <form action={returnAsset} className="space-y-3">
                <input type="hidden" name="id" value={asset.id} />
                <Field label={t("الحالة عند الاستلام", "Condition on return")}>
                  <input name="note" maxLength={300} className={`${fieldClass} w-full`} placeholder={t("مثال: سليمة مع الشاحن", "e.g. Good, with charger")} />
                </Field>
                <Field label={t("بعد الاستلام", "After return")}>
                  <select name="next" defaultValue="AVAILABLE" className={`${fieldClass} w-full`}>
                    <option value="AVAILABLE">{pick(ASSET_STATUS_LABEL.AVAILABLE, lang)}</option>
                    <option value="MAINTENANCE">{pick(ASSET_STATUS_LABEL.MAINTENANCE, lang)}</option>
                  </select>
                </Field>
                <SubmitButton className="w-full">{t("تم الاستلام", "Returned")}</SubmitButton>
              </form>
            </Card>
          ) : null}
          {canEdit && employees.length ? (
            <Card>
              <SectionTitle>{t("تسليم لموظف", "Hand to an employee")}</SectionTitle>
              <form action={assignAsset} className="space-y-3">
                <input type="hidden" name="id" value={asset.id} />
                <Field label={t("الموظف", "Employee")}>
                  <select name="employeeId" required defaultValue="" className={`${fieldClass} w-full`}>
                    <option value="" disabled>
                      {t("اختر الموظف", "Choose employee")}
                    </option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {nameOf(employee)} — {employee.employeeNumber}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("تاريخ التسليم", "Handover date")}>
                  <input name="date" type="date" defaultValue={todayInputValue()} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("ملاحظة", "Note")}>
                  <input name="note" maxLength={300} className={`${fieldClass} w-full`} />
                </Field>
                <SubmitButton className="w-full">{t("تسليم", "Hand over")}</SubmitButton>
              </form>
            </Card>
          ) : null}
          {canEdit && asset.status !== "ASSIGNED" ? (
            <Card>
              <SectionTitle>{t("تغيير الحالة", "Change status")}</SectionTitle>
              <form action={setAssetStatus} className="space-y-3">
                <input type="hidden" name="id" value={asset.id} />
                <select name="status" defaultValue={asset.status === "AVAILABLE" ? "MAINTENANCE" : "AVAILABLE"} className={`${fieldClass} w-full`} aria-label={t("الحالة", "Status")}>
                  {["AVAILABLE", "MAINTENANCE", "RETIRED"]
                    .filter((item) => item !== asset.status)
                    .map((item) => (
                      <option key={item} value={item}>
                        {pick(ASSET_STATUS_LABEL[item], lang, item)}
                      </option>
                    ))}
                </select>
                <input name="note" maxLength={300} className={`${fieldClass} w-full`} placeholder={t("ملاحظة (اختياري)", "Note (optional)")} aria-label={t("ملاحظة", "Note")} />
                <SubmitButton variant="secondary" className="w-full">
                  {t("تحديث", "Update")}
                </SubmitButton>
              </form>
            </Card>
          ) : null}
          {can(user, "assets.delete") && asset.status !== "ASSIGNED" ? (
            <form action={deleteAsset} className="px-1">
              <input type="hidden" name="id" value={asset.id} />
              <SubmitButton variant="link" confirm={t("حذف العهدة وسجلها نهائياً؟", "Delete this asset and its history for good?")}>
                {t("حذف العهدة", "Delete asset")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
