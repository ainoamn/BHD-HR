import Link from "next/link";
import { ChevronDown, Clock3, Plus, Receipt, Wallet } from "lucide-react";
import { ExpenseClaimCard } from "@/components/expense-claim";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Field, PageHeader, Stat, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { muscatDay } from "@/lib/clock";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from "@/lib/expenses";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { money, round3, todayInputValue } from "@/lib/utils";
import { addExpense } from "@/server/expense-actions";

const VIEWS = ["PENDING", "APPROVED", "PAID", "CLOSED"] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ view?: string; employeeId?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("expenses.view");
  const { lang, t } = await getI18n();
  const view = (VIEWS as readonly string[]).includes(sp.view || "") ? sp.view! : "PENDING";
  const allow = {
    create: can(user, "expenses.create"),
    decide: can(user, "expenses.edit"),
    pay: can(user, "expenses.pay"),
    salaryPay: can(user, "salaries.create"),
    remove: can(user, "expenses.delete"),
  };
  const [year, month] = muscatDay().split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 4 * 3600_000);
  const scope = { companyId: user.companyId, ...(sp.employeeId ? { employeeId: sp.employeeId } : {}) };
  const [grouped, paidThisMonth, claims, employees] = await Promise.all([
    prisma.expenseClaim.groupBy({ by: ["status"], where: scope, _count: true, _sum: { amount: true } }),
    prisma.expenseClaim.aggregate({ where: { ...scope, status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.expenseClaim.findMany({
      where: { ...scope, status: view === "CLOSED" ? { in: ["REJECTED", "CANCELLED"] } : view },
      include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
      orderBy: view === "PENDING" ? { createdAt: "asc" } : { updatedAt: "desc" },
      take: 100,
    }),
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const stat = (status: string) => grouped.find((item) => item.status === status);
  const currency = user.company.currency;
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const qs = (next: string) => `/expenses?view=${next}${sp.employeeId ? `&employeeId=${sp.employeeId}` : ""}`;
  const returnTo = qs(view);
  const tabs = [
    { id: "PENDING", label: t("بانتظار الموافقة", "Awaiting approval"), count: stat("PENDING")?._count },
    { id: "APPROVED", label: t("بانتظار الصرف", "To be paid"), count: stat("APPROVED")?._count },
    { id: "PAID", label: t("مصروفة", "Paid"), count: undefined },
    { id: "CLOSED", label: t("مرفوضة وملغاة", "Rejected & cancelled"), count: undefined },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={Receipt}
        title={t("المصروفات", "Expenses")}
        description={t(
          "مصروفات دفعها الموظفون لأجل العمل ويطلبون تعويضها — من البوابة أو تسجّلها الموارد البشرية. بعد الموافقة تُصرف مع الراتب كبند استحقاق، أو نقداً أو بتحويل.",
          "Money employees spent on work and claim back — from the portal or recorded by HR. Once approved it is paid with the salary as an entitlement, or by cash or transfer.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat icon={Clock3} tone="gold" label={t("بانتظار الموافقة", "Awaiting approval")} value={money(round3(stat("PENDING")?._sum.amount || 0), currency)} hint={t(`${stat("PENDING")?._count || 0} طلب`, `${stat("PENDING")?._count || 0} claim(s)`)} />
        <Stat icon={Wallet} tone="navy" label={t("معتمد بانتظار الصرف", "Approved, to be paid")} value={money(round3(stat("APPROVED")?._sum.amount || 0), currency)} hint={t(`${stat("APPROVED")?._count || 0} طلب`, `${stat("APPROVED")?._count || 0} claim(s)`)} />
        <div className="col-span-2 sm:col-span-1">
          <Stat icon={Receipt} label={t("صُرف هذا الشهر", "Paid this month")} value={money(round3(paidThisMonth._sum.amount || 0), currency)} />
        </div>
      </div>

      {allow.create ? (
        <details className="group mb-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-3 font-bold text-slate-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={18} />
              </span>
              {t("تسجيل مصروف لموظف", "Record an expense for an employee")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <form action={addExpense} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:grid-cols-2 sm:px-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <Field label={t("الموظف", "Employee")}>
              <select name="employeeId" required defaultValue={sp.employeeId || ""} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  {t("اختر الموظف", "Choose employee")}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {nameOf(employee)} — {employee.employeeNumber}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("النوع", "Category")}>
              <select name="category" defaultValue="TRAVEL" className={`${fieldClass} w-full`}>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {pick(EXPENSE_CATEGORY_LABEL[category], lang, category)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("الوصف", "Description")}>
                <input name="title" required maxLength={120} className={`${fieldClass} w-full`} placeholder={t("مثال: وقود رحلة عمل إلى صحار", "e.g. Fuel for a work trip to Sohar")} />
              </Field>
            </div>
            <Field label={`${t("المبلغ", "Amount")} (${currency})`}>
              <input name="amount" type="number" inputMode="decimal" step="0.001" min="0.001" required dir="ltr" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("تاريخ المصروف", "Date spent")}>
              <input name="spentAt" type="date" required defaultValue={todayInputValue()} className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("الإيصال (اختياري)", "Receipt (optional)")}>
              <input name="receipt" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={`${fieldClass} w-full`} />
            </Field>
            <Field label={t("ملاحظة", "Note")}>
              <input name="notes" maxLength={500} className={`${fieldClass} w-full`} />
            </Field>
            {allow.decide ? (
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" name="approve" value="1" defaultChecked className="size-4 accent-teal-700" />
                {t("معتمد مباشرة (سجّلته الإدارة)", "Approve right away (recorded by management)")}
              </label>
            ) : null}
            <div className="sm:col-span-2">
              <SubmitButton className="w-full sm:w-auto">{t("حفظ المصروف", "Save expense")}</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="segmented max-w-full overflow-x-auto" aria-label={t("الحالة", "Status")}>
          {tabs.map((tab) => (
            <Link key={tab.id} href={qs(tab.id)} aria-current={tab.id === view ? "page" : undefined}>
              {tab.label}
              {tab.count ? <span className="tabular ms-1 opacity-70">{tab.count}</span> : null}
            </Link>
          ))}
        </nav>
        <GetForm className="flex min-w-0 items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <select name="employeeId" defaultValue={sp.employeeId || ""} className={`${fieldClass} w-48 min-w-0`} aria-label={t("الموظف", "Employee")}>
            <option value="">{t("كل الموظفين", "All employees")}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {nameOf(employee)}
              </option>
            ))}
          </select>
          <button type="submit" className={secondaryBtn}>
            {t("عرض", "Show")}
          </button>
        </GetForm>
      </div>

      {claims.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={view === "PENDING" ? t("لا طلبات بانتظار الموافقة", "Nothing awaiting approval") : t("لا شيء هنا", "Nothing here")}
          text={t("يرسل الموظفون طلبات التعويض من بوابتهم مع صورة الإيصال، أو سجّلها أنت من «تسجيل مصروف لموظف».", "Employees send claims from their portal with a receipt photo, or record one yourself above.")}
        />
      ) : (
        <ul className="space-y-3">
          {claims.map((claim) => (
            <ExpenseClaimCard key={claim.id} claim={claim} lang={lang} currency={currency} allow={allow} returnTo={returnTo} />
          ))}
        </ul>
      )}
    </div>
  );
}
