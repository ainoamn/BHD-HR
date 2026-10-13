import Link from "next/link";
import { Check, PenLine, X } from "lucide-react";
import { Tr } from "./ai-translate";
import { SubmitButton } from "@/components/submit-button";
import { ToneBadge, fieldClass, secondaryBtn } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { LETTER_KIND, type LetterKind } from "@/lib/letters";
import { PERMISSION_TEXT, REQUEST_TYPE, canDecideRequest, requestPermissions, requestTitle, type RequestType } from "@/lib/requests";
import { formatDate, formatDateTime, money, toDateInput } from "@/lib/utils";
import { decideEmployeeRequest } from "@/server/employee-request-actions";

const TYPE_TONE: Record<string, string> = { LETTER: "teal", RESIGNATION: "red", ADVANCE: "gold", OTHER: "slate" };

export type PendingEmployeeRequest = {
  id: string;
  type: string;
  letterKind: string | null;
  subject: string | null;
  details: string | null;
  addressee: string | null;
  lastDay: Date | null;
  amount: number | null;
  installments: number | null;
  createdAt: Date;
  employee: { id: string; fullName: string; nameEn: string | null; employeeNumber: string; joiningDate: Date | null; bankAccount: string | null };
};

function nextMonthInput() {
  const now = new Date();
  const month = now.getUTCMonth() + 2;
  const year = month > 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${year}-${String(month > 12 ? 1 : month).padStart(2, "0")}`;
}

/** One pending request on the approvals page, with the decision form that fits its type. */
export function EmployeeRequestCard({
  request,
  user,
  lang,
  t,
  currency,
}: {
  request: PendingEmployeeRequest;
  user: { permissions: readonly string[] };
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
  currency: string;
}) {
  const type = request.type as RequestType;
  const meta = REQUEST_TYPE[type] || REQUEST_TYPE.OTHER;
  const letterMeta = request.letterKind ? LETTER_KIND[request.letterKind as LetterKind] : null;
  const written = type === "LETTER" && request.letterKind === "GENERAL";
  const decide = canDecideRequest(user, request);
  const name = lang === "en" && request.employee.nameEn ? request.employee.nameEn : request.employee.fullName;
  const missingBank = request.letterKind === "SALARY_TRANSFER" && !request.employee.bankAccount;
  const label = (text: string) => <span>{text}</span>;
  const approveLabel =
    type === "LETTER"
      ? t("اعتماد وإصدار الخطاب موقّعاً", "Approve and issue signed letter")
      : type === "RESIGNATION"
        ? t("قبول الاستقالة", "Accept resignation")
        : type === "ADVANCE"
          ? t("اعتماد السلفة", "Approve advance")
          : t("اعتماد", "Approve");

  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/employees/${request.employee.id}`} className="font-bold text-slate-900 hover:text-teal-700">
            {name}
          </Link>
          <span className="tabular ms-2 text-xs text-slate-400">{request.employee.employeeNumber}</span>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <ToneBadge tone={TYPE_TONE[type] || "slate"}>{pick(meta.label, lang)}</ToneBadge>
            <span className="font-semibold">{pick(requestTitle(request), lang)}</span>
          </p>
          <div className="mt-1 space-y-0.5 text-sm text-slate-600">
            {request.addressee ? (
              <p>
                {t("موجّه إلى:", "Addressed to:")} {request.addressee}
              </p>
            ) : null}
            {request.lastDay ? (
              <p>
                {t("آخر يوم عمل مقترح:", "Proposed last day:")} <strong>{formatDate(request.lastDay)}</strong>
                {request.employee.joiningDate ? ` · ${t("التحق", "Joined")} ${formatDate(request.employee.joiningDate)}` : ""}
              </p>
            ) : null}
            {request.amount ? (
              <p>
                {t("المبلغ:", "Amount:")} <strong className="tabular">{money(request.amount, currency)}</strong> · {request.installments || 1} {t("قسط", "instalment(s)")}
              </p>
            ) : null}
            {request.details ? (
              <p className="whitespace-pre-line break-words">
                <Tr text={request.details} />
              </p>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {t("أُرسل", "Sent")} {formatDateTime(request.createdAt)}
          </p>
        </div>
      </div>

      {!decide ? (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {t("يحتاج البتّ فيه صلاحية:", "Deciding it needs:")} {requestPermissions(request).map((permission) => pick(PERMISSION_TEXT[permission], lang, permission)).join("، ")}
        </p>
      ) : (
        <form action={decideEmployeeRequest} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="returnTo" value="/approvals#requests" />
          {type === "LETTER" && !written && letterMeta?.document ? (
            <label className="block min-w-0 space-y-1 text-xs text-slate-500">
              {label(request.letterKind === "SALARY_TRANSFER" ? t("اسم البنك (إن لم يُحدد في الملف)", "Bank (if not in the file)") : t("موجّه إلى (فارغ = إلى من يهمه الأمر)", "Addressed to (empty = to whom it may concern)"))}
              <input className={`${fieldClass} w-full`} name="addressee" defaultValue={request.addressee || ""} maxLength={160} />
            </label>
          ) : null}
          {type === "RESIGNATION" ? (
            <label className="block min-w-0 space-y-1 text-xs text-slate-500">
              {label(t("آخر يوم عمل معتمد", "Approved last working day"))}
              <input className={`${fieldClass} w-full`} type="date" name="lastDay" defaultValue={toDateInput(request.lastDay)} required />
            </label>
          ) : null}
          {type === "ADVANCE" ? (
            <>
              <label className="block min-w-0 space-y-1 text-xs text-slate-500">
                {label(`${t("المبلغ المعتمد", "Approved amount")} (${currency})`)}
                <input className={`${fieldClass} w-full`} type="number" step="0.001" min="0.001" name="amount" defaultValue={request.amount || ""} dir="ltr" />
              </label>
              <label className="block min-w-0 space-y-1 text-xs text-slate-500">
                {label(t("عدد الأقساط", "Instalments"))}
                <input className={`${fieldClass} w-full`} type="number" min="1" max="120" name="installments" defaultValue={request.installments || 1} dir="ltr" />
              </label>
              <label className="block min-w-0 space-y-1 text-xs text-slate-500">
                {label(t("أول قسط في راتب شهر", "First instalment in the salary of"))}
                <input className={`${fieldClass} w-full`} type="month" name="start" defaultValue={nextMonthInput()} dir="ltr" />
              </label>
            </>
          ) : null}
          <label className="block min-w-0 space-y-1 text-xs text-slate-500 sm:col-span-2">
            {label(t("ملاحظة للموظف (اختياري)", "Note to the employee (optional)"))}
            <input className={`${fieldClass} w-full`} name="decisionNote" maxLength={500} />
          </label>
          {missingBank ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 sm:col-span-2">
              {t("لا يوجد رقم حساب بنكي في ملف الموظف؛ أضفه أولاً ثم اعتمد.", "The employee's file has no bank account; add it first, then approve.")}{" "}
              <Link href={`/employees/${request.employee.id}/edit`} className="font-bold underline underline-offset-2">
                {t("تعديل الملف", "Edit file")}
              </Link>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {written ? (
              <Link href={`/letters/new?requestId=${request.id}`} className={secondaryBtn}>
                <PenLine size={16} />
                {t("كتابة الخطاب واعتماده", "Write and approve the letter")}
              </Link>
            ) : (
              <SubmitButton
                name="decision"
                value="approve"
                pendingLabel={t("جارٍ الاعتماد...", "Approving...")}
                confirm={type === "RESIGNATION" ? t("قبول الاستقالة؟ يُسجَّل آخر يوم عمل كتاريخ انتهاء العقد ويصدر خطاب القبول.", "Accept the resignation? The last day becomes the contract end date and the acceptance letter is issued.") : undefined}
              >
                <Check size={16} />
                {approveLabel}
              </SubmitButton>
            )}
            {type === "LETTER" && !written ? (
              <Link href={`/letters/new?requestId=${request.id}`} className={secondaryBtn}>
                <PenLine size={16} />
                {t("مراجعة قبل الإصدار", "Review before issuing")}
              </Link>
            ) : null}
            <SubmitButton name="decision" value="reject" variant="danger" confirm={t("رفض هذا الطلب؟", "Reject this request?")}>
              <X size={16} />
              {t("رفض", "Reject")}
            </SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}
