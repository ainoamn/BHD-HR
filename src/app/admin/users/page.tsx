import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Search, Users } from "lucide-react";
import { CellLabel, FilterChips, Monogram, Pager, Row, RowList } from "@/components/admin/admin-ui";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { requirePlatformAdmin } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_ROLE_LABEL } from "@/lib/team";
import { formatDate, formatDateTime } from "@/lib/utils";
import { setUserFlags } from "@/server/admin-actions";

const PAGE = 50;
const COLUMNS = "lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]";
const KINDS = ["admins", "disabled", "bhd", "staff", "never"] as const;
type Kind = (typeof KINDS)[number];

const KIND_WHERE: Record<Kind, Prisma.UserWhereInput> = {
  admins: { isPlatformAdmin: true },
  disabled: { disabledAt: { not: null } },
  bhd: { bhdSub: { not: null } },
  staff: { username: { not: null } },
  never: { lastLoginAt: null },
};

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const admin = await requirePlatformAdmin();
  const { lang, t } = await getI18n();
  const q = (sp.q || "").trim();
  const kind = KINDS.find((value) => value === sp.kind) ?? null;
  const search: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { lastLoginIp: { contains: q } }] }
    : {};
  const where: Prisma.UserWhereInput = { AND: [search, kind ? KIND_WHERE[kind] : {}] };
  const [total, counts, all] = await Promise.all([
    prisma.user.count({ where }),
    Promise.all(KINDS.map((value) => prisma.user.count({ where: { AND: [search, KIND_WHERE[value]] } }))),
    prisma.user.count({ where: search }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isPlatformAdmin: "desc" }, { lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE,
    take: PAGE,
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      bhdSub: true,
      isPlatformAdmin: true,
      disabledAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      memberships: { select: { role: true, company: { select: { id: true, name: true } } } },
    },
  });
  const query = (next: Partial<Record<"q" | "kind" | "page", string | null>>) => {
    const params = new URLSearchParams();
    const merged = { q: q || null, kind, page: null, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/users${params.size ? `?${params}` : ""}`;
  };
  const back = query({ page: page > 1 ? String(page) : null });
  const labels: Record<Kind, string> = {
    admins: t("مديرو المنصة", "Platform admins"),
    disabled: t("موقوفون", "Disabled"),
    bhd: t("حسابات BHD", "BHD accounts"),
    staff: t("حسابات موظفين", "Staff accounts"),
    never: t("لم يدخلوا بعد", "Never signed in"),
  };
  const chips = [
    { href: query({ kind: null }), label: t("الكل", "All"), count: all, active: !kind },
    ...KINDS.map((value, index) => ({ href: query({ kind: value }), label: labels[value], count: counts[index], active: kind === value, tone: value === "disabled" ? ("red" as const) : undefined })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={Users} title={t("المستخدمون", "Users")} description={t("كل حسابات الدخول على المنصة، وأدوارها في كل شركة على حدة.", "Every sign-in account on the platform, and its role in each company separately.")} />
      <Flash error={sp.error} message={sp.message} />
      <Toolbar className="space-y-3">
        <GetForm className="flex gap-2" action="/admin/users">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" defaultValue={q} className={`${fieldClass} w-full ps-9`} placeholder={t("الاسم، البريد، اسم المستخدم، IP…", "Name, email, username, IP…")} aria-label={t("بحث", "Search")} />
          </label>
          <button type="submit" className={secondaryBtn}>
            {t("بحث", "Search")}
          </button>
        </GetForm>
        <FilterChips items={chips} label={t("نوع الحساب", "Account type")} />
      </Toolbar>

      {users.length ? (
        <RowList columns={COLUMNS} head={[t("المستخدم", "User"), t("الشركات والأدوار", "Companies & roles"), t("آخر دخول / IP", "Last sign-in / IP"), t("الحالة", "Status"), t("إجراءات", "Actions")]}>
          {users.map((user) => {
            const self = user.id === admin.id;
            return (
              <Row key={user.id} columns={COLUMNS}>
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram name={user.name || user.email} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-500" dir="ltr">
                      {user.email}
                    </p>
                    <p className="text-xs text-slate-400">
                      {user.bhdSub ? "BHD" : user.username ? t("حساب موظف", "Staff account") : t("محلي", "Local")} · {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>
                <ul className="min-w-0 space-y-0.5">
                  {user.memberships.slice(0, 3).map((member) => (
                    <li key={member.company.id} className="truncate text-xs">
                      <Link href={`/admin/companies/${member.company.id}`} className="font-semibold text-slate-800 hover:text-teal-700">
                        {member.company.name}
                      </Link>{" "}
                      <span className="text-slate-500">· {pick(ACCOUNT_ROLE_LABEL[member.role], lang, member.role)}</span>
                    </li>
                  ))}
                  {user.memberships.length > 3 ? <li className="text-xs text-slate-400">+{user.memberships.length - 3}</li> : null}
                  {!user.memberships.length ? <li className="text-xs text-slate-400">{t("بلا شركة", "No company")}</li> : null}
                </ul>
                <div className="min-w-0 text-sm text-slate-600">
                  <CellLabel>{t("آخر دخول:", "Last sign-in:")}</CellLabel>
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
                  {user.lastLoginIp ? (
                    <p className="truncate text-xs text-slate-400" dir="ltr">
                      {user.lastLoginIp}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {user.disabledAt ? <ToneBadge tone="red">{t("موقوف", "Disabled")}</ToneBadge> : <ToneBadge tone="green">{t("فعّال", "Active")}</ToneBadge>}
                  {user.isPlatformAdmin ? <ToneBadge tone="gold">{t("مدير منصة", "Platform admin")}</ToneBadge> : null}
                </div>
                <div>
                  {self ? (
                    <span className="text-xs text-slate-400">{t("حسابك", "You")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <form action={setUserFlags}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="change" value={user.disabledAt ? "enable" : "disable"} />
                        <SubmitButton variant={user.disabledAt ? "secondary" : "link"} confirm={user.disabledAt ? undefined : t("إيقاف هذا الحساب؟ لن يستطيع الدخول إلى أي شركة.", "Disable this account? It cannot sign in to any company.")}>
                          {user.disabledAt ? t("تفعيل", "Enable") : t("إيقاف", "Disable")}
                        </SubmitButton>
                      </form>
                      <form action={setUserFlags}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="change" value={user.isPlatformAdmin ? "admin-off" : "admin-on"} />
                        <SubmitButton
                          variant="link"
                          confirm={user.isPlatformAdmin ? t("سحب صلاحية إدارة المنصة؟", "Remove platform admin?") : t("منح هذا الحساب إدارة المنصة كاملة (كل الشركات والمدفوعات)؟", "Give this account full platform admin (every company and payment)?")}
                        >
                          {user.isPlatformAdmin ? t("سحب الإدارة", "Remove admin") : t("مدير منصة", "Make admin")}
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </div>
              </Row>
            );
          })}
        </RowList>
      ) : (
        <EmptyState icon={Users} title={t("لا توجد نتائج", "No results")} text={t("غيّر البحث أو نوع الحساب.", "Change the search or account type.")} />
      )}

      <Pager page={page} pages={pages} lang={lang} href={(next) => query({ page: String(next) })} />
    </div>
  );
}
