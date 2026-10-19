import { Fragment } from "react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Bi, letterFontClass } from "./letter-sheet";
import type { DocHeader } from "./salary-docs";

export type OfficialDocRow = {
  key: string;
  employeeName: string;
  employeeNumber: string;
  label: string;
  number: string | null;
  expiry: string;
  status: string;
};

/** Shared e-signature strip: QR (optionally with company logo) that opens the live page. */
export function OfficialSeal({
  qr,
  url,
  signedBy,
  signedAt,
  serial,
}: {
  qr: string;
  url: string;
  signedBy: string;
  signedAt: Date;
  serial?: string | null;
}) {
  return (
    <section className="letter-doc__integrity">
      <div>
        <strong>
          توقيع إلكتروني · <span dir="ltr">Electronic signature</span>
        </strong>
        <p>
          وقّعه: {signedBy}
          <br />
          <span dir="ltr">{formatDateTime(signedAt)}</span>
        </p>
        {serial ? (
          <p>
            الرقم: <b className="letter-doc__serial" dir="ltr">{serial}</b>
          </p>
        ) : null}
        <p className="mt-1 text-[0.85em] opacity-80">
          امسح الرمز للفتح على الصفحة · <span dir="ltr">Scan the code to open the page</span>
        </p>
        <code className="letter-doc__code" dir="ltr">
          {url}
        </code>
      </div>
      <a className="letter-doc__integrity-qr" href={url} target="_blank" rel="noreferrer" title={url}>
        <span dangerouslySetInnerHTML={{ __html: qr }} />
      </a>
    </section>
  );
}

/** Official A4 register: company letterhead, data table, and e-signature QR with logo. */
export function OfficialDocSheet({
  header,
  titleAr,
  titleEn,
  subtitle,
  printedAt,
  rows,
  columns,
  seal,
  emptyText,
}: {
  header: DocHeader;
  titleAr: string;
  titleEn: string;
  subtitle?: string | null;
  printedAt: Date;
  rows: OfficialDocRow[];
  columns: { key: keyof OfficialDocRow | "index"; ar: string; en: string }[];
  seal: { qr: string; url: string; signedBy: string; signedAt: Date; serial?: string | null };
  emptyText: { ar: string; en: string };
}) {
  const nameEn = header.nameEn && header.nameEn !== header.name ? header.nameEn : null;
  const contact = [header.address, header.phone, header.email].filter(Boolean) as string[];

  return (
    <article className={`letter-doc paper ${letterFontClass}`}>
      <style>{`@page { size: A4; margin: 8mm; }`}</style>
      {header.logoUrl ? (
        <div className="letter-doc__deco" aria-hidden="true">
          <img src={header.logoUrl} alt="" className="letter-doc__watermark" />
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
          {header.phone ? (
            <span>
              هاتف: <bdi>{header.phone}</bdi>
            </span>
          ) : null}
        </div>
        <div className="letter-doc__lh-logo">
          {header.logoUrl ? <img src={header.logoUrl} alt="" /> : <span className="letter-doc__monogram">{header.name.trim().charAt(0)}</span>}
        </div>
        <div className="letter-doc__lh-side" dir="ltr">
          <strong>{nameEn || header.name}</strong>
          {header.idNumber ? <span>C.R. No. {header.idNumber}</span> : null}
          {header.email ? <span>{header.email}</span> : null}
        </div>
      </header>

      <div className="letter-doc__title">
        <span className="letter-doc__ornament" aria-hidden="true">
          ❖
        </span>
        <h1>{titleAr}</h1>
        <p className="letter-doc__title-alt" dir="ltr" lang="en">
          {titleEn}
        </p>
        <div className="letter-doc__meta">
          <div>
            <Bi ar="تاريخ الطباعة" en="Printed" />
            <strong>{formatDate(printedAt)}</strong>
          </div>
          <div>
            <Bi ar="عدد السجلات" en="Records" />
            <strong dir="ltr">{rows.length}</strong>
          </div>
          {subtitle ? (
            <div>
              <Bi ar="التصفية" en="Filter" />
              <strong>{subtitle}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="letter-doc__body">
        {rows.length === 0 ? (
          <p className="text-center text-sm text-slate-500">
            {emptyText.ar}
            <span className="mt-1 block" dir="ltr">
              {emptyText.en}
            </span>
          </p>
        ) : (
          <table className="letter-doc__table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>
                    <Bi ar={column.ar} en={column.en} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.key === "employeeNumber" || column.key === "number" || column.key === "index" ? "letter-doc__num" : undefined}>
                      {column.key === "index" ? index + 1 : row[column.key as keyof OfficialDocRow] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="letter-doc__note mt-4">
          هذا كشف صادر إلكترونياً من نظام الموارد البشرية لـ {header.name}. الرمز الشريطي يفتح الصفحة الأصلية في النظام للتحقق.
          <span className="mt-1 block" dir="ltr">
            Official electronic extract from {nameEn || header.name} HR. The QR code opens the live page for verification.
          </span>
        </p>
      </div>

      <OfficialSeal qr={seal.qr} url={seal.url} signedBy={seal.signedBy} signedAt={seal.signedAt} serial={seal.serial} />

      <footer className="letter-doc__pagefoot">
        <span>
          {titleAr} · <span dir="ltr">{formatDateTime(printedAt)}</span>
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
