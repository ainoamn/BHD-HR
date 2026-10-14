import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { PrintButton } from "@/components/print-button";
import type { PassportStickerData } from "@/lib/passport-sticker";
import { cn, formatDate } from "@/lib/utils";

const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;
/** Fits inside a passport's back cover (ICAO booklet 88 × 125 mm) with about 3 mm to spare on each side. */
const sticker = "relative flex h-[118mm] w-[82mm] shrink-0 break-inside-avoid flex-col overflow-hidden rounded-[3mm] border border-dashed border-slate-300 bg-surface text-slate-900";
const PER_A4 = 4;

export function PassportSticker({ data, printedAt, className }: { data: PassportStickerData; printedAt: Date; className?: string }) {
  const facts = [
    { ar: "الرقم", en: "No.", value: data.number, ltr: true },
    data.nationality ? { ar: "الجنسية", en: "Nationality", value: `${data.nationality.ar} · ${data.nationality.en}` } : null,
    data.dateOfBirth ? { ar: "الميلاد", en: "Born", value: formatDate(data.dateOfBirth), ltr: true } : null,
  ].filter((item): item is { ar: string; en: string; value: string; ltr?: boolean } => Boolean(item));
  return (
    <article dir="rtl" className={cn(sticker, className)} style={exact} aria-label={`ملصق جواز ${data.name}`}>
      <header className="relative flex h-[17mm] shrink-0 items-center gap-[2.5mm] overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 px-[3.5mm] text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-[5mm] -start-[3mm] h-[20mm] w-[40mm] bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        {data.logo ? (
          <img src={data.logo} alt="" className="relative size-[11mm] shrink-0 rounded-[1.5mm] bg-white object-contain p-[0.6mm]" />
        ) : (
          <span className="relative flex size-[11mm] shrink-0 items-center justify-center rounded-[1.5mm] bg-white/10 ring-1 ring-white/20">
            <Building2 className="size-[6mm]" />
          </span>
        )}
        <div className="relative min-w-0 flex-1 leading-tight">
          <p className="line-clamp-2 text-[8.5pt] font-bold">{data.issuer}</p>
          {data.issuerEn ? (
            <p className="truncate text-[6.3pt] text-white/75" dir="ltr">
              {data.issuerEn}
            </p>
          ) : null}
        </div>
      </header>
      <p className="flex shrink-0 items-center justify-between gap-[2mm] bg-teal-50 px-[3.5mm] py-[0.8mm] text-[6pt] font-bold text-teal-800">
        <span>بيانات العامل ومستنداته</span>
        <span dir="ltr">Worker details &amp; documents</span>
      </p>

      <div className="flex shrink-0 gap-[3mm] px-[3.5mm] pt-[2.5mm]">
        <EmployeeAvatar name={data.name} photo={data.photo} eager className="h-[28mm] w-[22.4mm] rounded-[2mm] bg-teal-700 text-[22pt] text-white ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="line-clamp-2 break-words text-[9.5pt] font-bold">{data.name}</p>
          {data.nameEn ? (
            <p className="line-clamp-2 break-words text-[7pt] font-semibold text-slate-600" dir="ltr">
              {data.nameEn}
            </p>
          ) : null}
          {data.job ? <p className="mt-[0.5mm] line-clamp-2 text-[6.6pt] font-semibold text-teal-700">{data.job}</p> : null}
          <dl className="mt-[1.2mm] space-y-[0.6mm] text-[6.2pt] leading-tight">
            {facts.map((fact) => (
              <div key={fact.en} className="min-w-0">
                <dt className="text-[5.4pt] text-slate-500">
                  <span>{fact.ar}</span>{" "}
                  <span dir="ltr" className="inline-block">
                    {fact.en}
                  </span>
                </dt>
                <dd className="tabular truncate font-bold">
                  <bdi dir={fact.ltr ? "ltr" : "auto"}>{fact.value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-[3.5mm] mt-[2.5mm] min-h-0 shrink overflow-hidden rounded-[1.5mm] ring-1 ring-inset ring-slate-200">
        <table className="w-full table-fixed text-[6.2pt] leading-tight">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[33%]" />
            <col className="w-[27%]" />
          </colgroup>
          <thead className="bg-slate-100 text-[5.6pt] text-slate-600">
            <tr>
              <th className="px-[1.5mm] py-[0.9mm] text-start font-bold">
                المستند <span dir="ltr">Document</span>
              </th>
              <th className="px-[1.5mm] py-[0.9mm] text-start font-bold">
                الرقم <span dir="ltr">No.</span>
              </th>
              <th className="px-[1.5mm] py-[0.9mm] text-start font-bold">
                الانتهاء <span dir="ltr">Expiry</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.length ? (
              data.rows.map((row) => (
                <tr key={row.label.en}>
                  <td className="truncate px-[1.5mm] py-[0.7mm] align-top">
                    <span className="font-bold">{row.label.ar}</span>{" "}
                    <span className="text-[5pt] text-slate-500" dir="ltr">
                      {row.label.en}
                    </span>
                  </td>
                  <td className="tabular truncate px-[1.5mm] py-[0.7mm] align-top font-semibold" dir="ltr">
                    {row.number || "—"}
                  </td>
                  <td
                    className={cn(
                      "tabular px-[1.5mm] py-[0.7mm] align-top font-semibold",
                      row.tone === "red" ? "font-bold text-red-700" : row.tone === "amber" ? "font-bold text-amber-800" : "",
                    )}
                  >
                    <span className="block" dir="ltr">
                      {row.expiry ? formatDate(row.expiry) : "—"}
                    </span>
                    {row.tone ? (
                      <span className="block text-[4.8pt] leading-none">
                        {row.tone === "red" ? "منتهٍ" : "قريباً"} <span dir="ltr">{row.tone === "red" ? "Expired" : "Soon"}</span>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-[1.5mm] py-[2mm] text-center text-slate-500">
                  لا توجد مستندات مسجّلة · <span dir="ltr">No documents on file</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-auto flex shrink-0 items-end gap-[2.5mm] border-t border-slate-200 px-[3.5mm] pb-[2.8mm] pt-[1.8mm]">
        <div className="size-[15mm] shrink-0 rounded-[1mm] bg-white p-[0.5mm] ring-1 ring-slate-200 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: data.qr }} />
        <div className="min-w-0 flex-1 space-y-[0.6mm] text-[5.6pt] leading-snug text-slate-600">
          <p className="font-bold text-slate-800">
            إن وُجد هذا الجواز يُرجى تسليمه إلى {data.issuer}
            {data.phone ? (
              <>
                {" — "}
                <span className="tabular inline-block whitespace-nowrap" dir="ltr">
                  {data.phone}
                </span>
              </>
            ) : null}
          </p>
          <p dir="ltr" className="text-start">
            If found, please return this passport to {data.issuerEn || data.issuer}
            {data.phone ? (
              <>
                , tel. <span className="tabular inline-block whitespace-nowrap">{data.phone}</span>
              </>
            ) : null}
          </p>
          <p className="text-[5.2pt] text-slate-500">
            امسح الرمز للتحقق · طُبع في{" "}
            <span className="tabular" dir="ltr">
              {formatDate(printedAt)}
            </span>
          </p>
        </div>
      </footer>
    </article>
  );
}

const chip = "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition";

/** Back link, print button, A4 / label-printer choice and the printing notes; `href(layout)` keeps the page's other query. */
export function PassportStickerToolbar({
  back,
  backLabel,
  href,
  label,
  count,
  t,
}: {
  back: string;
  backLabel: string;
  href: (layout: "a4" | "label") => string;
  label: boolean;
  count: number;
  t: (ar: string, en: string) => string;
}) {
  return (
    <div className="no-print mb-4 space-y-3">
      <style>{label ? "@page { size: 82mm 118mm; margin: 0; }" : "@page { size: A4; margin: 12mm; }"}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={back} className="text-sm font-semibold text-teal-800">
          {backLabel}
        </Link>
        <PrintButton label={count > 1 ? t(`طباعة ${count} ملصقات`, `Print ${count} stickers`) : t("طباعة الملصق", "Print sticker")} />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-slate-200">
        {[
          { value: "a4" as const, text: t("ورقة A4 (4 ملصقات في الصفحة)", "A4 sheet (4 stickers a page)") },
          { value: "label" as const, text: t("طابعة ملصقات (82 × 118 مم)", "Label printer (82 × 118 mm)") },
        ].map((option) => (
          <Link
            key={option.value}
            href={href(option.value)}
            replace
            className={cn(chip, (option.value === "label") === label ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")}
          >
            {option.text}
          </Link>
        ))}
      </div>
      <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
        {t(
          "مقاس الملصق 82 × 118 مم، يدخل في الغلاف الخلفي من الداخل لجواز السفر القياسي (88 × 125 مم) بهامش 3 مم تقريباً. اطبع بمقياس 100% («الحجم الفعلي») على ورق لاصق ثم قصّ على الخط المنقّط، أو اختر «طابعة ملصقات» لتُطبع كل ملصق في صفحة بمقاسه. التواريخ المنتهية بالأحمر والقريبة من الانتهاء بالبرتقالي حسب حدود التنبيه في الإعدادات؛ أعد الطباعة بعد كل تجديد.",
          "The sticker is 82 × 118 mm and fits inside the back cover of a standard passport (88 × 125 mm) with about 3 mm to spare. Print at 100% (“Actual size”) on adhesive paper and cut along the dotted line, or choose “Label printer” to print each sticker on a page of its own size. Expired dates show in red and those expiring soon in orange, by the alert limits in Settings; reprint after every renewal.",
        )}
      </p>
    </div>
  );
}

/**
 * Screen: the stickers side by side. Print: four per A4 page (cut along the dashed line), or with `label` one per
 * page sized to the sticker for label printers.
 */
export function PassportStickerSheet({ stickers, label, printedAt }: { stickers: PassportStickerData[]; label: boolean; printedAt: Date }) {
  if (label) {
    return (
      <div className="flex flex-wrap justify-center gap-6 print:block">
        {stickers.map((data, index) => (
          <PassportSticker
            key={data.id}
            data={data}
            printedAt={printedAt}
            className={cn("print:rounded-none print:border-0", index < stickers.length - 1 && "print:break-after-page")}
          />
        ))}
      </div>
    );
  }
  const pages = Array.from({ length: Math.ceil(stickers.length / PER_A4) }, (_, index) => stickers.slice(index * PER_A4, (index + 1) * PER_A4));
  return (
    <div className="space-y-6 print:space-y-0">
      {pages.map((page, index) => (
        <div
          key={page[0].id}
          className={cn("flex flex-wrap justify-center gap-6 print:grid print:grid-cols-[82mm_82mm] print:justify-center print:gap-x-[8mm] print:gap-y-[6mm]", index > 0 && "print:break-before-page")}
        >
          {page.map((data) => (
            <PassportSticker key={data.id} data={data} printedAt={printedAt} />
          ))}
        </div>
      ))}
    </div>
  );
}
