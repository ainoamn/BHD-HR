import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { History, Search } from "lucide-react";
import { FilterChips, Pager } from "@/components/admin/admin-ui";
import { Card, EmptyState, PageHeader, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
const PAGE = 100;
const GROUPS = {
  billing: { ar: "المدفوعات", en: "Payments", prefixes: ["PAYMENT_", "BILLING_"] },
  subscription: { ar: "الاشتراكات", en: "Subscriptions", prefixes: ["SUBSCRIPTION_", "LEGACY_", "PLAN_FREE"] },
  company: { ar: "الشركات", en: "Companies", prefixes: ["COMPANY_", "WORKSPACE_"] },
  user: { ar: "المستخدمون", en: "Users", prefixes: ["USER_", "ACCOUNT_", "MEMBER_"] },
  plan: { ar: "الباقات والإعدادات", en: "Plans & settings", prefixes: ["PLAN_CREATE", "PLAN_UPDATE", "CONFIG_"] },
} as const;
type Group = keyof typeof GROUPS;

const groupWhere = (group: Group): Prisma.PlatformLogWhereInput => ({ OR: GROUPS[group].prefixes.map((prefix) => ({ action: { startsWith: prefix } })) });

export default async function AdminLog({ searchParams }: { searchParams: Promise<{ group?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const group = (Object.keys(GROUPS) as Group[]).find((key) => key === sp.group) ?? null;
  const q = (sp.q || "").trim();
  const search: Prisma.PlatformLogWhereInput = q
    ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { userName: { contains: q, mode: "insensitive" } }, { action: { contains: q.toUpperCase() } }, { ip: { contains: q } }] }
    : {};
  const where: Prisma.PlatformLogWhereInput = { AND: [search, group ? groupWhere(group) : {}] };
  const [total, all, counts] = await Promise.all([
    prisma.platformLog.count({ where }),
    prisma.platformLog.count({ where: search }),
    Promise.all((Object.keys(GROUPS) as Group[]).map((key) => prisma.platformLog.count({ where: { AND: [search, groupWhere(key)] } }))),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const logs = await prisma.platformLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });
  const companies = await prisma.company.findMany({ where: { id: { in: [...new Set(logs.map((log) => log.companyId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true } });
  const nameOf = new Map(companies.map((company) => [company.id, company.name]));

  const query = (next: Partial<Record<"group" | "q" | "page", string | null>>) => {
    const params = new URLSearchParams();
    const merged = { group, q: q || null, page: null, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/log${params.size ? `?${params}` : ""}`;
  };
  const chips = [
    { href: query({ group: null }), label: t("الكل", "All"), count: all, active: !group },
    ...(Object.keys(GROUPS) as Group[]).map((key, index) => ({ href: query({ group: key }), label: GROUPS[key][lang], count: counts[index], active: group === key })),
  ];
  const days: { day: string; items: typeof logs }[] = [];
  for (const log of logs) {
    const day = log.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Muscat" });
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(log);
    else days.push({ day, items: [log] });
  }
  const time = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });

  return (
    <div className="space-y-5">
      <PageHeader icon={History} title={t("سجل الإدارة", "Admin log")} description={t("كل ما فعله مديرو المنصة وطلبات الدفع الواردة، مع عنوان IP.", "Everything platform admins did and incoming payment requests, with IP address.")} />
      <Toolbar className="space-y-3">
        <form className="flex gap-2" action="/admin/log">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" defaultValue={q} className={`${fieldClass} w-full ps-9`} placeholder={t("نص، اسم المدير، نوع الإجراء، IP…", "Text, admin name, action, IP…")} aria-label={t("بحث", "Search")} />
          </label>
          <button type="submit" className={secondaryBtn}>
            {t("بحث", "Search")}
          </button>
        </form>
        <FilterChips items={chips} label={t("نوع الإجراء", "Action type")} />
      </Toolbar>

      {days.length ? (
        <div className="space-y-5">
          {days.map(({ day, items }) => (
            <Card key={day} className="p-0 sm:p-0">
              <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 sm:px-6">{day}</h2>
              <ol className="divide-y divide-slate-100">
                {items.map((log) => (
                  <li key={log.id} className="flex gap-3 px-4 py-3 text-sm sm:px-6">
                    <span className="tabular w-12 shrink-0 pt-0.5 text-xs text-slate-400" dir="ltr">
                      {time(log.createdAt)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-slate-800">{log.message}</p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                        <span className="font-mono" dir="ltr">
                          {log.action}
                        </span>
                        <span>{log.userName || "—"}</span>
                        {log.companyId ? (
                          <Link href={`/admin/companies/${log.companyId}`} className="font-semibold text-teal-700 hover:underline">
                            {nameOf.get(log.companyId) || t("شركة محذوفة", "Deleted company")}
                          </Link>
                        ) : null}
                        {log.ip ? <span dir="ltr">IP {log.ip}</span> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={History} title={t("السجل فارغ", "The log is empty")} text={q || group ? t("لا نتائج لهذا البحث.", "Nothing matches this search.") : t("ستظهر هنا إجراءات الإدارة.", "Admin actions appear here.")} />
      )}

      <Pager page={page} pages={pages} lang={lang} href={(next) => query({ page: String(next) })} />
    </div>
  );
}
