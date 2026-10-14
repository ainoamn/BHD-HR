import type { PayrollPeriod } from "@prisma/client";
import { CheckCircle2, ClipboardCheck, Lock, LockOpen, Send, Undo2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Card, ToneBadge, fieldClass } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/i18n";
import { PERIOD_LABEL, PERIOD_STATUSES, PERIOD_TONE, nextStatus, readStatus, type PeriodMove } from "@/lib/payroll-period";
import { cn, formatDateTime } from "@/lib/utils";
import { movePayrollPeriod } from "@/server/payroll-period-actions";

/** Status and next steps of a month's payroll approval, on the payroll page. */
export function PayrollPeriodBar({
  period,
  year,
  month,
  employerId,
  approvalRequired,
  allow,
  unpaidCount,
  salaryCount,
  lang,
}: {
  period: PayrollPeriod | null;
  year: number;
  month: number;
  employerId: string;
  approvalRequired: boolean;
  allow: { edit: boolean; pay: boolean; admin: boolean };
  unpaidCount: number;
  salaryCount: number;
  lang: Lang;
}) {
  const t = makeT(lang);
  const status = readStatus(period?.status);
  const steps = PERIOD_STATUSES.filter((step) => approvalRequired || (step !== "REVIEW" && step !== "APPROVED") || status === step);
  const reached = PERIOD_STATUSES.indexOf(status);
  const moves: { move: PeriodMove; label: string; icon: typeof Send; variant: "primary" | "secondary"; show: boolean; confirm?: string; note?: "optional" | "required" }[] = [
    { move: "submit", label: t("إرسال للمراجعة", "Send for review"), icon: Send, variant: "primary", show: allow.edit && salaryCount > 0 },
    { move: "approve", label: t("اعتماد المسير", "Approve payroll"), icon: ClipboardCheck, variant: "primary", show: allow.pay },
    {
      move: "lock",
      label: t("قفل الشهر", "Lock month"),
      icon: Lock,
      variant: status === "APPROVED" ? "primary" : "secondary",
      show: allow.pay && salaryCount > 0 && unpaidCount === 0,
      confirm: t("بعد القفل لا يمكن تعديل رواتب هذا الشهر أو إلغاء صرفها، والفروقات تُسجّل تصحيحاً في شهر لاحق. متابعة؟", "After locking, this month's salaries cannot be edited or unpaid; differences are recorded as corrections in a later month. Continue?"),
    },
    { move: "return", label: t("إعادة إلى مسودة", "Return to draft"), icon: Undo2, variant: "secondary", show: allow.edit || allow.pay, note: "optional" },
    { move: "unlock", label: t("فك القفل", "Unlock"), icon: LockOpen, variant: "secondary", show: allow.admin, note: "required" },
  ];
  const available = moves.filter((item) => item.show && nextStatus(status, item.move, approvalRequired));
  const stamps = [
    period?.submittedAt ? t(`أُرسل للمراجعة: ${period.submittedBy || ""} ${formatDateTime(period.submittedAt)}`, `Sent for review: ${period.submittedBy || ""} ${formatDateTime(period.submittedAt)}`) : null,
    period?.approvedAt ? t(`اعتُمد: ${period.approvedBy || ""} ${formatDateTime(period.approvedAt)}`, `Approved: ${period.approvedBy || ""} ${formatDateTime(period.approvedAt)}`) : null,
    period?.lockedAt && status === "LOCKED" ? t(`أُقفل: ${period.lockedBy || ""} ${formatDateTime(period.lockedAt)}`, `Locked: ${period.lockedBy || ""} ${formatDateTime(period.lockedAt)}`) : null,
  ].filter(Boolean);

  return (
    <Card className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="font-bold text-slate-900">{t("اعتماد مسير الشهر", "Month payroll approval")}</h2>
          <ToneBadge tone={PERIOD_TONE[status]}>{PERIOD_LABEL[status][lang]}</ToneBadge>
        </div>
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs" aria-label={t("مراحل الاعتماد", "Approval steps")}>
          {steps.map((step, index) => {
            const done = PERIOD_STATUSES.indexOf(step) <= reached;
            return (
              <li key={step} className="flex items-center gap-1.5">
                {index ? <span className="h-px w-4 bg-slate-200" aria-hidden="true" /> : null}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset",
                    done ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-50 text-slate-500 ring-slate-200",
                  )}
                  aria-current={step === status ? "step" : undefined}
                >
                  {done ? <CheckCircle2 size={12} /> : null}
                  {PERIOD_LABEL[step][lang]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {status === "LOCKED"
          ? t("الشهر مقفل: لا تعديل ولا إلغاء صرف. أي فرق يُسجّل من صفحة الراتب كتصحيح يُطبّق في أول شهر مفتوح.", "The month is locked: no edits or unpaying. Record any difference from the salary page as a correction applied in the first open month.")
          : status === "DRAFT"
            ? approvalRequired
              ? t("المسودة قابلة للتعديل. أرسلها للمراجعة، وبعد الاعتماد يُسمح بالصرف، ثم اقفل الشهر.", "The draft can be edited. Send it for review; once approved it can be paid, then lock the month.")
              : t("المسودة قابلة للتعديل والصرف. بعد صرف كل الرواتب اقفل الشهر لحمايته من أي تغيير.", "The draft can be edited and paid. Once every salary is paid, lock the month to protect it from changes.")
            : status === "REVIEW"
              ? t("التعديل موقوف حتى الاعتماد أو الإعادة إلى مسودة.", "Editing is paused until it is approved or returned to draft.")
              : t("معتمد: يمكن الصرف، والتعديل يحتاج إعادته إلى مسودة.", "Approved: salaries can be paid; edits need a return to draft.")}
        {status === "LOCKED" || !unpaidCount ? "" : t(` غير المصروف: ${unpaidCount}.`, ` Unpaid: ${unpaidCount}.`)}
      </p>
      {stamps.length || period?.note ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {stamps.map((stamp) => (
            <li key={stamp}>{stamp}</li>
          ))}
          {period?.note ? <li className="text-slate-700">{t(`ملاحظة: ${period.note}`, `Note: ${period.note}`)}</li> : null}
        </ul>
      ) : null}
      {available.length ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          {available.map((item) => {
            const Icon = item.icon;
            return (
              <form key={item.move} action={movePayrollPeriod} className="flex min-w-0 flex-wrap items-end gap-2">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="employerId" value={employerId} />
                <input type="hidden" name="move" value={item.move} />
                {item.note ? (
                  <input
                    className={`${fieldClass} w-56 max-w-full`}
                    name="note"
                    required={item.note === "required"}
                    placeholder={item.note === "required" ? t("سبب فك القفل (مطلوب)", "Reason for unlocking (required)") : t("السبب (اختياري)", "Reason (optional)")}
                    aria-label={t("السبب", "Reason")}
                  />
                ) : null}
                <SubmitButton variant={item.variant} confirm={item.confirm}>
                  <Icon size={16} />
                  {item.label}
                </SubmitButton>
              </form>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
