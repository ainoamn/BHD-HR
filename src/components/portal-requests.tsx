import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, DoorOpen, FilePlus2, FileSignature, FolderLock, HandCoins, MessageSquarePlus, ScrollText, Zap } from "lucide-react";
import { Tr } from "./ai-translate";
import { ResignationForm } from "./resignation-form";
import type { ResignationContext } from "@/lib/resignation";
import { SubmitButton } from "@/components/submit-button";
import { ToneBadge, fieldClass } from "@/components/ui";
import { pick, type Bi } from "@/lib/i18n";
import { LETTER_KIND, REQUEST_LETTER_KINDS } from "@/lib/letters";
import { MAX_ADVANCE_INSTALLMENTS, REQUEST_STATUS, RESIGNATION_NOTICE_DAYS, requestTitle } from "@/lib/requests";
import { formatDate, money, toDateInput } from "@/lib/utils";
import { cancelEmployeeRequest, submitEmployeeRequest } from "@/server/employee-request-actions";

export type PortalRequest = {
  id: string;
  type: string;
  letterKind: string | null;
  subject: string | null;
  details: string | null;
  addressee: string | null;
  lastDay: Date | null;
  amount: number | null;
  installments: number | null;
  status: string;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  letter: { token: string; refNo: string; cancelledAt: Date | null } | null;
  refNo?: string | null;
  approvedLastDay?: Date | null;
  dueBack?: Date | null;
  custodyForm?: { id: string; refNo: string } | null;
};

const LETTER_HINT: Partial<Record<string, Bi>> = {
  SALARY_CERTIFICATE: { ar: "تُظهر راتبك الإجمالي وتفاصيله، للبنوك والسفارات والجهات الحكومية.", en: "Shows your gross pay and breakdown, for banks, embassies and government offices." },
  EMPLOYMENT_CERTIFICATE: { ar: "تعريف ببياناتك ووظيفتك وتاريخ التحاقك، دون ذكر الراتب.", en: "Confirms your details, job and joining date, without pay." },
  EXPERIENCE_CERTIFICATE: { ar: "تثبت مدة عملك ووظيفتك.", en: "Confirms how long you have worked here and your job." },
  SALARY_TRANSFER: { ar: "لطلب تمويل أو بطاقة؛ تتعهد فيها المنشأة بتحويل راتبك إلى بنكك المسجّل في ملفك.", en: "For a loan or card; the company commits to paying your salary into the bank on your file." },
  BANK_ACCOUNT: {
    ar: "لفتح حساب جديد لراتبك؛ اكتب اسم البنك في «موجّه إلى». يتضمن عنوانك وعنوان المنشأة.",
    en: "To open a new salary account; write the bank in “Addressed to”. Includes your address and the company's.",
  },
  EMBASSY: { ar: "لطلب تأشيرة؛ اكتب في «موجّه إلى» اسم السفارة، وفي التفاصيل وجهة السفر وتواريخه.", en: "For a visa; write the embassy in “Addressed to” and the destination and dates in the details." },
  NOC: { ar: "اكتب في التفاصيل الغرض، مثل السفر أو استخراج رخصة.", en: "Write the purpose in the details, e.g. travel or a licence." },
  CLEARANCE: { ar: "تثبت أنك سلّمت كل عهد المنشأة؛ تصدر فقط إذا لم يبقَ بعهدتك شيء.", en: "Confirms you returned all company assets; issued only when you hold none." },
  GENERAL: { ar: "أي خطاب آخر؛ اكتب موضوعه وتفاصيله.", en: "Any other letter; write its subject and details." },
};

export function PortalRequests({
  token,
  requests,
  currency,
  lang,
  t,
  autoKinds = [],
  resignationContext,
}: {
  token: string;
  requests: PortalRequest[];
  currency: string;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
  /** Letter kinds the company issues at once, without waiting for approval. */
  autoKinds?: readonly string[];
  /** Who resigns from whom, for the ready resignation wordings. */
  resignationContext: Omit<ResignationContext, "lastDay">;
}) {
  const resignation = requests.find((request) => request.type === "RESIGNATION" && (request.status === "PENDING" || request.status === "APPROVED"));
  const defaultLastDay = new Date(Date.now() + RESIGNATION_NOTICE_DAYS * 86400000);
  const label = (text: string) => <span className="text-sm font-medium text-slate-700">{text}</span>;
  const block = (Icon: LucideIcon, title: string, children: React.ReactNode, open = false) => (
    <details className="group rounded-2xl border border-slate-200 p-3 sm:p-4" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
        <Icon size={16} />
        {title}
      </summary>
      {children}
    </details>
  );

  return (
    <div className="space-y-3">
      {block(
        FilePlus2,
        t("طلب خطاب أو شهادة", "Request a letter or certificate"),
        <form action={submitEmployeeRequest} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="type" value="LETTER" />
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-slate-700">{t("نوع الخطاب", "Letter type")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REQUEST_LETTER_KINDS.map((kind, index) => (
                <label
                  key={kind}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface p-3 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 has-[:checked]:bg-teal-50/60 has-[:checked]:ring-teal-300"
                >
                  <input type="radio" name="letterKind" value={kind} defaultChecked={index === 0} className="mt-1 accent-teal-700" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {kind === "GENERAL" ? t("خطاب آخر", "Another letter") : pick(LETTER_KIND[kind].label, lang)}
                      {autoKinds.includes(kind) ? (
                        <span className="ms-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 align-middle text-[0.7rem] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Zap size={11} />
                          {t("يصدر فوراً", "Instant")}
                        </span>
                      ) : null}
                    </span>
                    {LETTER_HINT[kind] ? <span className="mt-0.5 block text-xs leading-5 text-slate-500">{pick(LETTER_HINT[kind]!, lang)}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1.5">
            {label(t("موجّه إلى (اختياري)", "Addressed to (optional)"))}
            <input className={`${fieldClass} w-full`} name="addressee" maxLength={160} placeholder={t("مثال: بنك مسقط، أو سفارة …", "e.g. Bank Muscat, or the … embassy")} />
          </label>
          <label className="block space-y-1.5">
            {label(t("موضوع الخطاب (للخطاب الآخر)", "Subject (for another letter)"))}
            <input className={`${fieldClass} w-full`} name="subject" maxLength={120} />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            {label(t("التفاصيل أو الغرض", "Details or purpose"))}
            <textarea className={`${fieldClass} min-h-20 w-full`} name="details" maxLength={2000} />
          </label>
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 sm:col-span-2">
            <BadgeCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            {autoKinds.length
              ? t(
                  "الخطابات المعلّمة «يصدر فوراً» تصدر موقّعة إلكترونياً لحظة الطلب من بيانات ملفك؛ والبقية بعد اعتماد الإدارة. كل خطاب يحمل رمز QR تتحقق به أي جهة من أنه أصلي.",
                  "Letters marked “Instant” are issued e-signed the moment you ask, from your file; the rest after management approves. Every letter carries a QR code anyone can scan to confirm it is authentic.",
                )
              : t(
                  "بعد اعتماد الإدارة يصدر الخطاب موقّعاً إلكترونياً مع رمز QR، ويظهر هنا لتحميله. أي جهة تمسح الرمز تتأكد أنه أصلي.",
                  "Once management approves, the letter is issued e-signed with a QR code and appears here to download. Anyone who scans the code can confirm it is authentic.",
                )}
          </p>
          <div className="sm:col-span-2">
            <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
              {t("إرسال الطلب", "Send request")}
            </SubmitButton>
          </div>
        </form>,
        requests.length === 0,
      )}

      {block(
        HandCoins,
        t("طلب سلفة", "Request a salary advance"),
        <form action={submitEmployeeRequest} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="type" value="ADVANCE" />
          <label className="block space-y-1.5">
            {label(`${t("المبلغ", "Amount")} (${currency})`)}
            <input className={`${fieldClass} w-full`} name="amount" type="number" inputMode="decimal" step="0.001" min="0.001" required dir="ltr" />
          </label>
          <label className="block space-y-1.5">
            {label(t("عدد الأقساط الشهرية", "Monthly instalments"))}
            <input className={`${fieldClass} w-full`} name="installments" type="number" min="1" max={MAX_ADVANCE_INSTALLMENTS} defaultValue={1} required dir="ltr" />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            {label(t("السبب", "Reason"))}
            <input className={`${fieldClass} w-full`} name="details" maxLength={500} />
          </label>
          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t("بعد الاعتماد تُخصم الأقساط تلقائياً من رواتبك القادمة.", "Once approved, instalments are deducted from your coming salaries automatically.")}</p>
          <div className="sm:col-span-2">
            <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
              {t("إرسال الطلب", "Send request")}
            </SubmitButton>
          </div>
        </form>,
      )}

      {block(
        MessageSquarePlus,
        t("طلب آخر", "Other request"),
        <form action={submitEmployeeRequest} className="mt-3 grid gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="type" value="OTHER" />
          <label className="block space-y-1.5">
            {label(t("عنوان الطلب", "Request title"))}
            <input className={`${fieldClass} w-full`} name="subject" required maxLength={120} placeholder={t("مثال: تعديل بياناتي البنكية، نقل إلى فرع آخر…", "e.g. update my bank details, transfer to another branch…")} />
          </label>
          <label className="block space-y-1.5">
            {label(t("التفاصيل", "Details"))}
            <textarea className={`${fieldClass} min-h-24 w-full`} name="details" required maxLength={2000} />
          </label>
          <div>
            <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
              {t("إرسال الطلب", "Send request")}
            </SubmitButton>
          </div>
        </form>,
      )}

      {resignation
        ? null
        : block(
            DoorOpen,
            t("تقديم استقالة موقّعة إلكترونياً", "Submit an e-signed resignation"),
            <ResignationForm
              token={token}
              lang={lang}
              context={resignationContext}
              defaultLastDay={toDateInput(defaultLastDay)}
              minDay={toDateInput(new Date())}
              noticeDays={RESIGNATION_NOTICE_DAYS}
            />,
          )}

      {requests.length ? (
        <div className="pt-2">
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t("طلباتي", "My requests")}</h3>
          <ul className="space-y-2">
            {requests.map((request) => {
              const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.PENDING;
              return (
                <li key={request.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-900">{pick(requestTitle(request), lang)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t("قُدّم", "Sent")} {formatDate(request.createdAt)}
                        {request.approvedLastDay || request.lastDay ? ` · ${t("آخر يوم عمل", "Last day")} ${formatDate(request.approvedLastDay || request.lastDay)}` : ""}
                        {request.amount ? ` · ${money(request.amount, currency)} × ${request.installments || 1}` : ""}
                        {request.addressee ? ` · ${t("إلى", "To")} ${request.addressee}` : ""}
                        {request.dueBack ? ` · ${t("الإعادة", "Return by")} ${formatDate(request.dueBack)}` : ""}
                      </p>
                    </div>
                    <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
                  </div>
                  {request.details ? (
                    <p className="mt-1.5 whitespace-pre-line break-words text-xs text-slate-600">
                      <Tr text={request.details} />
                    </p>
                  ) : null}
                  {request.decisionNote ? (
                    <p className="mt-1.5 break-words text-xs text-slate-600">
                      {t("ملاحظة الإدارة:", "Note from HR:")} <Tr text={request.decisionNote} />
                    </p>
                  ) : null}
                  {request.letter && !request.letter.cancelledAt ? (
                    <Link href={`/letter/${request.letter.token}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 underline-offset-4 hover:underline">
                      <ScrollText size={15} />
                      {t(`فتح الخطاب ${request.letter.refNo} وتحميله`, `Open and download letter ${request.letter.refNo}`)}
                    </Link>
                  ) : null}
                  {request.type === "RESIGNATION" ? (
                    <Link href={`/portal/${token}/resignation/${request.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 underline-offset-4 hover:underline">
                      <FileSignature size={15} />
                      {request.refNo ? t(`استقالتي الموقّعة ${request.refNo} — عرض وطباعة`, `My signed resignation ${request.refNo} — view and print`) : t("عرض الاستقالة وطباعتها", "View and print the resignation")}
                    </Link>
                  ) : null}
                  {request.custodyForm ? (
                    <Link href={`/portal/${token}/custody/${request.custodyForm.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 underline-offset-4 hover:underline">
                      <FolderLock size={15} />
                      {t(`استمارة التسليم ${request.custodyForm.refNo} — أقرّ بالاستلام`, `Handover form ${request.custodyForm.refNo} — acknowledge receipt`)}
                    </Link>
                  ) : null}
                  {request.status === "PENDING" ? (
                    <form action={cancelEmployeeRequest} className="mt-2">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="id" value={request.id} />
                      <SubmitButton variant="link" confirm={t("إلغاء هذا الطلب؟", "Cancel this request?")}>
                        {t("إلغاء الطلب", "Cancel request")}
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
