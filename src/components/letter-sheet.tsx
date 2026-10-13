import { BadgeCheck, Globe, Mail, MapPin, Phone } from "lucide-react";
import { termText } from "@/lib/constants";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import type { LetterSeal } from "@/lib/letter-seal";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Bi, type DocHeader } from "./salary-docs";

export type LetterSheetData = {
  kind: string;
  refNo: string;
  issuedAt: Date;
  subject: string;
  subjectEn: string | null;
  body: string;
  bodyEn: string | null;
  addressee?: string | null;
  addresseeEn?: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  acknowledgedAt: Date | null;
  cancelledAt: Date | null;
  employee: { fullName: string; nameEn: string | null; employeeNumber: string; jobTitle: string | null; jobTitleEn: string | null; gender?: string | null };
};

const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

/**
 * Official A4 letter on the company letterhead: both names with the logo between them, reference and date,
 * the addressee, a centred subject, the Arabic text then the English one, signature and stamp, the e-seal
 * QR check, and the address line at the foot of the page. Always printed and shown as white paper.
 */
export function LetterSheet({ letter, header, seal }: { letter: LetterSheetData; header: DocHeader; seal?: LetterSeal | null }) {
  const meta = LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL;
  const kind = meta.label;
  const warning = meta.warning;
  const document = Boolean(meta.document);
  const employee = letter.employee;
  const female = employee.gender === "FEMALE";
  const jobAr = termText(employee.jobTitle, employee.jobTitleEn, "ar");
  const jobEn = termText(employee.jobTitle, employee.jobTitleEn, "en");
  const addressee = letter.addressee?.trim();
  const addresseeAr = addressee ? (addressee.startsWith("السادة") ? addressee : `السادة / ${addressee} المحترمين`) : "إلى من يهمه الأمر";
  const addresseeEn = letter.addresseeEn?.trim() || addressee;
  const nameEn = header.nameEn && header.nameEn !== header.name ? header.nameEn : null;
  const subjectAr = letter.subject || kind.ar;
  const subjectEn = letter.subjectEn || kind.en;
  const accent = warning ? "text-red-800" : "text-teal-900";

  const signature = (
    <div className="min-w-0">
      <Bi ar="عن الإدارة" en="For the management" className="text-slate-500" />
      <p className="mt-2 font-bold text-slate-900">{letter.signatoryName || ""}</p>
      {letter.signatoryTitle ? <p className="text-slate-600">{letter.signatoryTitle}</p> : null}
      {seal?.signature ? <img src={seal.signature} alt="" className="mt-2 h-16 max-w-48 object-contain" /> : <div className="mt-8 w-48 max-w-full border-b border-slate-400 print:mt-6" />}
      {seal ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-teal-700 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
          <BadgeCheck size={13} />
          موقّع إلكترونياً · <span dir="ltr">Digitally signed</span>
        </p>
      ) : null}
    </div>
  );
  const stamp = seal?.stamp ? (
    <div className="flex h-28 items-center justify-center">
      <img src={seal.stamp} alt="" className="max-h-28 max-w-40 object-contain" />
    </div>
  ) : seal ? null : (
    <div className="mx-auto flex size-28 items-center justify-center rounded-full border border-dashed border-slate-300 text-center text-[11px] leading-4 text-slate-400">
      ختم المنشأة
      <br />
      Company stamp
    </div>
  );

  return (
    <article
      className="sheet paper @container relative mx-auto flex w-full max-w-[210mm] flex-col overflow-hidden bg-surface px-5 py-6 text-slate-900 shadow-raised ring-1 ring-slate-200 sm:aspect-[210/297] sm:px-[14mm] sm:py-[12mm] print:aspect-auto print:min-h-[270mm] print:max-w-none print:px-[2mm] print:py-0 print:shadow-none print:ring-0"
      style={exact}
    >
      {header.logoUrl ? (
        <img src={header.logoUrl} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-1/2 max-w-80 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.05]" />
      ) : null}
      {letter.cancelledAt ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
          <span className="-rotate-[24deg] rounded-2xl border-4 border-red-500/50 px-8 py-3 text-5xl font-black tracking-wider text-red-500/45 sm:text-6xl">ملغى · CANCELLED</span>
        </div>
      ) : null}

      <header className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
        <div className="min-w-0 break-words">
          <p className="text-base font-bold leading-snug text-teal-900 sm:text-xl">{header.name}</p>
          {header.idNumber ? (
            <p className="mt-1 text-[11px] text-slate-500">
              السجل التجاري: <span className="tabular">{header.idNumber}</span>
            </p>
          ) : null}
        </div>
        {header.logoUrl ? (
          <img src={header.logoUrl} alt="" className="size-14 object-contain sm:size-20 print:size-[18mm]" />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-teal-800 text-xl font-bold text-teal-900 sm:size-20 sm:text-3xl print:size-[16mm]">{header.name.trim().charAt(0)}</span>
        )}
        <div dir="ltr" className="min-w-0 break-words text-end">
          {nameEn ? <p className="text-base font-bold leading-snug text-teal-900 sm:text-xl">{nameEn}</p> : null}
          {header.idNumber ? <p className="mt-1 text-[11px] text-slate-500">C.R. No. {header.idNumber}</p> : null}
        </div>
      </header>
      <div className="relative mt-4 space-y-[3px]" aria-hidden="true">
        <div className="h-[3px] bg-teal-800" />
        <div className="h-px bg-gold-400" />
      </div>

      <div className="relative mt-4 flex items-start justify-between gap-3 text-sm print:mt-3">
        <dl className="space-y-0.5">
          <div className="flex gap-1.5">
            <dt className="text-slate-500">الرقم:</dt>
            <dd className="tabular font-bold" dir="ltr">
              {letter.refNo}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-slate-500">التاريخ:</dt>
            <dd className="tabular font-bold">{formatDate(letter.issuedAt)}</dd>
          </div>
        </dl>
        <dl dir="ltr" className="hidden space-y-0.5 @md:block">
          <div className="flex gap-1.5">
            <dt className="text-slate-500">Ref.:</dt>
            <dd className="tabular font-bold">{letter.refNo}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-slate-500">Date:</dt>
            <dd className="tabular font-bold">{formatDate(letter.issuedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="relative mt-5 text-center print:mt-4">
        {warning ? (
          <p className="mb-2">
            <span className="inline-block rounded-md border border-red-800 px-2.5 py-0.5 text-xs font-bold text-red-800">
              سري وشخصي · <span dir="ltr">Private &amp; Confidential</span>
            </span>
          </p>
        ) : null}
        <h2 className={`inline-block border-b-2 pb-1 text-xl font-bold sm:text-2xl ${warning ? "border-red-800" : "border-gold-400"} ${accent}`}>{kind.ar}</h2>
        <p dir="ltr" className="mt-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {kind.en}
        </p>
      </div>

      <div className={`relative mt-5 grid grid-cols-1 gap-6 print:mt-4 ${letter.bodyEn ? "@xl:grid-cols-2 @xl:gap-0" : ""}`}>
        <section className={`min-w-0 text-[0.95rem] leading-8 print:leading-7 ${letter.bodyEn ? "@xl:pe-5 @xl:text-sm @xl:leading-7" : ""}`}>
          {document ? (
            <p className="font-bold">{addresseeAr}</p>
          ) : (
            <>
              <p>
                {female ? "الفاضلة / " : "الفاضل / "}
                <strong>{employee.fullName}</strong>
                {female ? " المحترمة" : " المحترم"}
              </p>
              <p className="text-[0.9em] text-slate-600">
                الرقم الوظيفي: <span className="tabular">{employee.employeeNumber}</span>
                {jobAr ? ` · ${jobAr}` : ""}
              </p>
            </>
          )}
          <p className="mt-3 font-bold">
            الموضوع: <span className={`underline decoration-gold-400 decoration-2 underline-offset-8 ${warning ? "text-red-800" : ""}`}>{subjectAr}</span>
          </p>
          <p className="mt-3">تحية طيبة وبعد،</p>
          <p className="mt-1 whitespace-pre-line break-words text-justify">{letter.body}</p>
          <p className="mt-3">وتفضلوا بقبول فائق الاحترام والتقدير،</p>
        </section>

        {letter.bodyEn ? (
          <section dir="ltr" className="min-w-0 border-t border-slate-200 pt-5 text-start text-[0.9rem] leading-7 text-slate-700 @xl:border-e @xl:border-t-0 @xl:pe-5 @xl:pt-0 @xl:text-[0.8rem] @xl:leading-6">
            {document ? (
              <p className="font-bold text-slate-900">{addresseeEn ? `To: ${addresseeEn}` : "To whom it may concern"}</p>
            ) : (
              <>
                <p className="text-slate-900">
                  To: <strong>{employee.nameEn || employee.fullName}</strong>
                </p>
                <p className="text-[0.9em] text-slate-600">
                  Employee No. {employee.employeeNumber}
                  {jobEn ? ` · ${jobEn}` : ""}
                </p>
              </>
            )}
            <p className="mt-3 font-bold text-slate-900">
              Subject: <span className={`underline decoration-gold-400 decoration-2 underline-offset-[6px] ${warning ? "text-red-800" : ""}`}>{subjectEn}</span>
            </p>
            <p className="mt-3">{document ? "Dear Sir/Madam," : `Dear ${employee.nameEn || employee.fullName},`}</p>
            <p className="mt-1 whitespace-pre-line break-words">{letter.bodyEn}</p>
            <p className="mt-3">Yours sincerely,</p>
          </section>
        ) : null}
      </div>

      <div className="relative mt-8 grid grid-cols-1 items-start gap-8 text-sm break-inside-avoid sm:grid-cols-2 sm:gap-10 print:mt-5 print:grid-cols-2 print:gap-10">
        {document ? (
          <>
            {signature}
            {stamp}
          </>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              {signature}
              {stamp}
            </div>
            <div className="min-w-0">
              <Bi ar="استلام الموظف" en="Employee acknowledgement" className="text-slate-500" />
              {letter.acknowledgedAt ? (
                <p className="mt-2 rounded-lg border border-teal-700 px-3 py-2 text-teal-800">
                  أكد الموظف الاستلام إلكترونياً في {formatDateTime(letter.acknowledgedAt)}
                  <span className="block text-xs" dir="ltr">
                    Receipt confirmed online on {formatDateTime(letter.acknowledgedAt)}
                  </span>
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    أقر باستلامي نسخة من هذا الخطاب.
                    <span className="block" dir="ltr">
                      I acknowledge receiving a copy of this letter.
                    </span>
                  </p>
                  <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-3 gap-y-5 text-xs text-slate-500 print:mt-3 print:gap-y-4">
                    <span>
                      التوقيع <span dir="ltr">Signature</span>
                    </span>
                    <span className="border-b border-slate-400" />
                    <span>
                      التاريخ <span dir="ltr">Date</span>
                    </span>
                    <span className="border-b border-slate-400" />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {seal ? (
        <div className="relative mt-6 flex items-center gap-4 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600 break-inside-avoid print:mt-4 print:p-2 print:text-[10px] print:leading-4">
          <div className="size-20 shrink-0 bg-white print:size-[21mm] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: seal.qr }} />
          <div className="min-w-0 space-y-0.5">
            <p className="font-bold text-slate-900">مستند موقّع إلكترونياً ومعتمد من {header.name}</p>
            <p dir="ltr" className="text-start">
              Electronically signed document issued by {header.nameEn || header.name}
            </p>
            <p>
              وقّعه: <strong className="text-slate-800">{seal.signedByName || letter.signatoryName || "—"}</strong> · <span className="tabular">{formatDateTime(seal.signedAt)}</span>
            </p>
            <p>
              رمز التحقق:{" "}
              <strong className="font-mono tracking-wider text-slate-900" dir="ltr">
                {seal.code}
              </strong>
            </p>
            <p>
              امسح الرمز للتحقق من صحة المستند · <span dir="ltr">Scan to verify</span>
            </p>
            <p className="break-all font-mono text-[10px] text-slate-500" dir="ltr">
              {seal.url}
            </p>
          </div>
        </div>
      ) : null}

      <footer className="relative mt-auto pt-6 print:pt-4">
        <div className="h-px bg-gold-400" aria-hidden="true" />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[11px] text-slate-600">
          {header.address ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} className="shrink-0 text-teal-700" />
              {header.address}
            </span>
          ) : null}
          {header.phone ? (
            <span className="inline-flex items-center gap-1" dir="ltr">
              <Phone size={11} className="shrink-0 text-teal-700" />
              {header.phone}
            </span>
          ) : null}
          {header.email ? (
            <span className="inline-flex items-center gap-1" dir="ltr">
              <Mail size={11} className="shrink-0 text-teal-700" />
              {header.email}
            </span>
          ) : null}
          {!header.address && !header.phone && !header.email ? (
            <span className="inline-flex items-center gap-1">
              <Globe size={11} className="shrink-0 text-teal-700" />
              {header.name}
            </span>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
