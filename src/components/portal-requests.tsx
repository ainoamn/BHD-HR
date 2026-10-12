import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, DoorOpen, FilePlus2, HandCoins, MessageSquarePlus, ScrollText } from "lucide-react";
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
};

const LETTER_HINT: Partial<Record<string, Bi>> = {
  SALARY_CERTIFICATE: { ar: "تُظهر راتبك الإجمالي وتفاصيله، للبنوك والسفارات والجهات الحكومية.", en: "Shows your gross pay and breakdown, for banks, embassies and government offices." },
  EMPLOYMENT_CERTIFICATE: { ar: "تعريف ببياناتك ووظيفتك وتاريخ التحاقك، دون ذكر الراتب.", en: "Confirms your details, job and joining date, without pay." },
  EXPERIENCE_CERTIFICATE: { ar: "تثبت مدة عملك ووظيفتك.", en: "Confirms how long you have worked here and your job." },
  SALARY_TRANSFER: { ar: "لفتح حساب أو طلب تمويل؛ تتعهد فيها المنشأة بتحويل راتبك إلى بنكك المسجّل في ملفك.", en: "For opening an account or a loan; the company commits to paying your salary into the bank on your file." },
  NOC: { ar: "اكتب في التفاصيل الغرض، مثل السفر أو استخراج رخصة.", en: "Write the purpose in the details, e.g. travel or a licence." },
  GENERAL: { ar: "أي خطاب آخر؛ اكتب موضوعه وتفاصيله.", en: "Any other letter; write its subject and details." },
};

export function PortalRequests({
  token,
  requests,
  currency,
  lang,
  t,
}: {
  token: string;
  requests: PortalRequest[];
  currency: string;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
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
                    <span className="block text-sm font-semibold text-slate-900">{kind === "GENERAL" ? t("خطاب آخر", "Another letter") : pick(LETTER_KIND[kind].label, lang)}</span>
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
            {t(
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
            t("تقديم استقالة", "Submit a resignation"),
            <form action={submitEmployeeRequest} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="type" value="RESIGNATION" />
              <label className="block space-y-1.5">
                {label(t("آخر يوم عمل مقترح", "Proposed last working day"))}
                <input className={`${fieldClass} w-full`} type="date" name="lastDay" required defaultValue={toDateInput(defaultLastDay)} />
              </label>
              <p className="self-end text-xs leading-5 text-slate-500">
                {t(`فترة الإشعار المعتادة ${RESIGNATION_NOTICE_DAYS} يوماً وفق قانون العمل، وتحددها الإدارة عند القبول.`, `The usual notice is ${RESIGNATION_NOTICE_DAYS} days under the Labour Law; management sets it when accepting.`)}
              </p>
              <label className="block space-y-1.5 sm:col-span-2">
                {label(t("السبب (اختياري)", "Reason (optional)"))}
                <textarea className={`${fieldClass} min-h-20 w-full`} name="details" maxLength={2000} />
              </label>
              <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200 sm:col-span-2">
                <input type="checkbox" name="confirm" value="1" required className="mt-1 accent-amber-700" />
                {t("أقدّم استقالتي من العمل برغبتي، وأعلم أنها تُرفع إلى الإدارة للاعتماد.", "I am resigning of my own will, and I understand it goes to management for approval.")}
              </label>
              <div className="sm:col-span-2">
                <SubmitButton variant="danger" className="w-full sm:w-auto" confirm={t("تقديم الاستقالة إلى الإدارة؟", "Send your resignation to management?")} pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                  {t("تقديم الاستقالة", "Submit resignation")}
                </SubmitButton>
              </div>
            </form>,
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
                        {request.lastDay ? ` · ${t("آخر يوم عمل", "Last day")} ${formatDate(request.lastDay)}` : ""}
                        {request.amount ? ` · ${money(request.amount, currency)} × ${request.installments || 1}` : ""}
                        {request.addressee ? ` · ${t("إلى", "To")} ${request.addressee}` : ""}
                      </p>
                    </div>
                    <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
                  </div>
                  {request.details ? <p className="mt-1.5 line-clamp-3 whitespace-pre-line break-words text-xs text-slate-600">{request.details}</p> : null}
                  {request.decisionNote ? (
                    <p className="mt-1.5 break-words text-xs text-slate-600">
                      {t("ملاحظة الإدارة:", "Note from HR:")} {request.decisionNote}
                    </p>
                  ) : null}
                  {request.letter && !request.letter.cancelledAt ? (
                    <Link href={`/letter/${request.letter.token}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 underline-offset-4 hover:underline">
                      <ScrollText size={15} />
                      {t(`فتح الخطاب ${request.letter.refNo} وتحميله`, `Open and download letter ${request.letter.refNo}`)}
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
