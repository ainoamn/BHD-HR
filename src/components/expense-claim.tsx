import Link from "next/link";
import { Check, Paperclip, X } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { ToneBadge, fieldClass, linkAction } from "@/components/ui";
import { EXPENSE_CATEGORY_LABEL, EXPENSE_PAY_LABEL, EXPENSE_PAY_METHODS, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE } from "@/lib/expenses";
import { makeT, pick, type Lang } from "@/lib/i18n";
import { formatDate, formatDateTime, money } from "@/lib/utils";
import { decideExpense, deleteExpense, payExpense } from "@/server/expense-actions";

type Claim = {
  id: string;
  title: string;
  category: string;
  amount: number;
  spentAt: Date;
  receiptUrl: string | null;
  notes: string | null;
  source: string;
  status: string;
  decidedByName: string | null;
  decisionNote: string | null;
  payMethod: string | null;
  paidAt: Date | null;
  paidByName: string | null;
  createdAt: Date;
  employee?: { id: string; fullName: string; nameEn: string | null };
};

export type ClaimPermissions = { decide: boolean; pay: boolean; salaryPay: boolean; remove: boolean };

/** One expense claim with the next step for its status: approve or reject, then pay. */
export function ExpenseClaimCard({
  claim,
  lang,
  currency,
  allow,
  returnTo,
  employeeBase,
}: {
  claim: Claim;
  lang: Lang;
  currency: string;
  allow: ClaimPermissions;
  returnTo: string;
  /** Link prefix for the employee name; defaults to the HR employee page. */
  employeeBase?: string;
}) {
  const t = makeT(lang);
  const name = claim.employee ? (lang === "en" && claim.employee.nameEn ? claim.employee.nameEn : claim.employee.fullName) : null;
  const methods = EXPENSE_PAY_METHODS.filter((method) => method !== "SALARY" || allow.salaryPay);
  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          {name ? (
            <Link href={employeeBase ? `${employeeBase}${claim.employee!.id}` : `/employees/${claim.employee!.id}?tab=hr`} className="font-bold text-slate-900 hover:text-teal-700">
              {name}
            </Link>
          ) : null}
          <p className={name ? "mt-0.5 break-words text-slate-800" : "break-words font-bold text-slate-900"}>{claim.title}</p>
          <p className="mt-0.5 text-slate-500">
            <span className="tabular font-bold text-slate-900">{money(claim.amount, currency)}</span> · {pick(EXPENSE_CATEGORY_LABEL[claim.category], lang, claim.category)} · {formatDate(claim.spentAt)}
            {claim.source === "PORTAL" ? ` · ${t("من البوابة", "from the portal")}` : ""}
          </p>
          {claim.notes ? <p className="mt-1 break-words text-xs text-slate-500">{claim.notes}</p> : null}
          {claim.receiptUrl ? (
            <a href={claim.receiptUrl} target="_blank" className={`${linkAction} mt-1 text-xs`}>
              <Paperclip size={13} />
              {t("الإيصال", "Receipt")}
            </a>
          ) : null}
        </div>
        <ToneBadge tone={EXPENSE_STATUS_TONE[claim.status] || "slate"}>{pick(EXPENSE_STATUS_LABEL[claim.status], lang, claim.status)}</ToneBadge>
      </div>

      {claim.decidedByName || claim.decisionNote || claim.paidAt ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {claim.decidedByName ? `${claim.status === "REJECTED" ? t("رفضه", "Rejected by") : t("اعتمده", "Approved by")} ${claim.decidedByName}` : ""}
          {claim.decisionNote ? ` — ${claim.decisionNote}` : ""}
          {claim.paidAt && claim.payMethod ? ` · ${t("صُرف", "Paid")} ${pick(EXPENSE_PAY_LABEL[claim.payMethod], lang, claim.payMethod)} ${formatDateTime(claim.paidAt)}${claim.paidByName ? ` (${claim.paidByName})` : ""}` : ""}
        </p>
      ) : null}

      {claim.status === "PENDING" && allow.decide ? (
        <form action={decideExpense} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <input type="hidden" name="id" value={claim.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="block min-w-0 space-y-1 text-xs text-slate-500">
            <span>{t("ملاحظة للموظف (مطلوبة عند الرفض)", "Note to the employee (required to reject)")}</span>
            <input className={`${fieldClass} w-full`} name="note" maxLength={300} />
          </label>
          <SubmitButton name="decision" value="approve">
            <Check size={16} />
            {t("موافقة", "Approve")}
          </SubmitButton>
          <SubmitButton name="decision" value="reject" variant="danger" confirm={t("رفض هذا المصروف؟", "Reject this expense?")}>
            <X size={16} />
            {t("رفض", "Reject")}
          </SubmitButton>
        </form>
      ) : null}

      {claim.status === "APPROVED" && allow.pay ? (
        <form action={payExpense} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="id" value={claim.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="block min-w-0 space-y-1 text-xs text-slate-500">
            <span>{t("طريقة الصرف", "Pay by")}</span>
            <select name="method" defaultValue={methods[0]} className={`${fieldClass} w-full`}>
              {methods.map((method) => (
                <option key={method} value={method}>
                  {method === "SALARY" ? t("مع راتب الشهر غير المصروف القادم", "With the next unpaid salary") : pick(EXPENSE_PAY_LABEL[method], lang)}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton confirm={t(`صرف ${money(claim.amount, currency)}؟`, `Pay ${money(claim.amount, currency)}?`)}>{t("صرف", "Pay")}</SubmitButton>
        </form>
      ) : null}

      {allow.remove ? (
        <form action={deleteExpense} className="mt-2 text-end">
          <input type="hidden" name="id" value={claim.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton variant="link" confirm={t("حذف هذا المصروف نهائياً؟", "Delete this expense for good?")}>
            {t("حذف", "Delete")}
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}
