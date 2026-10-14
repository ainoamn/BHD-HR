import Link from "next/link";
import { Building2, CreditCard, Search, Users } from "lucide-react";
import { Monogram } from "@/components/admin/admin-ui";
import { Card, PageHeader, SectionTitle, ToneBadge, fieldClass, primaryBtn } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { receiptNumber } from "@/lib/platform";
import { PAYMENT_STATUS, formatRial } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

/** One box for the whole platform: companies, accounts and receipts. */
export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const q = (sp.q || "").trim().slice(0, 100);
  const receipt = Number(q.replace(/^INV-?/i, ""));
  const contains = { contains: q, mode: "insensitive" as const };
  const [companies, users, payments] = q
    ? await Promise.all([
        prisma.company.findMany({
          where: { OR: [{ id: q }, { name: contains }, { nameEn: contains }, { crNumber: contains }, { email: contains }, { phone: { contains: q } }, { signupIp: { contains: q } }] },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, name: true, nameEn: true, email: true, crNumber: true, createdAt: true, status: true },
        }),
        prisma.user.findMany({
          where: { OR: [{ email: contains }, { name: contains }, { username: contains }, { lastLoginIp: { contains: q } }] },
          orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
          take: 20,
          select: { id: true, name: true, email: true, disabledAt: true, isPlatformAdmin: true, memberships: { take: 2, select: { company: { select: { id: true, name: true } } } } },
        }),
        prisma.payment.findMany({
          where: { OR: [{ reference: contains }, ...(Number.isInteger(receipt) && receipt > 0 ? [{ number: receipt }] : [])] },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { company: { select: { id: true, name: true } } },
        }),
      ])
    : [[], [], []];
  const found = companies.length + users.length + payments.length;

  return (
    <div className="space-y-5">
      <PageHeader icon={Search} title={t("بحث في المنصة", "Search the platform")} description={t("ابحث عن شركة (الاسم، السجل التجاري، البريد، الهاتف، IP)، أو مستخدم، أو إيصال (INV-000123 أو مرجع التحويل).", "Find a company (name, CR, email, phone, IP), a user, or a receipt (INV-000123 or transfer reference).")} />
      <form action="/admin/search" className="flex gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input name="q" type="search" defaultValue={q} autoFocus className={`${fieldClass} w-full ps-9`} placeholder={t("اكتب للبحث…", "Type to search…")} aria-label={t("بحث", "Search")} />
        </label>
        <button type="submit" className={primaryBtn}>
          {t("بحث", "Search")}
        </button>
      </form>

      {q ? <p className="text-sm text-slate-500">{t(`${found} نتيجة لـ «${q}»`, `${found} result(s) for “${q}”`)}</p> : null}

      {companies.length ? (
        <Card>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Building2 size={18} className="text-teal-700" />
              {t(`الشركات (${companies.length})`, `Companies (${companies.length})`)}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-slate-100">
            {companies.map((company) => (
              <li key={company.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Monogram name={company.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/companies/${company.id}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {lang === "en" && company.nameEn ? company.nameEn : company.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500">{[company.crNumber, company.email].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {company.status === "SUSPENDED" ? <ToneBadge tone="red">{t("موقوفة", "Suspended")}</ToneBadge> : null}
                  <span className="text-xs text-slate-500">{formatDate(company.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {users.length ? (
        <Card>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Users size={18} className="text-teal-700" />
              {t(`المستخدمون (${users.length})`, `Users (${users.length})`)}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-slate-100">
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Monogram name={user.name || user.email} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/users?q=${encodeURIComponent(user.email)}`} className="block truncate font-semibold text-slate-900 hover:text-teal-700">
                    {user.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {user.email}
                  </p>
                  {user.memberships.length ? <p className="truncate text-xs text-slate-400">{user.memberships.map((member) => member.company.name).join("، ")}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {user.disabledAt ? <ToneBadge tone="red">{t("موقوف", "Disabled")}</ToneBadge> : null}
                  {user.isPlatformAdmin ? <ToneBadge tone="gold">{t("مدير منصة", "Platform admin")}</ToneBadge> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {payments.length ? (
        <Card>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <CreditCard size={18} className="text-teal-700" />
              {t(`المدفوعات (${payments.length})`, `Payments (${payments.length})`)}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-slate-100">
            {payments.map((payment) => {
              const status = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.PENDING;
              return (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      <span dir="ltr">{receiptNumber(payment.number)}</span> ·{" "}
                      <Link href={`/admin/companies/${payment.company.id}`} className="hover:text-teal-700">
                        {payment.company.name}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {payment.planName}
                      {payment.reference ? ` · ${payment.reference}` : ""} · {formatDate(payment.paidAt ?? payment.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular font-bold text-slate-900">{formatRial(payment.amount, lang)}</span>
                    <ToneBadge tone={status.tone}>{status[lang]}</ToneBadge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {q && !found ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-surface/70 px-6 py-10 text-center text-sm text-slate-500">{t("لا توجد نتائج. جرّب جزءاً من الاسم أو البريد.", "No results. Try part of the name or email.")}</p>
      ) : null}
    </div>
  );
}
