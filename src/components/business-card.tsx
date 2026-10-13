import { Building2, Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export type BusinessCardData = {
  name: string;
  nameEn: string | null;
  title: string | null;
  titleEn: string | null;
  department: string | null;
  phone: string | null;
  officePhone: string | null;
  email: string | null;
  address: string | null;
  issuer: string;
  issuerEn: string | null;
  logo: string | null;
  qr: string;
};

const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;
/** Gulf standard business card, 90 × 50 mm. */
const card = "relative h-[50mm] w-[90mm] shrink-0 overflow-hidden rounded-[2.5mm] border border-dashed border-slate-300 text-slate-900";

export function BusinessCardFront({ data, className }: { data: BusinessCardData; className?: string }) {
  const contacts = [
    data.phone ? { Icon: Smartphone, value: data.phone } : null,
    data.officePhone && data.officePhone !== data.phone ? { Icon: Phone, value: data.officePhone } : null,
    data.email ? { Icon: Mail, value: data.email } : null,
  ].filter((item): item is { Icon: typeof Phone; value: string } => Boolean(item));
  return (
    <article dir="rtl" className={cn(card, "bg-surface", className)} style={exact}>
      <div className="absolute inset-y-0 end-0 w-[2.2mm] bg-gradient-to-b from-ink-900 to-teal-700" aria-hidden="true" />
      <div className="flex h-full flex-col justify-between py-[3.8mm] pe-[6mm] ps-[4.5mm]">
        <div className="flex items-center gap-[2mm]">
          {data.logo ? <img src={data.logo} alt="" className="size-[8mm] shrink-0 object-contain" /> : <Building2 className="size-[6mm] shrink-0 text-teal-700" />}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[6.8pt] font-bold text-slate-900">{data.issuer}</p>
            {data.issuerEn ? (
              <p className="truncate text-[5.6pt] text-slate-500" dir="ltr">
                {data.issuerEn}
              </p>
            ) : null}
          </div>
        </div>
        <div className="leading-tight">
          <p className="truncate text-[11pt] font-bold text-slate-900">{data.name}</p>
          {data.nameEn ? (
            <p className="truncate text-[7.2pt] font-semibold text-slate-600" dir="ltr">
              {data.nameEn}
            </p>
          ) : null}
          {data.title || data.titleEn ? (
            <p className="mt-[1mm] truncate text-[6.6pt] font-semibold text-teal-700">
              {[data.title, data.titleEn].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <div className="mt-[1.4mm] h-[0.35mm] w-[12mm] rounded-full bg-emerald-500" aria-hidden="true" />
        </div>
        <ul className="space-y-[0.7mm] text-[6.3pt] text-slate-700">
          {contacts.map(({ Icon, value }) => (
            <li key={value} className="flex items-center gap-[1.4mm]">
              <Icon className="size-[2.6mm] shrink-0 text-teal-700" />
              <span className="tabular truncate" dir="ltr">
                {value}
              </span>
            </li>
          ))}
          {data.address ? (
            <li className="flex items-center gap-[1.4mm]">
              <MapPin className="size-[2.6mm] shrink-0 text-teal-700" />
              <span className="truncate">{data.address}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

export function BusinessCardBack({ data, className }: { data: BusinessCardData; className?: string }) {
  return (
    <article dir="rtl" className={cn(card, "bg-gradient-to-l from-ink-900 to-teal-800 text-white", className)} style={exact}>
      <div className="higher-horizon pointer-events-none absolute -bottom-[6mm] -start-[4mm] h-[30mm] w-[60mm] bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
      <div className="relative flex h-full items-center justify-between gap-[4mm] p-[4.5mm]">
        <div className="min-w-0 space-y-[2mm]">
          {data.logo ? <img src={data.logo} alt="" className="size-[13mm] rounded-[2mm] bg-white object-contain p-[1mm]" /> : null}
          <div className="leading-tight">
            <p className="text-[8.5pt] font-bold">{data.issuer}</p>
            {data.issuerEn ? (
              <p className="text-[6.5pt] text-white/75" dir="ltr">
                {data.issuerEn}
              </p>
            ) : null}
          </div>
          {data.department ? <p className="text-[6pt] text-white/70">{data.department}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-[1mm]">
          <div className="size-[26mm] rounded-[1.5mm] bg-white p-[1mm] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: data.qr }} />
          <p className="text-center text-[5.2pt] leading-tight text-white/80">
            امسح لحفظ جهة الاتصال
            <br />
            <span dir="ltr">Scan to save contact</span>
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * Screen: one front and one back. Print: either the same pair, or a full A4 sheet of ten fronts then ten backs
 * (all cards are identical, so the backs line up when printed double-sided).
 */
export function BusinessCardSheet({ data, sheet }: { data: BusinessCardData; sheet: boolean }) {
  return (
    <>
      <div className={cn("flex flex-wrap justify-center gap-6", sheet ? "print:hidden" : "print:justify-start print:gap-[6mm]")}>
        <BusinessCardFront data={data} />
        <BusinessCardBack data={data} />
      </div>
      {sheet ? (
        <div className="hidden print:block">
          {[BusinessCardFront, BusinessCardBack].map((Side, page) => (
            <div key={page} className={cn("grid grid-cols-[90mm_90mm] justify-center gap-x-[4mm] gap-y-[3mm]", page ? "break-before-page" : "")}>
              {Array.from({ length: 10 }, (_, index) => (
                <Side key={index} data={data} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
