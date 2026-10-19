import { Fragment } from "react";
import { termText } from "@/lib/constants";
import { CUSTODY_DIRECTION } from "@/lib/custody";
import type { PrintOrient } from "@/lib/official-print";
import { formatDate, formatDateTime } from "@/lib/utils";
import { OfficialSeal } from "./official-doc-sheet";
import { Bi, Para, letterFontClass } from "./letter-sheet";
import type { DocHeader } from "./salary-docs";

export type CustodySheetData = {
  refNo: string;
  direction: string;
  createdAt: Date;
  purpose: string | null;
  dueBack: Date | null;
  handedByName: string;
  receivedByName: string;
  createdByName: string | null;
  acknowledgedAt: Date | null;
  items: { id: string; label: string; documentNo: string | null }[];
  employee: { fullName: string; nameEn: string | null; employeeNumber: string; jobTitle: string | null; jobTitleEn: string | null; gender?: string | null };
};

/**
 * Receipt (IN) or handover (OUT) form for original documents, on the same official paper as the letters:
 * the list of originals, the declaration, and both parties with the employee's electronic acknowledgement.
 */
export function CustodySheet({
  form,
  header,
  seal,
  orient = "portrait",
  id,
}: {
  form: CustodySheetData;
  header: DocHeader;
  seal?: { qr: string; url: string; signedBy: string; signedAt: Date; serial?: string | null } | null;
  orient?: PrintOrient;
  id?: string;
}) {
  const direction = form.direction === "IN" ? "IN" : "OUT";
  const meta = CUSTODY_DIRECTION[direction];
  const employee = form.employee;
  const female = employee.gender === "FEMALE";
  const employeeEn = employee.nameEn || employee.fullName;
  const nameEn = header.nameEn && header.nameEn !== header.name ? header.nameEn : null;
  const companyEn = header.nameEn || header.name;
  const jobAr = termText(employee.jobTitle, employee.jobTitleEn, "ar");
  const contact = [header.address, header.phone, header.email].filter(Boolean) as string[];
  const count = form.items.length;
  const purpose = form.purpose ? `\u2068${form.purpose}\u2069` : null;

  const declarationAr =
    direction === "OUT"
      ? `${female ? "أقرّ أنا الموقّعة" : "أقرّ أنا الموقّع"} أدناه ${employee.fullName}، الرقم الوظيفي ${employee.employeeNumber}، بأنني استلمت من ${header.name} أصول المستندات المبيّنة أعلاه وعددها (${count}) بحالة سليمة${purpose ? `، لغرض: ${purpose}` : ""}.${
          form.dueBack
            ? ` وأتعهد بإعادتها إلى المنشأة في موعد أقصاه ${formatDate(form.dueBack)}، وأتحمّل مسؤولية المحافظة عليها طوال مدة بقائها بحوزتي.`
            : " وبذلك تُخلى عهدة المنشأة منها."
        }`
      : `تُقرّ ${header.name} بأنها استلمت من ${female ? "الموظفة" : "الموظف"} ${employee.fullName}، الرقم الوظيفي ${employee.employeeNumber}، أصول المستندات المبيّنة أعلاه وعددها (${count})${purpose ? `، وذلك: ${purpose}` : ""}، وتلتزم بحفظها والمحافظة عليها وإعادتها إلى ${female ? "صاحبتها" : "صاحبها"} عند الطلب وفق الأنظمة.`;
  const declarationEn =
    direction === "OUT"
      ? `I, the undersigned ${employeeEn}, Employee No. ${employee.employeeNumber}, acknowledge receiving from ${companyEn} the original documents listed above (${count}) in good condition${purpose ? `, for: ${purpose}` : ""}.${
          form.dueBack
            ? ` I undertake to return them to the company no later than ${formatDate(form.dueBack)} and am responsible for keeping them safe while they are in my possession.`
            : " The company is hereby cleared of their custody."
        }`
      : `${companyEn} acknowledges receiving from ${employeeEn}, Employee No. ${employee.employeeNumber}, the original documents listed above (${count})${purpose ? `, for: ${purpose}` : ""}, and undertakes to keep them safe and return them to the owner on request in accordance with the rules.`;

  const employeeSide = (
    <div className="letter-doc__signature" key="employee">
      <span className="letter-doc__party-role">
        <Bi ar={meta[direction === "OUT" ? "received" : "handed"].ar} en={meta[direction === "OUT" ? "received" : "handed"].en} />
      </span>
      <div className="letter-doc__signature-mark">
        {form.acknowledgedAt ? (
          <span className="letter-doc__signature-seal">
            أقرّ إلكترونياً · <span dir="ltr">Acknowledged online</span>
          </span>
        ) : (
          <span className="letter-doc__ack">
            التوقيع
            <span dir="ltr">Signature</span>
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
          <dd>{form.acknowledgedAt ? formatDateTime(form.acknowledgedAt) : <span className="letter-doc__blank" />}</dd>
        </div>
      </dl>
    </div>
  );
  const companySide = (
    <div className="letter-doc__signature" key="company">
      <span className="letter-doc__party-role">
        <Bi ar={meta[direction === "OUT" ? "handed" : "received"].ar} en={meta[direction === "OUT" ? "handed" : "received"].en} />
      </span>
      <div className="letter-doc__signature-mark">
        <span className="letter-doc__signature-seal">
          سُجّل إلكترونياً · <span dir="ltr">Recorded online</span>
        </span>
      </div>
      <dl className="letter-doc__facts">
        <div className="letter-doc__row">
          <dt>
            <Bi ar="الاسم" en="Name" />
          </dt>
          <dd>{direction === "OUT" ? form.handedByName : form.receivedByName}</dd>
        </div>
        <div className="letter-doc__row">
          <dt>
            <Bi ar="التاريخ" en="Date" />
          </dt>
          <dd>{formatDateTime(form.createdAt)}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <article id={id} className={`letter-doc paper ${letterFontClass} ${orient === "landscape" ? "letter-doc--landscape" : ""}`}>
      <style>{`@page { size: A4 ${orient}; margin: 8mm; }`}</style>
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
        <span className="letter-doc__ornament" aria-hidden="true">
          ❖
        </span>
        <h1>{meta.title.ar}</h1>
        <p className="letter-doc__title-alt" dir="ltr" lang="en">
          {meta.title.en}
        </p>
        <div className="letter-doc__meta">
          <div>
            <Bi ar="رقم الاستمارة" en="Form No." />
            <strong dir="ltr">{form.refNo}</strong>
          </div>
          <div>
            <Bi ar="التاريخ" en="Date" />
            <strong>{formatDate(form.createdAt)}</strong>
          </div>
          <div>
            <Bi ar="الإقرار" en="Acknowledgement" />
            <strong>{form.acknowledgedAt ? "مُقرّ · Acknowledged" : "بانتظار الإقرار · Pending"}</strong>
          </div>
        </div>
      </div>

      <div className="letter-doc__body">
        <Para
          ar={
            <>
              {female ? "الموظفة: " : "الموظف: "}
              <strong>{employee.fullName}</strong>
              <span className="letter-doc__note">
                الرقم الوظيفي: <bdi className="letter-doc__num">{employee.employeeNumber}</bdi>
                {jobAr ? ` · ${jobAr}` : ""}
              </span>
            </>
          }
          en={
            <>
              Employee: <strong>{employeeEn}</strong>
              <span className="letter-doc__note">Employee No. {employee.employeeNumber}</span>
            </>
          }
        />
        {form.purpose || form.dueBack ? (
          <Para
            ar={[form.purpose ? `الغرض: ${form.purpose}` : "", form.dueBack ? `موعد الإعادة: ${formatDate(form.dueBack)}` : ""].filter(Boolean).join(" · ")}
            en={[form.purpose ? `Purpose: ${form.purpose}` : "", form.dueBack ? `Due back: ${formatDate(form.dueBack)}` : ""].filter(Boolean).join(" · ")}
          />
        ) : null}

        <h2 className="letter-doc__heading">
          <span lang="ar">
            <span className="letter-doc__ordinal">المستندات الأصلية:</span> {count}
          </span>
          <span lang="en" dir="ltr">
            <span className="letter-doc__ordinal">Original documents:</span> {count}
          </span>
        </h2>
        <table className="letter-doc__table">
          <thead>
            <tr>
              <th>#</th>
              <th>
                <Bi ar="المستند" en="Document" />
              </th>
              <th>
                <Bi ar="رقم المستند" en="Document No." />
              </th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, index) => (
              <tr key={item.id}>
                <td className="letter-doc__num">{index + 1}</td>
                <td>{item.label}</td>
                <td>{item.documentNo ? <bdi dir="ltr">{item.documentNo}</bdi> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="letter-doc__heading">
          <span lang="ar">
            <span className="letter-doc__ordinal">إقرار</span>
          </span>
          <span lang="en" dir="ltr">
            <span className="letter-doc__ordinal">Declaration</span>
          </span>
        </h2>
        <Para className="letter-doc__text" ar={declarationAr} en={declarationEn} />
      </div>

      <section className="letter-doc__signatures">{direction === "OUT" ? [companySide, employeeSide] : [employeeSide, companySide]}</section>

      {seal ? <OfficialSeal qr={seal.qr} url={seal.url} signedBy={seal.signedBy} signedAt={seal.signedAt} serial={seal.serial} /> : null}

      <footer className="letter-doc__pagefoot">
        <span>
          {meta.title.ar} · <bdi dir="ltr">{form.refNo}</bdi>
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
