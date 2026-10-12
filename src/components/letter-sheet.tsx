import { termBoth } from "@/lib/constants";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Bi, HeaderBar, sheetClass, type DocHeader } from "./salary-docs";

export type LetterSheetData = {
  kind: string;
  refNo: string;
  issuedAt: Date;
  subject: string;
  subjectEn: string | null;
  body: string;
  bodyEn: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  acknowledgedAt: Date | null;
  cancelledAt: Date | null;
  employee: { fullName: string; nameEn: string | null; employeeNumber: string; jobTitle: string | null; jobTitleEn: string | null };
};

/** Official A4 letter, Arabic first with the English version below it. */
export function LetterSheet({ letter, header }: { letter: LetterSheetData; header: DocHeader }) {
  const kind = LETTER_KIND[letter.kind as LetterKind]?.label || LETTER_KIND.GENERAL.label;
  const warning = LETTER_KIND[letter.kind as LetterKind]?.warning;
  const employee = letter.employee;
  const job = termBoth(employee.jobTitle, employee.jobTitleEn);
  return (
    <article className={`${sheetClass} relative overflow-hidden`}>
      {letter.cancelledAt ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
          <span className="-rotate-[24deg] rounded-2xl border-4 border-red-500/50 px-8 py-3 text-5xl font-black tracking-wider text-red-500/45 sm:text-6xl">ملغى · CANCELLED</span>
        </div>
      ) : null}
      <HeaderBar header={header} titleAr={kind.ar} titleEn={kind.en} number={letter.refNo} />

      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        <p>
          <span className="text-slate-500">التاريخ / Date: </span>
          <strong className="tabular">{formatDate(letter.issuedAt)}</strong>
        </p>
        <p>
          <span className="text-slate-500">الرقم / Ref.: </span>
          <strong className="tabular" dir="ltr">
            {letter.refNo}
          </strong>
        </p>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 print:bg-white">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <span className="text-slate-500">إلى الموظف / To: </span>
            <strong>{employee.fullName}</strong>
            {employee.nameEn && employee.nameEn !== employee.fullName ? (
              <span className="block text-slate-600" dir="ltr">
                {employee.nameEn}
              </span>
            ) : null}
          </div>
          <div className="text-slate-600">
            <span className="tabular">{employee.employeeNumber}</span>
            {job ? <span> · {job}</span> : null}
          </div>
        </div>
      </div>

      <section className="mt-6 text-[0.95rem] leading-8">
        <p className="font-bold">
          الموضوع: <span className={warning ? "text-red-800" : "text-slate-900"}>{letter.subject}</span>
        </p>
        <p className="mt-3">تحية طيبة وبعد،</p>
        <p className="mt-2 whitespace-pre-line break-words">{letter.body}</p>
        <p className="mt-4">وتفضلوا بقبول فائق الاحترام والتقدير،</p>
      </section>

      {letter.bodyEn ? (
        <section dir="ltr" className="mt-6 border-t border-dashed border-slate-300 pt-5 text-start text-[0.9rem] leading-7 text-slate-700">
          <p className="font-bold text-slate-900">
            Subject: <span className={warning ? "text-red-800" : undefined}>{letter.subjectEn || kind.en}</span>
          </p>
          <p className="mt-3">Dear {employee.nameEn || employee.fullName},</p>
          <p className="mt-2 whitespace-pre-line break-words">{letter.bodyEn}</p>
          <p className="mt-4">Yours sincerely,</p>
        </section>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 sm:gap-10 print:grid-cols-2 print:gap-10">
        <div>
          <Bi ar="عن الإدارة" en="For the management" className="text-slate-500" />
          <p className="mt-2 font-semibold">{letter.signatoryName || ""}</p>
          {letter.signatoryTitle ? <p className="text-slate-600">{letter.signatoryTitle}</p> : null}
          <div className="mt-8 border-b border-slate-800" />
          <div className="mt-5 flex h-20 items-end justify-center rounded-lg border border-dashed border-slate-300 pb-2 text-xs text-slate-400">ختم المنشأة / Company stamp</div>
        </div>
        <div>
          <Bi ar="استلام الموظف" en="Employee acknowledgement" className="text-slate-500" />
          {letter.acknowledgedAt ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-inset ring-emerald-200 print:bg-white">
              أكد الموظف الاستلام إلكترونياً في {formatDateTime(letter.acknowledgedAt)}
              <span className="block text-xs" dir="ltr">
                Receipt confirmed online on {formatDateTime(letter.acknowledgedAt)}
              </span>
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs leading-5 text-slate-500">أقر باستلامي نسخة من هذا الخطاب / I acknowledge receiving a copy of this letter.</p>
              <div className="mt-8 border-b border-slate-800" />
              <div className="mt-5">
                <Bi ar="التاريخ" en="Date" className="text-slate-500" />
              </div>
              <div className="mt-6 border-b border-slate-800" />
            </>
          )}
        </div>
      </div>
    </article>
  );
}
