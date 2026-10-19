import Link from "next/link";
import {
  BookUser,
  Building2,
  ChevronDown,
  Contact,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Search,
  SearchX,
  User,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
} from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { EmployerForm } from "@/components/employer-form";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { Card, EmptyState, PageHeader, Stat, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { EMPLOYER_KIND, STATUS_LABEL, STATUS_TONE, termText } from "@/lib/constants";
import { type ContactKind, loadContacts, readContactKind } from "@/lib/contacts";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { formatPhone, phoneHref } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { cn, currentPeriod, money } from "@/lib/utils";
import { createEmployer } from "@/server/employer-actions";

const CHIP_LIMIT = 5;
const LIST_COLS = ["name", "kind", "idno", "phone", "email", "staff", "pay"] as const;
const CONTACT_COLS = ["name", "kind", "relation", "phone", "email", "extra"] as const;
type View = "list" | "cards" | "contacts";

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    view?: string;
    employerId?: string;
    new?: string;
    sort?: string;
    dir?: string;
    fname?: string;
    fkind?: string;
    fidno?: string;
    fphone?: string;
    femail?: string;
    fstaff?: string;
    fpay?: string;
    frelation?: string;
    fextra?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employers.view");
  const showPay = can(user, "salaries.view");
  const canCreate = can(user, "employers.create");
  const canHire = can(user, "employees.create");
  const { lang, t } = await getI18n();
  const locale = lang === "en" ? "en" : "ar";
  const q = sp.q?.trim() || "";
  const view: View = sp.view === "cards" || sp.view === "contacts" ? sp.view : "list";
  const rawKind = readContactKind(sp.kind);
  const kind: ContactKind = view !== "contacts" && rawKind === "EMPLOYEE" ? "" : rawKind;
  const sponsorKind = kind === "COMPANY" || kind === "PERSON" ? kind : "";
  const employerId = view === "contacts" ? sp.employerId || "" : "";
  const currency = user.company.currency;

  const [employers, totalEmployers, unlinked, sponsorOptions, contacts] = await Promise.all([
    view === "contacts"
      ? Promise.resolve([])
      : prisma.employer.findMany({
          where: {
            companyId: user.companyId,
            ...(sponsorKind ? { kind: sponsorKind } : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { nameEn: { contains: q, mode: "insensitive" } },
                    { idNumber: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          include: {
            employees: {
              select: {
                id: true,
                fullName: true,
                nameEn: true,
                employeeNumber: true,
                status: true,
                basicSalary: true,
                housingAllowance: true,
                transportAllowance: true,
                otherAllowance: true,
              },
              orderBy: { fullName: "asc" },
            },
          },
          orderBy: { name: "asc" },
        }),
    prisma.employer.count({ where: { companyId: user.companyId } }),
    prisma.employee.count({ where: { companyId: user.companyId, employerId: null, status: { not: "TERMINATED" } } }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    view === "contacts" ? loadContacts({ companyId: user.companyId, q, kind, employerId }) : Promise.resolve(null),
  ]);
  const linkedCount = await prisma.employee.count({
    where: { companyId: user.companyId, employerId: { not: null }, status: { not: "TERMINATED" } },
  });
  const { year, month } = currentPeriod();
  const filtered = Boolean(q || kind || employerId || sp.sort || LIST_COLS.some((col) => sp[`f${col}` as keyof typeof sp]) || CONTACT_COLS.some((col) => sp[`f${col}` as keyof typeof sp]));
  const openForm = totalEmployers === 0 || sp.new === "1" || Boolean(sp.error);
  const sponsorName = (sponsor: { name: string; nameEn: string | null }) => (lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name);
  const personName = (person: { fullName: string; nameEn: string | null }) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);
  type Staff = (typeof employers)[number]["employees"][number];
  const activeOf = (employees: Staff[]) => employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION");
  const monthlyOf = (employees: Staff[]) => activeOf(employees).reduce((sum, employee) => sum + packageGross(employee), 0);

  const listSort = readSort(sp, [...LIST_COLS], "name");
  const listed = [...employers]
    .filter((employer) => {
      const active = activeOf(employer.employees);
      const monthly = monthlyOf(employer.employees);
      return (
        includesText(sponsorName(employer), sp.fname) &&
        includesText(pick(EMPLOYER_KIND[employer.kind], lang, employer.kind), sp.fkind) &&
        includesText(employer.idNumber || "", sp.fidno) &&
        includesText(formatPhone(employer.phone) || employer.phone || "", sp.fphone) &&
        includesText(employer.email || "", sp.femail) &&
        includesText(`${active.length} ${employer.employees.length}`, sp.fstaff) &&
        includesText(showPay ? `${monthly} ${money(monthly, currency)}` : "", sp.fpay)
      );
    })
    .sort((a, b) => {
      if (listSort.sort === "staff") return compareNumber(activeOf(a.employees).length, activeOf(b.employees).length, listSort.dir);
      if (listSort.sort === "pay") return compareNumber(monthlyOf(a.employees), monthlyOf(b.employees), listSort.dir);
      const label = (employer: (typeof employers)[number]) => {
        if (listSort.sort === "kind") return pick(EMPLOYER_KIND[employer.kind], lang, employer.kind);
        if (listSort.sort === "idno") return employer.idNumber || "";
        if (listSort.sort === "phone") return formatPhone(employer.phone) || employer.phone || "";
        if (listSort.sort === "email") return employer.email || "";
        return sponsorName(employer);
      };
      return compareText(label(a), label(b), listSort.dir, locale);
    });

  const href = (next: { view?: View; kind?: string; q?: string; employerId?: string }) => {
    const query = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextKind = next.kind ?? kind;
    const nextQ = next.q ?? q;
    const nextEmployer = next.employerId ?? employerId;
    if (nextView !== "list") query.set("view", nextView);
    if (nextKind && !(nextView !== "contacts" && nextKind === "EMPLOYEE")) query.set("kind", nextKind);
    if (nextQ) query.set("q", nextQ);
    if (nextEmployer && nextView === "contacts") query.set("employerId", nextEmployer);
    const qs = query.toString();
    return `/employers${qs ? `?${qs}` : ""}`;
  };
  const printQuery = new URLSearchParams();
  if (employerId) printQuery.set("employerId", employerId);
  if (kind) printQuery.set("kind", kind);
  if (q) printQuery.set("q", q);
  const printHref = `/address-book/print${printQuery.toString() ? `?${printQuery.toString()}` : ""}`;

  const views: { id: View; label: string; icon: typeof LayoutGrid }[] = [
    { id: "list", label: t("قائمة", "List"), icon: List },
    { id: "cards", label: t("بطاقات", "Cards"), icon: LayoutGrid },
    { id: "contacts", label: t("جهات الاتصال", "Contacts"), icon: Contact },
  ];
  const kinds = [
    { value: "", label: t("الكل", "All") },
    { value: "COMPANY", label: t("شركات", "Companies") },
    { value: "PERSON", label: t("أفراد", "Individuals") },
    ...(view === "contacts" ? [{ value: "EMPLOYEE", label: t("موظفون", "Employees") }] : []),
  ];
  const resultCount = view === "contacts" ? (contacts?.sponsors.length || 0) + (contacts?.employees.length || 0) : listed.length;
  const listKeep = columnHiddenFields(sp as Record<string, string | undefined>, [...LIST_COLS]);
  const contactKeep = columnHiddenFields(sp as Record<string, string | undefined>, [...CONTACT_COLS]);

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={BookUser}
        title={t("الكفلاء وجهات الاتصال", "Sponsors & contacts")}
        description={t(
          "كل كفيل مع موظفيه ورواتبه وبيانات التواصل في مكان واحد.",
          "Every sponsor with their staff, payroll and contact details in one place.",
        )}
      >
        <div className="flex flex-wrap gap-2">
          <Link href={printHref} target="_blank" className={secondaryBtn}>
            <Printer size={16} />
            {t("طباعة", "Print")}
          </Link>
          {canCreate ? (
            <Link href="/employers?new=1#new" className={primaryBtn}>
              <Plus size={16} />
              {t("كفيل جديد", "New sponsor")}
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("الكفلاء", "Sponsors")} value={String(totalEmployers)} icon={Building2} tone="navy" />
        <Stat label={t("مرتبطون", "Linked")} value={String(linkedCount)} icon={Users} tone="teal" />
        <Stat
          label={t("بلا كفيل", "No sponsor")}
          value={String(unlinked)}
          href="/employees?employerId=none"
          icon={UserRoundX}
          tone={unlinked > 0 ? "amber" : "gold"}
          emphasis={unlinked > 0 ? "amber" : undefined}
        />
      </div>

      {canCreate ? (
        <details id="new" open={openForm} className="group scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
            <span className="flex items-center gap-2.5 font-bold text-slate-900">
              <span className="flex size-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Plus size={17} />
              </span>
              {t("إضافة كفيل", "Add sponsor")}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-5">
            <EmployerForm action={createEmployer} submitLabel={t("حفظ الكفيل", "Save sponsor")} />
          </div>
        </details>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-surface p-3 shadow-card sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <GetForm className="flex w-full gap-2 lg:max-w-md">
            {view !== "list" ? <input type="hidden" name="view" value={view} /> : null}
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
            {(view === "contacts" ? contactKeep : listKeep).map((item) => (
              <input key={item.name} type="hidden" name={item.name} value={item.value} />
            ))}
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${fieldClass} w-full ps-9`}
                name="q"
                defaultValue={q}
                placeholder={t("ابحث بالاسم أو الهاتف أو البريد", "Search name, phone or email")}
              />
            </div>
          </GetForm>
          <nav className="segmented grid grid-cols-3" aria-label={t("طريقة العرض", "View")}>
            {views.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} href={href({ view: item.id })} aria-current={view === item.id ? "page" : undefined}>
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {kinds.map((item) => (
              <Link
                key={item.value || "all"}
                href={href({ kind: item.value })}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-center text-sm font-semibold ring-1 ring-inset transition",
                  kind === item.value ? "bg-teal-700 text-white ring-teal-700" : "text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          {view === "contacts" ? (
            <GetForm className="flex gap-2">
              <input type="hidden" name="view" value="contacts" />
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              {contactKeep.map((item) => (
                <input key={item.name} type="hidden" name={item.name} value={item.value} />
              ))}
              <select className={`${fieldClass} min-w-0 flex-1 sm:w-56`} name="employerId" defaultValue={employerId} aria-label={t("الكفيل", "Sponsor")}>
                <option value="">{t("كل الكفلاء", "All sponsors")}</option>
                {sponsorOptions.map((sponsor) => (
                  <option key={sponsor.id} value={sponsor.id}>
                    {sponsorName(sponsor)}
                  </option>
                ))}
                <option value="none">{t("بدون كفيل", "No sponsor")}</option>
              </select>
            </GetForm>
          ) : null}
        </div>
        {filtered ? (
          <p className="text-xs text-slate-500">
            {t(`${resultCount} نتيجة`, `${resultCount} result(s)`)} ·{" "}
            <Link href={href({ kind: "", q: "", employerId: "" })} className="font-semibold text-teal-800">
              {t("مسح الفلاتر", "Clear filters")}
            </Link>
          </p>
        ) : (
          <p className="text-xs text-slate-500">{t(`${resultCount} كفيل / جهة اتصال`, `${resultCount} sponsor / contact(s)`)}</p>
        )}
      </div>

      {resultCount === 0 ? (
        <EmptyState
          icon={filtered ? SearchX : BookUser}
          title={filtered ? t("لا توجد نتائج مطابقة", "No matching results") : t("لا يوجد كفلاء بعد", "No sponsors yet")}
          text={
            filtered
              ? t("جرّب كلمة بحث أخرى أو امسح الفلاتر.", "Try another search or clear the filters.")
              : t("أضف أول كفيل من الزر أعلاه.", "Add your first sponsor with the button above.")
          }
        />
      ) : null}

      {view === "list" && listed.length ? (
        <div className="table-shell">
          <table className="table-stack table-tools min-w-full text-sm">
            <thead>
              <tr>
                <ColumnHead column="name" label={t("الكفيل", "Sponsor")} />
                <ColumnHead column="kind" label={t("النوع", "Type")} className="hidden md:table-cell" />
                <ColumnHead column="idno" label={t("السجل / المدني", "CR / ID")} className="hidden lg:table-cell" />
                <ColumnHead column="phone" label={t("الهاتف", "Phone")} className="hidden sm:table-cell" />
                <ColumnHead column="email" label={t("البريد", "Email")} className="hidden xl:table-cell" />
                <ColumnHead column="staff" label={t("الموظفون", "Employees")} />
                {showPay ? <ColumnHead column="pay" label={t("الرواتب", "Payroll")} /> : null}
                <th className="px-3 py-2 text-end">{t("إجراءات", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((employer) => {
                const title = sponsorName(employer);
                const active = activeOf(employer.employees);
                const monthly = monthlyOf(employer.employees);
                const KindIcon = employer.kind === "PERSON" ? User : Building2;
                return (
                  <tr key={employer.id}>
                    <td className="cell-title px-4 py-3">
                      <Link href={`/employers/${employer.id}`} className="flex min-w-0 items-center gap-2.5 font-semibold text-slate-900 hover:text-teal-800">
                        <SponsorAvatar logoUrl={employer.logoUrl} title={title} size="xs" />
                        <span className="min-w-0 truncate">{title}</span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell" data-label={t("النوع", "Type")}>
                      <ToneBadge tone="teal">
                        <KindIcon size={12} className="me-1" />
                        {pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}
                      </ToneBadge>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell" data-label={t("السجل / المدني", "CR / ID")} dir="ltr">
                      {employer.idNumber || "—"}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap sm:table-cell" data-label={t("الهاتف", "Phone")}>
                      {employer.phone ? (
                        <a href={phoneHref(employer.phone)} className="hover:text-teal-800" dir="ltr">
                          {formatPhone(employer.phone)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="hidden max-w-48 truncate px-4 py-3 xl:table-cell" data-label={t("البريد", "Email")}>
                      {employer.email ? (
                        <a href={`mailto:${employer.email}`} className="hover:text-teal-800" dir="ltr">
                          {employer.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" data-label={t("الموظفون", "Employees")}>
                      <span className="font-semibold">{active.length}</span>
                      {employer.employees.length > active.length ? <span className="text-xs text-slate-500"> / {employer.employees.length}</span> : null}
                    </td>
                    {showPay ? (
                      <td className="tabular px-4 py-3 whitespace-nowrap" data-label={t("الرواتب", "Payroll")}>
                        {money(monthly, currency)}
                      </td>
                    ) : null}
                    <td className="cell-actions px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <Link href={`/employers/${employer.id}`} className="text-sm font-semibold text-teal-800 hover:underline">
                          {t("فتح", "Open")}
                        </Link>
                        {canHire ? (
                          <Link href={`/employees/new?employerId=${employer.id}`} className="text-sm font-semibold text-slate-600 hover:text-teal-800">
                            {t("موظف", "Hire")}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "cards" && listed.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listed.map((employer) => {
            const title = sponsorName(employer);
            const otherName = lang === "en" ? (employer.nameEn ? employer.name : null) : employer.nameEn;
            const subtitle = otherName && otherName.trim() !== title.trim() ? otherName : null;
            const active = activeOf(employer.employees);
            const monthly = monthlyOf(employer.employees);
            const KindIcon = employer.kind === "PERSON" ? User : Building2;
            return (
              <Card key={employer.id} className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <SponsorAvatar logoUrl={employer.logoUrl} title={title} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/employers/${employer.id}`} className="truncate text-base font-bold text-slate-900 hover:text-teal-800">
                        {title}
                      </Link>
                      <ToneBadge tone="teal">
                        <KindIcon size={12} className="me-1" />
                        {pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}
                      </ToneBadge>
                    </div>
                    {subtitle ? (
                      <p className="mt-0.5 truncate text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                        {subtitle}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                      {employer.phone ? (
                        <a href={phoneHref(employer.phone)} className="inline-flex items-center gap-1 hover:text-teal-800" dir="ltr">
                          <Phone size={13} className="text-slate-400" />
                          {formatPhone(employer.phone)}
                        </a>
                      ) : null}
                      {employer.email ? (
                        <a href={`mailto:${employer.email}`} className="inline-flex min-w-0 items-center gap-1 truncate hover:text-teal-800" dir="ltr">
                          <Mail size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate">{employer.email}</span>
                        </a>
                      ) : null}
                      {employer.address ? (
                        <span className="inline-flex min-w-0 items-start gap-1">
                          <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
                          <span className="line-clamp-1">{employer.address}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">{t("موظفون نشطون", "Active staff")}</p>
                    <p className="text-lg font-bold text-slate-900">
                      {active.length}
                      {employer.employees.length > active.length ? <span className="text-xs font-normal text-slate-500">/{employer.employees.length}</span> : null}
                    </p>
                  </div>
                  <div className="min-w-0 border-s border-slate-200/80">
                    <p className="text-[11px] font-medium text-slate-500">{t("رواتب الشهر", "Month pay")}</p>
                    <p className="truncate text-lg font-bold text-slate-900">{showPay ? money(monthly, currency) : "—"}</p>
                  </div>
                </div>

                {employer.employees.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {employer.employees.slice(0, CHIP_LIMIT).map((employee) => (
                      <Link
                        key={employee.id}
                        href={`/employees/${employee.id}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-200 hover:text-teal-800 hover:ring-teal-200"
                      >
                        <StatusDot status={employee.status} />
                        <span className="truncate">{personName(employee)}</span>
                      </Link>
                    ))}
                    {employer.employees.length > CHIP_LIMIT ? (
                      <Link href={`/employers/${employer.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-800">
                        +{employer.employees.length - CHIP_LIMIT}
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("لا يوجد موظفون مرتبطون.", "No linked employees.")}</p>
                )}

                <div className="mt-auto flex gap-2 border-t border-slate-100 pt-3">
                  <Link href={`/employers/${employer.id}`} className={`${primaryBtn} flex-1 px-3 py-2`}>
                    {t("فتح الملف", "Open")}
                  </Link>
                  {canHire ? (
                    <Link href={`/employees/new?employerId=${employer.id}`} className={`${secondaryBtn} px-3 py-2`} title={t("إضافة موظف", "Add employee")}>
                      <UserPlus size={16} />
                    </Link>
                  ) : null}
                  {showPay ? (
                    <Link href={`/salaries?employerId=${employer.id}&year=${year}&month=${month}`} className={`${secondaryBtn} px-3 py-2`} title={t("الرواتب", "Payroll")}>
                      {t("رواتب", "Pay")}
                    </Link>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {view === "contacts" && contacts && resultCount ? (
        <ContactsDirectory contacts={contacts} lang={lang} t={t} sp={sp} locale={locale} />
      ) : null}
    </div>
  );
}

function SponsorAvatar({ logoUrl, title, size }: { logoUrl: string | null; title: string; size: "xs" | "sm" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-xl text-lg" : size === "sm" ? "h-10 w-10 rounded-lg text-base" : "h-8 w-8 rounded-lg text-sm";
  return logoUrl ? (
    <img src={logoUrl} alt="" className={cn(box, "shrink-0 border border-slate-200 bg-white object-contain p-0.5")} />
  ) : (
    <span className={cn(box, "flex shrink-0 items-center justify-center bg-teal-800 font-bold text-white")}>{title.slice(0, 1)}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        STATUS_TONE[status] === "green"
          ? "bg-emerald-500"
          : STATUS_TONE[status] === "red"
            ? "bg-red-500"
            : STATUS_TONE[status] === "amber"
              ? "bg-amber-500"
              : "bg-slate-300",
      )}
    />
  );
}

type Row = {
  key: string;
  href: string;
  name: string;
  secondName: string | null;
  type: "COMPANY" | "PERSON" | "EMPLOYEE";
  relation: string;
  relationNode: React.ReactNode;
  phone: string | null;
  email: string | null;
  extra: string | null;
  status?: string;
};

function ContactsDirectory({
  contacts,
  lang,
  t,
  sp,
  locale,
}: {
  contacts: Awaited<ReturnType<typeof loadContacts>>;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
  sp: { sort?: string; dir?: string; fname?: string; fkind?: string; frelation?: string; fphone?: string; femail?: string; fextra?: string };
  locale: string;
}) {
  const rows: Row[] = [
    ...contacts.sponsors.map((sponsor) => {
      const name = lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name;
      const other = lang === "en" ? sponsor.name : sponsor.nameEn;
      const relation = t(`${sponsor.contactCount} جهة اتصال مرتبطة`, `${sponsor.contactCount} linked contact(s)`);
      return {
        key: `s-${sponsor.id}`,
        href: `/employers/${sponsor.id}`,
        name,
        secondName: other && other !== name ? other : null,
        type: sponsor.kind === "PERSON" ? ("PERSON" as const) : ("COMPANY" as const),
        relation,
        relationNode: (
          <Link href={`/employers?view=contacts&employerId=${sponsor.id}`} className="font-semibold text-teal-800">
            {relation}
          </Link>
        ),
        phone: formatPhone(sponsor.phone),
        email: sponsor.email,
        extra: sponsor.idNumber,
      };
    }),
    ...contacts.employees.map((employee) => {
      const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
      const other = lang === "en" ? employee.fullName : employee.nameEn;
      const sponsor = employee.employer;
      const sponsorLabel = sponsor ? (lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name) : "";
      const relation = sponsor ? `${t("يتبع: ", "Works for: ")}${sponsorLabel}` : t("بدون كفيل", "No sponsor");
      return {
        key: `e-${employee.id}`,
        href: `/employees/${employee.id}`,
        name,
        secondName: other && other !== name ? other : null,
        type: "EMPLOYEE" as const,
        relation,
        relationNode: sponsor ? (
          <Link href={`/employers/${sponsor.id}`} className="hover:text-teal-800">
            {t("يتبع: ", "Works for: ")}
            <span className="font-semibold">{sponsorLabel}</span>
          </Link>
        ) : (
          <span className="text-amber-700">{t("بدون كفيل", "No sponsor")}</span>
        ),
        phone: formatPhone(employee.phone),
        email: employee.email,
        extra: [employee.employeeNumber, termText(employee.jobTitle, employee.jobTitleEn, lang)].filter(Boolean).join(" · "),
        status: employee.status,
      };
    }),
  ];

  const kindLabel = (row: Row) =>
    row.type === "EMPLOYEE" ? t("موظف", "Employee") : pick(EMPLOYER_KIND[row.type], lang, row.type);

  const contactSort = readSort(sp, [...CONTACT_COLS], "name");
  const listed = rows
    .filter(
      (row) =>
        includesText(row.name, sp.fname) &&
        includesText(kindLabel(row), sp.fkind) &&
        includesText(row.relation, sp.frelation) &&
        includesText(row.phone || "", sp.fphone) &&
        includesText(row.email || "", sp.femail) &&
        includesText(row.extra || "", sp.fextra),
    )
    .sort((a, b) => {
      const label = (row: Row) => {
        if (contactSort.sort === "kind") return kindLabel(row);
        if (contactSort.sort === "relation") return row.relation;
        if (contactSort.sort === "phone") return row.phone || "";
        if (contactSort.sort === "email") return row.email || "";
        if (contactSort.sort === "extra") return row.extra || "";
        return row.name;
      };
      return compareText(label(a), label(b), contactSort.dir, locale);
    });

  const typeBadge = (row: Row) =>
    row.type === "EMPLOYEE" ? (
      <ToneBadge tone="sky">
        <UserRound size={12} className="me-1" />
        {t("موظف", "Employee")}
      </ToneBadge>
    ) : (
      <ToneBadge tone="teal">
        {row.type === "PERSON" ? <User size={12} className="me-1" /> : <Building2 size={12} className="me-1" />}
        {pick(EMPLOYER_KIND[row.type], lang, row.type)}
      </ToneBadge>
    );

  if (!listed.length) {
    return <EmptyState icon={SearchX} title={t("لا توجد نتائج مطابقة", "No matching results")} text={t("جرّب بحث عمود آخر.", "Try another column search.")} />;
  }

  return (
    <div className="table-shell">
      <table className="table-stack table-tools min-w-full text-sm">
        <thead>
          <tr>
            <ColumnHead column="name" label={t("الاسم", "Name")} />
            <ColumnHead column="kind" label={t("النوع", "Type")} />
            <ColumnHead column="relation" label={t("الارتباط", "Relation")} />
            <ColumnHead column="phone" label={t("الهاتف", "Phone")} className="hidden sm:table-cell" />
            <ColumnHead column="email" label={t("البريد", "Email")} className="hidden md:table-cell" />
            <ColumnHead column="extra" label={t("بيانات أخرى", "Other")} className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody>
          {listed.map((row) => (
            <tr key={row.key}>
              <td className="cell-title px-4 py-3">
                <Link href={row.href} className="flex items-center gap-1.5 font-semibold text-slate-900 hover:text-teal-800">
                  {row.status ? <StatusDot status={row.status} /> : null}
                  {row.name}
                </Link>
                {row.secondName ? (
                  <span className="block text-xs text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                    {row.secondName}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 whitespace-nowrap" data-label={t("النوع", "Type")}>
                {typeBadge(row)}
              </td>
              <td className="px-4 py-3" data-label={t("الارتباط", "Relation")}>
                {row.relationNode}
              </td>
              <td className="hidden px-4 py-3 whitespace-nowrap sm:table-cell" data-label={t("الهاتف", "Phone")}>
                {row.phone ? (
                  <a href={phoneHref(row.phone)} className="hover:text-teal-800" dir="ltr">
                    {row.phone}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="hidden max-w-52 truncate px-4 py-3 md:table-cell" data-label={t("البريد", "Email")}>
                {row.email ? (
                  <a href={`mailto:${row.email}`} className="hover:text-teal-800" dir="ltr">
                    {row.email}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="hidden px-4 py-3 text-slate-600 lg:table-cell" data-label={t("بيانات أخرى", "Other")}>
                {row.extra || "—"}
                {row.status && row.status !== "ACTIVE" ? (
                  <span className="ms-2">
                    <ToneBadge tone={STATUS_TONE[row.status] || "slate"}>{pick(STATUS_LABEL[row.status], lang, row.status)}</ToneBadge>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
