import Link from "next/link";
import type { PayItem } from "@prisma/client";
import { HandCoins, Pencil, Printer } from "lucide-react";
import { PAYMENT_LABEL, PAY_KIND_LABEL, PAY_KIND_TONE, monthName } from "@/lib/constants";
import { makeT, pick, type Lang } from "@/lib/i18n";
import { keyToPeriod, payItemProgress, type PayItemStatus } from "@/lib/pay-items";
import { formatDate, money } from "@/lib/utils";
import { deletePayItem, savePayItem, togglePayItem } from "@/server/pay-item-actions";
import { PayItemForm } from "./pay-item-form";
import { DeleteButton } from "./row-forms";
import { SubmitButton } from "./submit-button";
import { ToneBadge } from "./ui";

export type ListedPayItem = PayItem & {
  employee: { id: string; fullName: string; nameEn: string | null; employeeNumber: string };
  lines: { amount: number; salary: { year: number; month: number; paid: boolean } }[];
};

const STATUS: Record<PayItemStatus, { ar: string; en: string; tone: string }> = {
  SCHEDULED: { ar: "مجدول", en: "Scheduled", tone: "sky" },
  ACTIVE: { ar: "ساري", en: "Active", tone: "green" },
  DONE: { ar: "منتهٍ", en: "Finished", tone: "slate" },
  STOPPED: { ar: "موقوف", en: "Stopped", tone: "slate" },
};

function period(key: number, lang: Lang) {
  const { year, month } = keyToPeriod(key);
  return `${monthName(month, lang)} ${year}`;
}

export function PayItemsList({
  items,
  lang,
  currency,
  nowKey,
  returnTo,
  allow,
  showEmployee,
  today,
  defaultStart,
}: {
  items: ListedPayItem[];
  lang: Lang;
  currency: string;
  nowKey: number;
  returnTo: string;
  allow: { edit: boolean; remove: boolean };
  showEmployee: boolean;
  today: string;
  defaultStart: string;
}) {
  const t = makeT(lang);
  if (!items.length)
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <HandCoins size={22} />
        </span>
        <p className="mt-3 text-sm text-slate-500">{t("لا توجد بنود.", "No items.")}</p>
      </div>
    );
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const progress = payItemProgress(item, nowKey);
        const advance = item.kind === "ADVANCE";
        const status = advance && progress.status === "ACTIVE" ? { ar: "قيد السداد", en: "Being repaid", tone: "amber" } : advance && progress.status === "DONE" ? { ar: "مسدّدة", en: "Repaid", tone: "green" } : STATUS[progress.status];
        const name = lang === "en" && item.employee.nameEn ? item.employee.nameEn : item.employee.fullName;
        const schedule = advance
          ? t(
              `${item.months || 1} قسط × ${money(progress.instalment || 0, currency)} من راتب ${period(progress.start, lang)}`,
              `${item.months || 1} × ${money(progress.instalment || 0, currency)} from the ${period(progress.start, lang)} salary`,
            )
          : item.months === null
            ? t(`كل شهر من ${period(progress.start, lang)} حتى الإيقاف`, `Every month from ${period(progress.start, lang)} until stopped`)
            : item.months === 1
              ? t(`مرة واحدة — راتب ${period(progress.start, lang)}`, `Once — ${period(progress.start, lang)} salary`)
              : t(
                  `${item.months} أشهر: ${period(progress.start, lang)} — ${period(progress.end!, lang)}`,
                  `${item.months} months: ${period(progress.start, lang)} — ${period(progress.end!, lang)}`,
                );
        const percent = advance && item.amount > 0 ? Math.min(100, Math.round((progress.paidAmount / item.amount) * 100)) : 0;
        return (
          <li key={item.id} id={`item-${item.id}`} className="scroll-mt-24 py-5 first:pt-2 last:pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge tone={PAY_KIND_TONE[item.kind] || "slate"}>{pick(PAY_KIND_LABEL[item.kind], lang, item.kind)}</ToneBadge>
                  <span className="font-semibold text-slate-900">{item.title}</span>
                  <ToneBadge tone={status.tone}>{lang === "en" ? status.en : status.ar}</ToneBadge>
                </div>
                {showEmployee ? (
                  <Link href={`/employees/${item.employee.id}?tab=pay`} className="block text-sm font-semibold text-teal-700 hover:underline">
                    {name} — {item.employee.employeeNumber}
                  </Link>
                ) : null}
                <p className="text-sm text-slate-600">{schedule}</p>
                <p className="text-xs text-slate-500">
                  {advance ? t("سُلّمت", "Handed over") : t("اعتُمد", "Approved")} {formatDate(item.issuedAt)}
                  {item.paymentMethod ? ` — ${pick(PAYMENT_LABEL[item.paymentMethod], lang)}` : ""}
                  {item.createdByName ? ` — ${t("بواسطة", "by")} ${item.createdByName}` : ""}
                  {item.notes ? ` — ${item.notes}` : ""}
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-slate-50 px-3.5 py-2 text-end ring-1 ring-inset ring-slate-100">
                <p className={`tabular text-lg font-bold ${progress.deducts ? "text-red-700" : "text-emerald-700"}`}>
                  {progress.deducts ? "−" : "+"}
                  {money(item.amount, currency)}
                </p>
                <p className="text-xs text-slate-500">{advance ? t("إجمالي السلفة", "Total advance") : item.months === 1 ? t("مرة واحدة", "One time") : t("لكل شهر", "Per month")}</p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              {advance ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-gradient-to-l from-teal-500 to-teal-700 transition-[width] duration-300" style={{ width: `${percent}%` }} />
                  </div>
                  <p>
                    {t(
                      `سُدّد ${money(progress.paidAmount, currency)} من رواتب مصروفة — المتبقي ${money(progress.remaining || 0, currency)}`,
                      `Repaid ${money(progress.paidAmount, currency)} through paid salaries — ${money(progress.remaining || 0, currency)} left`,
                    )}
                    {item.stoppedAt && (progress.remaining || 0) > 0 ? t(" (أُعفي منه عند الإيقاف)", " (waived when stopped)") : ""}
                  </p>
                </>
              ) : (
                <p>
                  {t(
                    `طُبّق في ${progress.paidMonths} راتب مصروف بمجموع ${money(progress.paidAmount, currency)}`,
                    `Applied in ${progress.paidMonths} paid salary record(s), total ${money(progress.paidAmount, currency)}`,
                  )}
                </p>
              )}
              {progress.pendingAmount > 0 ? (
                <p className="text-amber-800">
                  {t(`${money(progress.pendingAmount, currency)} في رواتب لم تُصرف بعد`, `${money(progress.pendingAmount, currency)} in salaries not paid yet`)}
                </p>
              ) : null}
            </div>

            {advance ? (
              <Link href={`/pay-items/${item.id}/print`} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline">
                <Printer size={14} />
                {t("طباعة إيصال استلام السلفة", "Print advance receipt")}
              </Link>
            ) : null}

            {allow.edit || allow.remove ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {allow.edit ? (
                  <details className="group w-full open:order-last sm:w-auto open:sm:w-full">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 group-open:bg-slate-100 group-open:text-slate-600">
                      <Pencil size={13} />
                      {t("تعديل", "Edit")}
                    </summary>
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:max-w-2xl">
                      <PayItemForm
                        action={savePayItem}
                        returnTo={`${returnTo}#item-${item.id}`}
                        item={{
                          id: item.id,
                          kind: item.kind,
                          title: item.title,
                          amount: item.amount,
                          issuedAt: item.issuedAt,
                          startYear: item.startYear,
                          startMonth: item.startMonth,
                          months: item.months,
                          paymentMethod: item.paymentMethod,
                          notes: item.notes,
                        }}
                        today={today}
                        defaultStart={defaultStart}
                        currency={currency}
                      />
                    </div>
                  </details>
                ) : null}
                {allow.edit && progress.status !== "DONE" ? (
                  <form action={togglePayItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <SubmitButton
                      variant="link"
                      confirm={
                        item.stoppedAt
                          ? t("استئناف هذا البند وتطبيقه على الرواتب غير المصروفة؟", "Resume this item and apply it to unpaid salaries?")
                          : advance
                            ? t("إيقاف السلفة؟ لن يُخصم الباقي من الرواتب القادمة (إعفاء).", "Stop this advance? The rest will not be deducted (waived).")
                            : t("إيقاف هذا البند؟ لن يُطبّق على الرواتب غير المصروفة.", "Stop this item? It will not apply to unpaid salaries.")
                      }
                    >
                      {item.stoppedAt ? t("استئناف", "Resume") : advance ? t("إيقاف / إعفاء", "Stop / waive") : t("إيقاف", "Stop")}
                    </SubmitButton>
                  </form>
                ) : null}
                {allow.remove && progress.paidMonths === 0 ? (
                  <DeleteButton
                    action={deletePayItem}
                    fields={{ id: item.id, returnTo }}
                    confirm={t(`حذف «${item.title}»؟`, `Delete "${item.title}"?`)}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
