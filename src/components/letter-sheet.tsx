import { Amiri } from "next/font/google";
import { Fragment } from "react";
import { termText } from "@/lib/constants";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import type { LetterSeal } from "@/lib/letter-seal";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { DocHeader } from "./salary-docs";

/** The serif of BHD R contracts (contract-doc-parts.tsx), so HR letters read as the same family of documents. */
const letterSerif = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], display: "swap", variable: "--font-letter" });
export const letterFontClass = letterSerif.variable;

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
  employee: {
    fullName: string;
    nameEn: string | null;
    employeeNumber: string;
    jobTitle: string | null;
    jobTitleEn: string | null;
    /** Civil / national ID (الرقم المدني). */
    idNumber?: string | null;
    gender?: string | null;
  };
};

export function Bi({ ar, en }: { ar: React.ReactNode; en: React.ReactNode }) {
  return (
    <span className="letter-doc__bi">
      <span lang="ar">{ar}</span>
      <span lang="en" dir="ltr">
        {en}
      </span>
    </span>
  );
}

export function Para({ ar, en, className = "" }: { ar: React.ReactNode; en?: React.ReactNode; className?: string }) {
  return (
    <div className={`letter-doc__para ${en ? "" : "letter-doc__para--single"} ${className}`}>
      <p dir="rtl" lang="ar">
        {ar}
      </p>
      {en ? (
        <p dir="ltr" lang="en">
          {en}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Official A4 letter in the style of BHD R contracts: letterhead, ornamented title with the reference box,
 * the round e-signature seal with its serial and the check QR at the top, Arabic and English side by side,
 * signatures, the authentication box and the page foot. Always cream paper, at night and in print too.
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
  const civilId = employee.idNumber?.trim() || "";
  const addressee = letter.addressee?.trim();
  const addresseeAr = addressee ? (addressee.startsWith("السادة") ? addressee : `السادة / ${addressee} المحترمين`) : "إلى من يهمه الأمر";
  const addresseeEn = letter.addresseeEn?.trim() || addressee;
  const nameEn = header.nameEn && header.nameEn !== header.name ? header.nameEn : null;
  const employeeEn = employee.nameEn || employee.fullName;
  const identityAr = (
    <span className="letter-doc__identity">
      <span>
        اسم الموظف: <strong>{employee.fullName}</strong>
      </span>
      <span>
        الرقم الوظيفي: <bdi className="letter-doc__num">{employee.employeeNumber}</bdi>
      </span>
      {jobAr ? (
        <span>
          المسمى الوظيفي: <strong>{jobAr}</strong>
        </span>
      ) : null}
      {civilId ? (
        <span>
          الرقم المدني: <bdi className="letter-doc__num">{civilId}</bdi>
        </span>
      ) : null}
    </span>
  );
  const identityEn = (
    <span className="letter-doc__identity">
      <span>
        Employee name: <strong>{employeeEn}</strong>
      </span>
      <span>
        Employee No.: <bdi className="letter-doc__num">{employee.employeeNumber}</bdi>
      </span>
      {jobEn ? (
        <span>
          Job title: <strong>{jobEn}</strong>
        </span>
      ) : null}
      {civilId ? (
        <span>
          Civil ID: <bdi className="letter-doc__num">{civilId}</bdi>
        </span>
      ) : null}
    </span>
  );
  const subjectAr = letter.subject || kind.ar;
  const subjectEn = letter.subjectEn || kind.en;
  const en = Boolean(letter.bodyEn);
  const serial = seal?.serial || null;
  const status = letter.cancelledAt ? "cancelled" : seal ? "signed" : "draft";
  const contact = [header.address, header.phone, header.email].filter(Boolean) as string[];

  return (
    <article className={`letter-doc paper ${letterSerif.variable}`}>
      <style>{`@page { size: A4; margin: 8mm; }`}</style>
      {header.logoUrl || letter.cancelledAt ? (
        <div className="letter-doc__deco" aria-hidden="true">
          {header.logoUrl ? <img src={header.logoUrl} alt="" className="letter-doc__watermark" /> : null}
          {letter.cancelledAt ? (
            <div className="letter-doc__void">
              <span>ملغى · CANCELLED</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <header className="letter-doc__letterhead">
        <div className="letter-doc__lh-side" dir="rtl">
          <strong>{header.name}</strong>
          {header.idNumber ? (
            <span>
              السجل التجاري: <bdi className="letter-doc__num">{header.idNumber}</bdi>
            </span>
          ) : null}
        </div>
        <div className="letter-doc__lh-logo">
          {header.logoUrl ? <img src={header.logoUrl} alt="" /> : <span className="letter-doc__monogram">{header.name.trim().charAt(0)}</span>}
        </div>
        <div className="letter-doc__lh-side" dir="ltr">
          <strong>{nameEn || header.name}</strong>
          {header.idNumber ? <span>C.R. No. {header.idNumber}</span> : null}
        </div>
      </header>

      <div className="letter-doc__title">
        {warning || meta.confidential ? (
          <p className="letter-doc__confidential">
            سري وشخصي · <span dir="ltr">Private &amp; Confidential</span>
          </p>
        ) : null}
        <span className="letter-doc__ornament" aria-hidden="true">
          ❖
        </span>
        <h1 className={warning ? "letter-doc__title--warning" : undefined}>{kind.ar}</h1>
        <p className="letter-doc__title-alt" dir="ltr" lang="en">
          {kind.en}
        </p>
        <div className="letter-doc__meta">
          <div>
            <Bi ar="رقم الخطاب" en="Ref. No." />
            <strong dir="ltr">{letter.refNo}</strong>
          </div>
          <div>
            <Bi ar="تاريخ الإصدار" en="Issue date" />
            <strong>{formatDate(letter.issuedAt)}</strong>
          </div>
          <div>
            <Bi ar="الحالة" en="Status" />
            <strong>
              {status === "cancelled" ? "ملغى · Cancelled" : status === "signed" ? "موقّع · Signed" : "مسودة · Draft"}
            </strong>
          </div>
        </div>
        {seal ? (
          <>
            <span
              className={`letter-doc__seal letter-doc__seal--${status}`}
              role="img"
              aria-label={serial ? `توقيع إلكتروني رقم ${serial} · Electronic signature No. ${serial}` : "موقّع إلكترونياً · Signed electronically"}
            >
              <span>توقيع إلكتروني</span>
              {serial ? <b dir="ltr">{serial}</b> : null}
              <small dir="ltr">E-SIGNATURE No.</small>
            </span>
            <a className="letter-doc__qr" href={seal.url} target="_blank" rel="noreferrer">
              <span dangerouslySetInnerHTML={{ __html: seal.qr }} />
              <small>
                <span>امسح للتحقق</span>
                <span dir="ltr">Scan to verify</span>
              </small>
            </a>
          </>
        ) : null}
      </div>

      <div className="letter-doc__body">
        {document ? (
          <>
            <Para className="letter-doc__strong" ar={addresseeAr} en={en ? (addresseeEn ? `To: ${addresseeEn}` : "To whom it may concern") : undefined} />
            <Para ar={identityAr} en={en ? identityEn : undefined} />
          </>
        ) : (
          <Para
            ar={
              <>
                {female ? "الفاضلة / " : "الفاضل / "}
                <strong>{employee.fullName}</strong>
                {female ? " المحترمة" : " المحترم"}
                {identityAr}
              </>
            }
            en={
              en ? (
                <>
                  To: <strong>{employeeEn}</strong>
                  {identityEn}
                </>
              ) : undefined
            }
          />
        )}

        <h2 className={`letter-doc__heading ${warning ? "letter-doc__heading--warning" : ""}`}>
          <span lang="ar">
            <span className="letter-doc__ordinal">الموضوع:</span> {subjectAr}
          </span>
          {en ? (
            <span lang="en" dir="ltr">
              <span className="letter-doc__ordinal">Subject:</span> {subjectEn}
            </span>
          ) : null}
        </h2>

        <Para ar="تحية طيبة وبعد،" en={en ? (document ? "Dear Sir/Madam," : `Dear ${employeeEn},`) : undefined} />
        <Para className="letter-doc__text" ar={letter.body} en={letter.bodyEn || undefined} />
        <Para ar="وتفضلوا بقبول فائق الاحترام والتقدير،" en={en ? "Yours sincerely," : undefined} />
      </div>

      <section className="letter-doc__signatures">
        <div className="letter-doc__signature">
          <span className="letter-doc__party-role">
            <Bi ar="عن الإدارة" en="For the management" />
          </span>
          <div className="letter-doc__signature-mark">
            {seal?.signature ? <img src={seal.signature} alt="" /> : seal ? <span className="letter-doc__signature-seal">موقّع إلكترونياً · <span dir="ltr">Signed electronically</span></span> : null}
            {seal?.stamp ? <img src={seal.stamp} alt="" className="letter-doc__stamp" /> : null}
          </div>
          <dl className="letter-doc__facts">
            <div className="letter-doc__row">
              <dt>
                <Bi ar="الاسم" en="Name" />
              </dt>
              <dd>{letter.signatoryName || "—"}</dd>
            </div>
            {letter.signatoryTitle ? (
              <div className="letter-doc__row">
                <dt>
                  <Bi ar="الصفة" en="Title" />
                </dt>
                <dd>{letter.signatoryTitle}</dd>
              </div>
            ) : null}
            {seal ? (
              <div className="letter-doc__row">
                <dt>
                  <Bi ar="رقم التوقيع الإلكتروني" en="E-signature No." />
                </dt>
                <dd>
                  <strong className="letter-doc__serial" dir="ltr">
                    {serial || "—"}
                  </strong>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {document ? null : (
          <div className="letter-doc__signature">
            <span className="letter-doc__party-role">
              <Bi ar="استلام الموظف" en="Employee acknowledgement" />
            </span>
            <div className="letter-doc__signature-mark">
              {letter.acknowledgedAt ? (
                <span className="letter-doc__signature-seal">
                  تم الاستلام إلكترونياً · <span dir="ltr">Received online</span>
                </span>
              ) : (
                <span className="letter-doc__ack">
                  أقر باستلامي نسخة من هذا الخطاب.
                  <span dir="ltr">I acknowledge receiving a copy of this letter.</span>
                </span>
              )}
            </div>
            <dl className="letter-doc__facts">
              <div className="letter-doc__row">
                <dt>
                  <Bi ar="الاسم" en="Name" />
                </dt>
                <dd>{employee.fullName}</dd>
              </div>
              <div className="letter-doc__row">
                <dt>
                  <Bi ar="التاريخ" en="Date" />
                </dt>
                <dd>{letter.acknowledgedAt ? formatDateTime(letter.acknowledgedAt) : <span className="letter-doc__blank" />}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {seal ? (
        <div className="letter-doc__integrity">
          <span className="letter-doc__integrity-qr" dangerouslySetInnerHTML={{ __html: seal.qr }} />
          <div>
            <strong>
              تم توثيق هذا الخطاب بتوقيع إلكتروني رقم{" "}
              <bdi className="letter-doc__serial" dir="ltr">
                {serial || "—"}
              </bdi>{" "}
              صادر عن {header.name}
            </strong>
            <span dir="ltr">
              Authenticated by electronic signature No. <b className="letter-doc__serial">{serial || "—"}</b> issued by {header.nameEn || header.name}
            </span>
            <span>
              وقّعه:{" "}
              <b>
                <bdi>{seal.signedByName || letter.signatoryName || "—"}</bdi>
              </b>{" "}
              · <bdi className="letter-doc__num">{formatDateTime(seal.signedAt)}</bdi>
            </span>
            <span>
              رمز التحقق · <bdi>Verification code</bdi>:{" "}
              <code dir="ltr" className="letter-doc__code">
                {seal.code}
              </code>
            </span>
            <code dir="ltr">{seal.url}</code>
          </div>
        </div>
      ) : null}

      <footer className="letter-doc__pagefoot">
        <span>
          {kind.ar} · <bdi dir="ltr">{letter.refNo}</bdi>
          {serial ? (
            <>
              {" "}
              · <bdi dir="ltr">{serial}</bdi>
            </>
          ) : null}
        </span>
        <span>
          {contact.length
            ? contact.map((item, index) => (
                <Fragment key={item}>
                  {index ? " · " : null}
                  <bdi>{item}</bdi>
                </Fragment>
              ))
            : header.name}
        </span>
      </footer>
    </article>
  );
}
