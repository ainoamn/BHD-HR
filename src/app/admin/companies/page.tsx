import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { companyRows } from "@/lib/admin-data";
import { getI18n } from "@/lib/lang";
import { limitText } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { ACCESS_LABEL, ACCESS_TONE, type AccessState } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { grantLegacyPlan } from "@/server/admin-actions";

const PAGE = 50;
const STATES: AccessState[] = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "SUSPENDED", "LEGACY"];

export default async function AdminCompanies({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; page?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const q = (sp.q || "").trim().toLowerCase();
  const state = STATES.includes(sp.state as AccessState) ? (sp.state as AccessState) : null;
  const all = await companyRows();
  const filtered = all.filter(
    (row) =>
      (!state || row.access.state === state) &&
      (!q || row.name.toLowerCase().includes(q) || row.nameEn?.toLowerCase().includes(q) || row.owner?.toLowerCase().includes(q) || row.signupIp?.includes(q) || row.lastSeenIp?.includes(q) || row.id === q),
  );
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const legacy = all.filter((row) => row.access.state === "LEGACY").length;
  const plans = legacy ? await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }) : [];
  const href = (next: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { q: sp.q || null, state, page: null, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/companies${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={Building2} title={t("الشركات", "Companies")} description={t(`${all.length} شركة على المنصة. ابحث بالاسم أو بريد المالك أو عنوان IP.`, `${all.length} companies. Search by name, owner email or IP address.`)} />
      <Flash error={sp.error} message={sp.message} />

      {legacy ? (
        <Card className="border-gold-200">
          <form action={grantLegacyPlan} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 text-sm leading-6 text-slate-600">
              <p className="font-bold text-slate-900">{t(`${legacy} شركة بلا اشتراك (حسابات قائمة قبل الباقات)`, `${legacy} companies without a subscription (from before plans)`)}</p>
              {t("تعمل بكل الميزات بلا حدود. انقلها كلها إلى باقة بلا تاريخ انتهاء لتظهر في التقارير، ثم عدّل أي شركة منها على حدة.", "They have everything with no limits. Move them all to a plan with no end date so they show in reports, then adjust any one of them.")}
            </div>
            <select name="planId" className={fieldClass} defaultValue={plans.find((plan) => plan.code === "ENTERPRISE")?.id}>
              {plans.map((plan) => (
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

      <Toolbar>
        <form className="flex flex-col gap-2 sm:flex-row" action="/admin/companies">
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={sp.q} className={`${fieldClass} w-full ps-9`} placeholder={t("اسم الشركة، بريد المالك، IP…", "Company, owner email, IP…")} />
          </label>
          <select name="state" defaultValue={state ?? ""} className={fieldClass}>
            <option value="">{t("كل الحالات", "All statuses")}</option>
            {STATES.map((value) => (
              <option key={value} value={value}>
                {ACCESS_LABEL[value][lang]}
              </option>
            ))}
          </select>
          <button type="submit" className={secondaryBtn}>
            {t("بحث", "Search")}
          </button>
        </form>
      </Toolbar>

      {rows.length ? (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-3 text-start font-medium">{t("الشركة / المالك", "Company / owner")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الباقة والحالة", "Plan & status")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("المستخدمون", "Users")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الموظفون", "Employees")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("التسجيل", "Signed up")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("آخر دفعة", "Last paid")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الانتهاء", "Ends")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("آخر دخول / IP", "Last sign-in / IP")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50/60">
                    <td className="max-w-[16rem] px-4 py-3">
                      <Link href={`/admin/companies/${row.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                        {lang === "en" && row.nameEn ? row.nameEn : row.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500" dir="ltr">
                        {row.owner || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{row.access.planName ? row.access.planName[lang] : "—"}</p>
                      <ToneBadge tone={ACCESS_TONE[row.access.state]}>{ACCESS_LABEL[row.access.state][lang]}</ToneBadge>
                    </td>
                    <td className="tabular px-4 py-3">
                      {row.users} / {limitText(row.access.maxUsers, lang)}
                      {row.accounts ? <p className="text-xs text-slate-500">{t(`+${row.accounts} حساب موظف`, `+${row.accounts} staff accounts`)}</p> : null}
                    </td>
                    <td className="tabular px-4 py-3">
                      {row.employees} / {limitText(row.access.maxEmployees, lang)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(row.createdAt)}
                      {row.signupIp ? (
                        <p className="text-xs text-slate-400" dir="ltr">
                          {row.signupIp}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.access.endsAt ? formatDate(row.access.endsAt) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.lastSeenAt ? formatDate(row.lastSeenAt) : "—"}
                      {row.lastSeenIp ? (
                        <p className="text-xs text-slate-400" dir="ltr">
                          {row.lastSeenIp}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={Building2} title={t("لا توجد نتائج", "No results")} text={t("غيّر البحث أو الحالة.", "Change the search or status.")} />
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} className={secondaryBtn}>
              {t("السابق", "Previous")}
            </Link>
          ) : null}
          <span className="text-slate-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: String(page + 1) })} className={secondaryBtn}>
              {t("التالي", "Next")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
