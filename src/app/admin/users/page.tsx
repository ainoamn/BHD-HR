import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, ToneBadge, Toolbar, fieldClass, secondaryBtn } from "@/components/ui";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { requirePlatformAdmin } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_ROLE_LABEL } from "@/lib/team";
import { formatDate, formatDateTime } from "@/lib/utils";
import { setUserFlags } from "@/server/admin-actions";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const admin = await requirePlatformAdmin();
  const { lang, t } = await getI18n();
  const q = (sp.q || "").trim();
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { lastLoginIp: { contains: q } }] }
      : {},
    orderBy: [{ isPlatformAdmin: "desc" }, { lastLoginAt: { sort: "desc", nulls: "last" } }],
    take: 150,
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
  const back = `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader icon={Users} title={t("المستخدمون", "Users")} description={t("كل حسابات الدخول على المنصة، وأدوارها في كل شركة على حدة.", "Every sign-in account on the platform, and its role in each company separately.")} />
      <Flash error={sp.error} message={sp.message} />
      <Toolbar>
        <form className="flex gap-2" action="/admin/users">
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} className={`${fieldClass} w-full ps-9`} placeholder={t("الاسم، البريد، اسم المستخدم، IP…", "Name, email, username, IP…")} />
          </label>
          <button type="submit" className={secondaryBtn}>
            {t("بحث", "Search")}
          </button>
        </form>
      </Toolbar>
      {users.length ? (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-3 text-start font-medium">{t("المستخدم", "User")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الشركات والأدوار", "Companies & roles")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("آخر دخول / IP", "Last sign-in / IP")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const self = user.id === admin.id;
                  return (
                    <tr key={user.id} className="align-top">
                      <td className="max-w-[16rem] px-4 py-3">
                        <p className="truncate font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-xs text-slate-500" dir="ltr">
                          {user.email}
                        </p>
                        <p className="text-xs text-slate-400">
                          {user.bhdSub ? "BHD" : user.username ? t("حساب موظف", "Staff account") : t("محلي", "Local")} · {formatDate(user.createdAt)}
                        </p>
                      </td>
                      <td className="max-w-[20rem] px-4 py-3">
                        <ul className="space-y-0.5">
                          {user.memberships.slice(0, 4).map((member) => (
                            <li key={member.company.id} className="truncate text-xs">
                              <Link href={`/admin/companies/${member.company.id}`} className="font-semibold text-slate-800 hover:text-teal-700">
                                {member.company.name}
                              </Link>{" "}
                              <span className="text-slate-500">· {pick(ACCOUNT_ROLE_LABEL[member.role], lang, member.role)}</span>
                            </li>
                          ))}
                          {user.memberships.length > 4 ? <li className="text-xs text-slate-400">+{user.memberships.length - 4}</li> : null}
                          {!user.memberships.length ? <li className="text-xs text-slate-400">—</li> : null}
                        </ul>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
                        {user.lastLoginIp ? (
                          <p className="text-xs text-slate-400" dir="ltr">
                            {user.lastLoginIp}
                          </p>
                        ) : null}
                      </td>
                      <td className="space-y-1 px-4 py-3">
                        {user.disabledAt ? <ToneBadge tone="red">{t("موقوف", "Disabled")}</ToneBadge> : <ToneBadge tone="green">{t("فعّال", "Active")}</ToneBadge>}
                        {user.isPlatformAdmin ? <ToneBadge tone="gold">{t("مدير منصة", "Platform admin")}</ToneBadge> : null}
                      </td>
                      <td className="px-4 py-3">
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
                                variant="secondary"
                                confirm={user.isPlatformAdmin ? t("سحب صلاحية إدارة المنصة؟", "Remove platform admin?") : t("منح هذا الحساب إدارة المنصة كاملة (كل الشركات والمدفوعات)؟", "Give this account full platform admin (every company and payment)?")}
                              >
                                {user.isPlatformAdmin ? t("سحب الإدارة", "Remove admin") : t("مدير منصة", "Make admin")}
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={Users} title={t("لا توجد نتائج", "No results")} text={t("غيّر البحث.", "Change the search.")} />
      )}
    </div>
  );
}
