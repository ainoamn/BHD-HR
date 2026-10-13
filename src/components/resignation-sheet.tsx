import { Fragment } from "react";
import { termText } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Bi, Para, letterFontClass } from "./letter-sheet";
import type { DocHeader } from "./salary-docs";

export type ResignationSheetData = {
  refNo: string | null;
  status: string;
  createdAt: Date;
  lastDay: Date | null;
  approvedLastDay: Date | null;
  details: string | null;
  signedText: string | null;
  signedTextEn: string | null;
  signedName: string | null;
  signature: string | null;
  signedAt: Date | null;
  signedIp: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  letter: { refNo: string } | null;
  employee: { fullName: string; nameEn: string | null; employeeNumber: string; jobTitle: string | null; jobTitleEn: string | null; gender?: string | null };
};

const STATUS: Record<string, string> = {
  PENDING: "بانتظار القرار · Pending",
  APPROVED: "مقبولة · Accepted",
  REJECTED: "مرفوضة · Rejected",
  CANCELLED: "مسحوبة · Withdrawn",
};

/**
 * A resignation the employee filed from the portal, on the same official paper as the letters: their text, the name
 * they typed and the signature they drew, management's electronic decision, and the integrity check of what was signed.
 * `seal` is null for resignations filed before online signing.
 */
export function ResignationSheet({ request, header, seal }: { request: ResignationSheetData; header: DocHeader; seal: { code: string; intact: boolean } | null }) {
  const employee = request.employee;
  const female = employee.gender === "FEMALE";
  const employeeEn = employee.nameEn || employee.fullName;
  const nameEn = header.nameEn && header.nameEn !== header.name ? header.nameEn : null;
  const companyEn = header.nameEn || header.name;
  const jobAr = termText(employee.jobTitle, employee.jobTitleEn, "ar");
  const jobEn = termText(employee.jobTitle, employee.jobTitleEn, "en");
  const contact = [header.address, header.phone, header.email].filter(Boolean) as string[];
  const en = Boolean(request.signedTextEn);
  const fallbackAr = `${female ? "تقدّمت الموظفة" : "تقدّم الموظف"} ${employee.fullName}، الرقم الوظيفي ${employee.employeeNumber}، باستقالته من بوابة الموظف${request.lastDay ? `، على أن يكون آخر يوم عمل ${formatDate(request.lastDay)}` : ""}.${request.details ? `\n\nالسبب: ${request.details}` : ""}`;

  const employeeSide = (
    <div className="letter-doc__signature" key="employee">
      <span className="letter-doc__party-role">
        <Bi ar={female ? "توقيع الموظفة" : "توقيع الموظف"} en="Employee's signature" />
      </span>
      <div className="letter-doc__signature-mark">
        {request.signature ? (
          <img src={request.signature} alt={`توقيع ${employee.fullName}`} />
        ) : (
          <span className="letter-doc__signature-seal">
            قُدّمت من البوابة · <span dir="ltr">Filed online</span>
          </span>
        )}
      </div>
      <dl className="letter-doc__facts">
        <div className="letter-doc__row">
          <dt>
            <Bi ar="الاسم كما كُتب" en="Name as typed" />
          </dt>
          <dd>{request.signedName || employee.fullName}</dd>
        </div>
        <div className="letter-doc__row">
          <dt>
            <Bi ar="وقت التوقيع" en="Signed at" />
          </dt>
          <dd>{formatDateTime(request.signedAt || request.createdAt)}</dd>
        </div>
      </dl>
    </div>
  );

  const decision =
    request.status === "APPROVED" ? (
      <span className="letter-doc__signature-seal">
        قُبلت إلكترونياً · <span dir="ltr">Accepted online</span>
      </span>
    ) : request.status === "REJECTED" ? (
      <span className="letter-doc__signature-seal">
        رُفضت إلكترونياً · <span dir="ltr">Rejected online</span>
      </span>
    ) : request.status === "CANCELLED" ? (
      <span className="letter-doc__ack">
        سحبها {female ? "الموظفة" : "الموظف"} قبل القرار
        <span dir="ltr">Withdrawn by the employee</span>
      </span>
    ) : (
      <span className="letter-doc__ack">
        بانتظار قرار الإدارة
        <span dir="ltr">Awaiting management&apos;s decision</span>
      </span>
    );

  const companySide = (
    <div className="letter-doc__signature" key="company">
      <span className="letter-doc__party-role">
        <Bi ar="قرار الإدارة" en="Management's decision" />
      </span>
      <div className="letter-doc__signature-mark">{decision}</div>
      <dl className="letter-doc__facts">
        <div className="letter-doc__row">
          <dt>
            <Bi ar="الاسم" en="Name" />
          </dt>
          <dd>{request.decidedByName || <span className="letter-doc__blank" />}</dd>
        </div>
        <div className="letter-doc__row">
          <dt>
            <Bi ar="التاريخ" en="Date" />
          </dt>
          <dd>{request.decidedAt ? formatDateTime(request.decidedAt) : <span className="letter-doc__blank" />}</dd>
        </div>
        {request.status === "APPROVED" && request.letter ? (
          <div className="letter-doc__row">
            <dt>
              <Bi ar="خطاب القبول" en="Acceptance letter" />
            </dt>
            <dd>
              <bdi dir="ltr">{request.letter.refNo}</bdi>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );

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
        <p className="letter-doc__confidential">
          سري وشخصي · <span dir="ltr">Private &amp; Confidential</span>
        </p>
        <span className="letter-doc__ornament" aria-hidden="true">
          ❖
        </span>
        <h1>استقالة</h1>
        <p className="letter-doc__title-alt" dir="ltr" lang="en">
          Resignation
        </p>
        <div className="letter-doc__meta">
          <div>
            <Bi ar="رقم الاستقالة" en="Ref. No." />
            <strong dir="ltr">{request.refNo || "—"}</strong>
          </div>
          <div>
            <Bi ar="تاريخ التقديم" en="Submitted" />
            <strong>{formatDate(request.signedAt || request.createdAt)}</strong>
          </div>
          <div>
            <Bi ar="الحالة" en="Status" />
            <strong>{STATUS[request.status] || STATUS.PENDING}</strong>
          </div>
        </div>
      </div>

      <div className="letter-doc__body">
        <Para className="letter-doc__strong" ar={`السادة / إدارة ${header.name} المحترمين`} en={en ? `To: The Management, ${companyEn}` : undefined} />
        <Para
          ar={
            <>
              {female ? "من الموظفة: " : "من الموظف: "}
              <strong>{employee.fullName}</strong>
              <span className="letter-doc__note">
                الرقم الوظيفي: <bdi className="letter-doc__num">{employee.employeeNumber}</bdi>
                {jobAr ? ` · ${jobAr}` : ""}
              </span>
            </>
          }
          en={
            en ? (
              <>
                From: <strong>{employeeEn}</strong>
                <span className="letter-doc__note">
                  Employee No. {employee.employeeNumber}
                  {jobEn ? ` · ${jobEn}` : ""}
                </span>
              </>
            ) : undefined
          }
        />
        <h2 className="letter-doc__heading">
          <span lang="ar">
            <span className="letter-doc__ordinal">الموضوع:</span> تقديم استقالة
          </span>
          {en ? (
            <span lang="en" dir="ltr">
              <span className="letter-doc__ordinal">Subject:</span> Resignation
            </span>
          ) : null}
        </h2>
        <Para ar="تحية طيبة وبعد،" en={en ? "Dear Sir/Madam," : undefined} />
        <Para className="letter-doc__text" ar={request.signedText || fallbackAr} en={request.signedTextEn || undefined} />
        <Para ar="وتفضلوا بقبول فائق الاحترام والتقدير،" en={en ? "Yours faithfully," : undefined} />

        <table className="letter-doc__table">
          <tbody>
            <tr>
              <td>1</td>
              <td>
                <Bi ar="آخر يوم عمل مقترح" en="Proposed last working day" />
              </td>
              <td>{request.lastDay ? formatDate(request.lastDay) : "—"}</td>
            </tr>
            {request.status === "APPROVED" ? (
              <tr>
                <td>2</td>
                <td>
                  <Bi ar="آخر يوم عمل معتمد" en="Approved last working day" />
                </td>
                <td>{request.approvedLastDay ? formatDate(request.approvedLastDay) : request.lastDay ? formatDate(request.lastDay) : "—"}</td>
              </tr>
            ) : null}
            {request.decisionNote ? (
              <tr>
                <td>{request.status === "APPROVED" ? 3 : 2}</td>
                <td>
                  <Bi ar="ملاحظة الإدارة" en="Management's note" />
                </td>
                <td>{request.decisionNote}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="letter-doc__signatures">{[employeeSide, companySide]}</section>

      {seal ? (
        <div className="letter-doc__integrity">
          <div>
            <strong>
              وقّع{female ? "تها الموظفة" : "ها الموظف"} إلكترونياً من بوابة الموظف{" "}
              <bdi className="letter-doc__num">{formatDateTime(request.signedAt!)}</bdi>
            </strong>
            <span dir="ltr">Signed electronically by the employee in the employee portal</span>
            <span>
              البصمة الرقمية · <bdi>Digital fingerprint</bdi>:{" "}
              <code dir="ltr" className="letter-doc__code">
                {seal.code}
              </code>{" "}
              · {seal.intact ? "مطابقة للنص الموقّع · Matches the signed text" : "لا تطابق النص الموقّع · Does NOT match the signed text"}
            </span>
            {request.signedIp ? (
              <span>
                عنوان الجهاز · <bdi>Device address</bdi>: <code dir="ltr">{request.signedIp}</code>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer className="letter-doc__pagefoot">
        <span>
          استقالة · <bdi dir="ltr">{request.refNo || employee.employeeNumber}</bdi>
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
