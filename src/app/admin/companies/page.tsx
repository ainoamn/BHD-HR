import Link from "next/link";
import { Building2, Download, Search } from "lucide-react";
import { CellLabel, FilterChips, Meter, Monogram, Pager, Row, RowList } from "@/components/admin/admin-ui";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { COMPANY_STATES, companyFilter, companyRows, filterCompanies } from "@/lib/admin-data";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { grantLegacyPlan } from "@/server/admin-actions";

const PAGE = 40;
const COLUMNS = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]";

type Params = { q?: string; state?: string; plan?: string; sort?: string; page?: string; error?: string; message?: string };

export default async function AdminCompanies({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const filter = companyFilter(sp);
  const [all, plans] = await Promise.all([companyRows(), prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, nameEn: true, isActive: true } })]);
  const filtered = filterCompanies(all, filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const legacy = all.filter((row) => row.access.state === "LEGACY").length;

  const query = (next: Partial<Record<"q" | "state" | "plan" | "sort" | "page", string | null>>) => {
    const params = new URLSearchParams();
    const merged = { q: filter.q || null, state: filter.state, plan: filter.plan, sort: filter.sort === "newest" ? null : filter.sort, page: null, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return params.size ? `?${params}` : "";
  };
  const counted = (state: string | null) => filterCompanies(all, { ...filter, state }).length;
  const chips = [
    { href: `/admin/companies${query({ state: null })}`, label: t("الكل", "All"), count: counted(null), active: !filter.state },
    ...COMPANY_STATES.map((state) => ({
      href: `/admin/companies${query({ state })}`,
      label: ACCESS_LABEL[state][lang],
      count: counted(state),
      active: filter.state === state,
      tone: state === "GRACE" ? ("amber" as const) : state === "EXPIRED" || state === "SUSPENDED" ? ("red" as const) : undefined,
    })),
    { href: `/admin/companies${query({ state: "ENDING" })}`, label: t("تنتهي خلال 7 أيام", "Ending in 7 days"), count: counted("ENDING"), active: filter.state === "ENDING", tone: "amber" as const },
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={Building2} title={t("الشركات", "Companies")} description={t(`${all.length} شركة على المنصة. ابحث بالاسم أو بريد المالك أو عنوان IP.`, `${all.length} companies. Search by name, owner email or IP address.`)}>
        <a href={`/admin/companies/export${query({})}`} className={secondaryBtn}>
          <Download size={16} />
          {t("تصدير CSV", "Export CSV")}
        </a>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      {legacy ? (
        <Card className="border-gold-200">
          <form action={grantLegacyPlan} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 text-sm leading-6 text-slate-600">
              <p className="font-bold text-slate-900">{t(`${legacy} شركة بلا اشتراك (حسابات قائمة قبل الباقات)`, `${legacy} companies without a subscription (from before plans)`)}</p>
              {t("تعمل بكل الميزات بلا حدود. انقلها كلها إلى باقة بلا تاريخ انتهاء لتظهر في التقارير، ثم عدّل أي شركة منها على حدة.", "They have everything with no limits. Move them all to a plan with no end date so they show in reports, then adjust any one of them.")}
            </div>
            <select name="planId" className={fieldClass} defaultValue={plans.find((plan) => plan.code === "ENTERPRISE")?.id} aria-label={t("الباقة", "Plan")}>
              {plans
                .filter((plan) => plan.isActive)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {(lang === "en" && plan.nameEn) || plan.name}
                  </option>
                ))}
            </select>
            <SubmitButton variant="secondary" confirm={t(`نقل ${legacy} شركة إلى الباقة المختارة بلا تاريخ انتهاء؟`, `Move ${legacy} companies to the chosen plan with no end date?`)}>
              {t("نقلها إلى الباقة", "Move to plan")}
            </SubmitButton>
          </form>
        </Card>
      ) : null}

      <Toolbar className="space-y-3">
        <GetForm className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]" action="/admin/companies">
          {filter.state ? <input type="hidden" name="state" value={filter.state} /> : null}
          <label className="relative min-w-0">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" defaultValue={filter.q} className={`${fieldClass} w-full ps-9`} placeholder={t("اسم الشركة، بريد المالك، IP…", "Company, owner email, IP…")} aria-label={t("بحث", "Search")} />
          </label>
          <select name="plan" defaultValue={filter.plan ?? ""} className={fieldClass} aria-label={t("الباقة", "Plan")}>
            <option value="">{t("كل الباقات", "All plans")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {(lang === "en" && plan.nameEn) || plan.name}
              </option>
            ))}
            <option value="none">{t("بلا اشتراك", "No subscription")}</option>
          </select>
          <select name="sort" defaultValue={filter.sort} className={fieldClass} aria-label={t("الترتيب", "Sort")}>
            <option value="newest">{t("الأحدث تسجيلاً", "Newest")}</option>
            <option value="oldest">{t("الأقدم تسجيلاً", "Oldest")}</option>
            <option value="name">{t("الاسم", "Name")}</option>
            <option value="employees">{t("الأكثر موظفين", "Most employees")}</option>
            <option value="ending">{t("الأقرب انتهاءً", "Ending first")}</option>
            <option value="seen">{t("آخر دخول", "Last sign-in")}</option>
          </select>
          <button type="submit" className={secondaryBtn}>
            {t("تطبيق", "Apply")}
          </button>
        </GetForm>
        <FilterChips items={chips} label={t("تصفية حسب الحالة", "Filter by status")} />
      </Toolbar>

      {rows.length ? (
        <RowList
          columns={COLUMNS}
          head={[t("الشركة / المالك", "Company / owner"), t("الباقة والحالة", "Plan & status"), t("الاستخدام", "Usage"), t("التسجيل / الانتهاء", "Signed up / ends"), t("آخر دخول / دفعة", "Last sign-in / paid")]}
        >
          {rows.map((row) => (
            <Row key={row.id} columns={COLUMNS}>
              <div className="flex min-w-0 items-center gap-3">
                <Monogram name={row.name} />
                <div className="min-w-0">
                  <Link href={`/admin/companies/${row.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {lang === "en" && row.nameEn ? row.nameEn : row.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {row.owner || "—"}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-col lg:items-start lg:gap-1">
                <span className="truncate text-sm font-medium text-slate-800">{row.access.planName ? row.access.planName[lang] : t("بلا باقة", "No plan")}</span>
                <ToneBadge tone={ACCESS_TONE[row.access.state]}>{ACCESS_LABEL[row.access.state][lang]}</ToneBadge>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-1.5">
                <Meter value={row.employees} max={row.access.maxEmployees} label={t("الموظفون", "Employees")} />
                <Meter value={row.users} max={row.access.maxUsers} label={t("المستخدمون", "Users")} />
              </div>
              <div className="min-w-0 text-sm text-slate-600">
                <p>
                  <CellLabel>{t("التسجيل:", "Signed up:")}</CellLabel>
                  {formatDate(row.createdAt)}
                </p>
                <p className={row.access.daysLeft !== null && row.access.daysLeft <= 7 ? "font-semibold text-amber-700" : "text-xs text-slate-500"}>
                  <CellLabel>{t("الانتهاء:", "Ends:")}</CellLabel>
                  {row.access.endsAt ? formatDate(row.access.endsAt) : t("بلا تاريخ", "No end")}
                </p>
              </div>
              <div className="min-w-0 text-sm text-slate-600">
                <p>
                  <CellLabel>{t("آخر دخول:", "Last sign-in:")}</CellLabel>
                  {row.lastSeenAt ? formatDate(row.lastSeenAt) : "—"}
                  {row.lastSeenIp ? (
                    <span className="block truncate text-xs text-slate-400" dir="ltr">
                      {row.lastSeenIp}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  <CellLabel>{t("آخر دفعة:", "Last paid:")}</CellLabel>
                  {row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}
                </p>
              </div>
            </Row>
          ))}
        </RowList>
      ) : (
        <EmptyState icon={Building2} title={t("لا توجد نتائج", "No results")} text={t("غيّر البحث أو الحالة أو الباقة.", "Change the search, status or plan.")} />
      )}

      <Pager page={page} pages={pages} lang={lang} href={(next) => `/admin/companies${query({ page: String(next) })}`} />
    </div>
  );
}
