import { ChevronDown, Filter, HandCoins, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { PayItemForm } from "@/components/pay-item-form";
import { PayItemsList } from "@/components/pay-items-list";
import { Card, PageHeader, Stat, fieldClass, primaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { PAY_KINDS, PAY_KIND_LABEL, monthName } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { monthKey, payItemProgress } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { currentPeriod, money, round3, todayInputValue } from "@/lib/utils";
import { savePayItem } from "@/server/pay-item-actions";

export default async function PayItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; employeeId?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { lang, t } = await getI18n();
  const allow = { create: can(user, "salaries.create"), edit: can(user, "salaries.edit"), remove: can(user, "salaries.delete") };
  const currency = user.company.currency;
  const now = currentPeriod();
  const nowKey = monthKey(now.year, now.month);
  const defaultStart = `${now.year}-${String(now.month).padStart(2, "0")}`;
  const kind = (PAY_KINDS as readonly string[]).includes(sp.kind || "") ? sp.kind! : "";
  const status = ["open", "SCHEDULED", "ACTIVE", "DONE", "STOPPED", "all"].includes(sp.status || "") ? sp.status! : "open";

  const [all, employees] = await Promise.all([
    prisma.payItem.findMany({
      where: { companyId: user.companyId },
      include: {
        employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true } },
        lines: { select: { amount: true, salary: { select: { year: true, month: true, paid: true } } } },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const withProgress = all.map((item) => ({ item, progress: payItemProgress(item, nowKey) }));
  const shown = withProgress
    .filter(({ item }) => !kind || item.kind === kind)
    .filter(({ item }) => !sp.employeeId || item.employeeId === sp.employeeId)
    .filter(({ progress }) =>
      status === "all" ? true : status === "open" ? progress.status === "ACTIVE" || progress.status === "SCHEDULED" : progress.status === status,
    )
    .map(({ item }) => item);

  const open = withProgress.filter(({ progress }) => progress.status === "ACTIVE" || progress.status === "SCHEDULED");
  const advances = open.filter(({ item }) => item.kind === "ADVANCE");
  const outstanding = round3(advances.reduce((sum, { progress }) => sum + (progress.remaining || 0), 0));
  const monthAdd = round3(open.filter(({ progress }) => !progress.deducts).reduce((sum, { progress }) => sum + progress.thisMonth, 0));
  const monthDeduct = round3(open.filter(({ progress }) => progress.deducts).reduce((sum, { progress }) => sum + progress.thisMonth, 0));
  const thisMonth = `${monthName(now.month, lang)} ${now.year}`;
  const returnTo = `/pay-items?${new URLSearchParams({ ...(kind ? { kind } : {}), status, ...(sp.employeeId ? { employeeId: sp.employeeId } : {}) }).toString()}`;
  const label = (employee: { fullName: string; nameEn: string | null; employeeNumber: string }) =>
    `${lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName} — ${employee.employeeNumber}`;

  return (
    <div className="page-wide">
      <PageHeader
        icon={HandCoins}
        title={t("السلف والمكافآت والخصومات", "Advances, bonuses & deductions")}
        description={t(
          "سلف ومقدمات رواتب تُسترد بالأقساط، ومكافآت وبدلات واستحقاقات تُضاف، وخصومات مستقبلية. كلها تُطبّق تلقائياً على راتب الشهر عند إنشائه أو إعادة احتسابه.",
          "Advances repaid in instalments, bonuses, allowances and entitlements to add, and future deductions. All are applied to the month's salary when it is generated or recalculated.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="col-span-2 sm:col-span-1">
          <Stat
            icon={Wallet}
            tone="gold"
            label={t("متبقي السلف", "Advances outstanding")}
            value={money(outstanding, currency)}
            hint={t(`${advances.length} سلفة قائمة`, `${advances.length} open advance(s)`)}
          />
        </div>
        <Stat
          icon={TrendingUp}
          tone="teal"
          label={t(`إضافات ${thisMonth}`, `Additions — ${thisMonth}`)}
          value={money(monthAdd, currency)}
          hint={t("مكافآت وبدلات واستحقاقات", "Bonuses, allowances, entitlements")}
        />
        <Stat
          icon={TrendingDown}
          tone="red"
          label={t(`استقطاعات ${thisMonth}`, `Deductions — ${thisMonth}`)}
          value={money(monthDeduct, currency)}
          hint={t("أقساط سلف وخصومات", "Advance instalments and deductions")}
        />
      </div>

      {allow.create ? (
        <details open={all.length === 0} className="group mb-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-3 font-bold text-slate-900">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={18} />
              </span>
              {t("إضافة سلفة أو مكافأة أو خصم", "Add an advance, bonus or deduction")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-5">
            <PayItemForm
              action={savePayItem}
              returnTo={returnTo}
              employees={employees.map((employee) => ({ id: employee.id, label: label(employee) }))}
              today={todayInputValue()}
              defaultStart={defaultStart}
              currency={currency}
            />
          </div>
        </details>
      ) : null}

      <Card>
        <GetForm className="mb-3 grid grid-cols-2 items-end gap-2 border-b border-slate-100 pb-4 sm:flex sm:flex-wrap">
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("النوع", "Type")}
            <select name="kind" defaultValue={kind} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("الكل", "All")}</option>
              {PAY_KINDS.map((value) => (
                <option key={value} value={value}>
                  {pick(PAY_KIND_LABEL[value], lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الحالة", "Status")}
            <select name="status" defaultValue={status} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="open">{t("السارية والمجدولة", "Active and scheduled")}</option>
              <option value="ACTIVE">{t("السارية", "Active")}</option>
              <option value="SCHEDULED">{t("المجدولة", "Scheduled")}</option>
              <option value="DONE">{t("المنتهية والمسدّدة", "Finished / repaid")}</option>
              <option value="STOPPED">{t("الموقوفة", "Stopped")}</option>
              <option value="all">{t("الكل", "All")}</option>
            </select>
          </label>
          <label className="col-span-2 min-w-0 flex-1 space-y-1.5 text-xs font-medium text-slate-500 sm:min-w-56">
            {t("الموظف", "Employee")}
            <select name="employeeId" defaultValue={sp.employeeId || ""} className={`${fieldClass} block w-full`}>
              <option value="">{t("كل الموظفين", "All employees")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {label(employee)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${primaryBtn} col-span-2`}>
            <Filter size={16} />
            {t("عرض", "Show")}
          </button>
        </GetForm>
        <PayItemsList
          items={shown}
          lang={lang}
          currency={currency}
          nowKey={nowKey}
          returnTo={returnTo}
          allow={{ edit: allow.edit, remove: allow.remove }}
          showEmployee
          today={todayInputValue()}
          defaultStart={defaultStart}
        />
      </Card>
    </div>
  );
}
