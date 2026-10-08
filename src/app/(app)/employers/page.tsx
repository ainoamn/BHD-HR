import Link from "next/link";
import { Building2, Contact, FileText, LayoutGrid, List, Mail, MapPin, Phone, Plus, Printer, Search, User, UserRound } from "lucide-react";
import { EmployerForm } from "@/components/employer-form";
import { Flash } from "@/components/flash";
import { Card, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { EMPLOYER_KIND, STATUS_LABEL, STATUS_TONE, localizeTerm } from "@/lib/constants";
import { type ContactKind, loadContacts, readContactKind } from "@/lib/contacts";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { cn, currentPeriod, money } from "@/lib/utils";
import { createEmployer } from "@/server/employer-actions";

const CHIP_LIMIT = 6;
type View = "cards" | "list" | "contacts";

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; view?: string; employerId?: string; new?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const q = sp.q?.trim() || "";
  const view: View = sp.view === "list" || sp.view === "contacts" ? sp.view : "cards";
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
              ? { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }, { idNumber: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] }
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
  const linkedCount = await prisma.employee.count({ where: { companyId: user.companyId, employerId: { not: null }, status: { not: "TERMINATED" } } });
  const { year, month } = currentPeriod();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const filtered = Boolean(q || kind || employerId);
  const openForm = totalEmployers === 0 || sp.new === "1" || Boolean(sp.error);
  const sponsorName = (sponsor: { name: string; nameEn: string | null }) => (lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name);
  const personName = (person: { fullName: string; nameEn: string | null }) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);

  const href = (next: { view?: View; kind?: string; q?: string; employerId?: string }) => {
    const query = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextKind = next.kind ?? kind;
    const nextQ = next.q ?? q;
    const nextEmployer = next.employerId ?? employerId;
    if (nextView !== "cards") query.set("view", nextView);
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
    { id: "cards", label: t("بطاقات", "Cards"), icon: LayoutGrid },
    { id: "list", label: t("قائمة", "List"), icon: List },
    { id: "contacts", label: t("جهات الاتصال", "Contacts"), icon: Contact },
  ];
  const kinds = [
    { value: "", label: t("الكل", "All") },
    { value: "COMPANY", label: t("شركات ومنشآت", "Companies") },
    { value: "PERSON", label: t("أفراد", "Individuals") },
    ...(view === "contacts" ? [{ value: "EMPLOYEE", label: t("موظفون", "Employees") }] : []),
  ];
  const resultCount = view === "contacts" ? (contacts?.sponsors.length || 0) + (contacts?.employees.length || 0) : employers.length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t("دفتر العناوين", "Address book")}
        description={t(
          "سجل الكفلاء وأصحاب العمل وجهات الاتصال. تُصرف رواتب كل موظف باسم كفيله وشعاره، وكل موظف تربطه بكفيل يظهر تحته هنا تلقائياً.",
          "Your sponsors, employers and contacts. Each employee is paid under their sponsor's name and logo, and every linked employee appears under that sponsor here automatically.",
        )}
      >
        <div className="flex flex-wrap gap-2">
          <Link href={printHref} target="_blank" className={secondaryBtn}>
            <Printer size={16} />
            {t("طباعة جهات الاتصال", "Print contacts")}
          </Link>
          <Link href="/employers?new=1#new" className={primaryBtn}>
            <Plus size={16} />
            {t("كفيل جديد", "New sponsor")}
          </Link>
        </div>
      </PageHeader>

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-3 gap-3">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("الكفلاء", "Sponsors")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{totalEmployers}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("موظفون مرتبطون", "Linked employees")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{linkedCount}</p>
        </div>
        <Link
          href="/employees?employerId=none"
          className={cn(
            "min-w-0 rounded-2xl border bg-white p-4 shadow-sm",
            unlinked > 0 ? "border-amber-200 hover:border-amber-300" : "border-slate-200",
          )}
        >
          <p className="text-xs text-slate-500">{t("بدون كفيل", "Without sponsor")}</p>
          <p className={cn("mt-1 text-xl font-bold", unlinked > 0 ? "text-amber-700" : "text-slate-900")}>{unlinked}</p>
        </Link>
      </div>

      <details id="new" open={openForm} className="group scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <span className="flex items-center gap-2 font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
              <Plus size={16} />
            </span>
            {t("إضافة كفيل / صاحب عمل", "Add sponsor / employer")}
          </span>
          <span className="text-xs font-semibold text-teal-800">
            <span className="group-open:hidden">{t("فتح", "Open")}</span>
            <span className="hidden group-open:inline">{t("إغلاق", "Close")}</span>
          </span>
        </summary>
        <div className="border-t border-slate-100 px-4 py-5 sm:px-5">
          <EmployerForm action={createEmployer} submitLabel={t("حفظ الكفيل", "Save sponsor")} />
        </div>
      </details>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form method="get" className="flex w-full gap-2 md:max-w-md">
            {view !== "cards" ? <input type="hidden" name="view" value={view} /> : null}
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${fieldClass} w-full ps-9`}
                name="q"
                defaultValue={q}
                placeholder={t("ابحث بالاسم أو الهاتف أو البريد", "Search name, phone or email")}
              />
            </div>
            <button className={secondaryBtn} type="submit">
              {t("بحث", "Search")}
            </button>
          </form>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label={t("طريقة العرض", "View")}>
            {views.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={href({ view: item.id })}
                  role="tab"
                  aria-selected={view === item.id}
                  className={cn(
                    "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold",
                    view === item.id ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {kinds.map((item) => (
              <Link
                key={item.value || "all"}
                href={href({ kind: item.value })}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-center text-sm font-semibold ring-1",
                  kind === item.value ? "bg-teal-800 text-white ring-teal-800" : "text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          {view === "contacts" ? (
            <form method="get" className="flex gap-2">
              <input type="hidden" name="view" value="contacts" />
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <select className={`${fieldClass} min-w-0 flex-1 sm:w-56`} name="employerId" defaultValue={employerId} aria-label={t("الكفيل", "Sponsor")}>
                <option value="">{t("كل الكفلاء", "All sponsors")}</option>
                {sponsorOptions.map((sponsor) => (
                  <option key={sponsor.id} value={sponsor.id}>
                    {sponsorName(sponsor)}
                  </option>
                ))}
                <option value="none">{t("بدون كفيل", "No sponsor")}</option>
              </select>
              <button className={secondaryBtn} type="submit">
                {t("عرض", "Show")}
              </button>
            </form>
          ) : null}
        </div>
        {filtered ? (
          <p className="text-xs text-slate-500">
            {t(`${resultCount} نتيجة`, `${resultCount} result(s)`)} ·{" "}
            <Link href={href({ kind: "", q: "", employerId: "" })} className="font-semibold text-teal-800">
              {t("مسح الفلاتر", "Clear filters")}
            </Link>
          </p>
        ) : null}
      </div>

      {resultCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="font-bold text-slate-800">
            {filtered ? t("لا توجد نتائج مطابقة", "No matching results") : t("لا يوجد كفلاء بعد", "No sponsors yet")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filtered
              ? t("جرّب كلمة بحث أخرى أو اعرض الكل.", "Try another search or show all.")
              : t("أضف أول كفيل من النموذج أعلاه، أو من نموذج إضافة موظف مباشرة.", "Add your first sponsor with the form above, or straight from the add-employee form.")}
          </p>
        </div>
      ) : null}

      {view === "cards" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {employers.map((employer) => {
            const title = sponsorName(employer);
            const otherName = lang === "en" ? (employer.nameEn ? employer.name : null) : employer.nameEn;
            const subtitle = otherName && otherName.trim() !== title.trim() ? otherName : null;
            const active = employer.employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION");
            const monthly = active.reduce((sum, employee) => sum + packageGross(employee), 0);
            const details = [
              employer.idNumber ? { icon: FileText, label: t("السجل / الرقم المدني", "CR / civil ID"), value: employer.idNumber, href: null } : null,
              employer.phone ? { icon: Phone, label: t("الهاتف", "Phone"), value: employer.phone, href: `tel:${employer.phone}` } : null,
              employer.email ? { icon: Mail, label: t("البريد", "Email"), value: employer.email, href: `mailto:${employer.email}` } : null,
              employer.address ? { icon: MapPin, label: t("العنوان", "Address"), value: employer.address, href: null } : null,
            ].filter((item): item is NonNullable<typeof item> => Boolean(item));
            const KindIcon = employer.kind === "PERSON" ? User : Building2;
            return (
              <Card key={employer.id} className="flex flex-col p-0 sm:p-0">
                <div className="flex items-start gap-3 p-4 sm:p-5">
                  <SponsorAvatar logoUrl={employer.logoUrl} title={title} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/employers/${employer.id}`} className="break-words text-lg font-bold text-slate-900 hover:text-teal-800">
                        {title}
                      </Link>
                      <ToneBadge tone="teal">
                        <KindIcon size={12} className="me-1" />
                        {pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}
                      </ToneBadge>
                    </div>
                    {subtitle ? (
                      <p className="mt-0.5 break-words text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="px-4 sm:px-5">
                  {details.length ? (
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {details.map((item) => {
                        const Icon = item.icon;
                        const value = item.href ? (
                          <a href={item.href} className="hover:text-teal-800" dir="ltr">
                            {item.value}
                          </a>
                        ) : (
                          <span dir={item.icon === MapPin ? undefined : "ltr"}>{item.value}</span>
                        );
                        return (
                          <div key={item.label} className={cn("flex min-w-0 items-start gap-2 text-sm", item.icon === MapPin && "sm:col-span-2")}>
                            <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
                            <dt className="sr-only">{item.label}</dt>
                            <dd className="min-w-0 break-words text-slate-700">{value}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {t("لا توجد بيانات تواصل.", "No contact details.")}{" "}
                      <Link href={`/employers/${employer.id}#details`} className="font-semibold text-teal-800">
                        {t("أكملها", "Add them")}
                      </Link>
                    </p>
                  )}
                </div>

                <div className="mx-4 mt-4 grid grid-cols-2 divide-x divide-slate-200 rounded-xl bg-slate-50 py-2.5 text-center rtl:divide-x-reverse sm:mx-5">
                  <div>
                    <p className="text-xs text-slate-500">{t("موظفون نشطون", "Active employees")}</p>
                    <p className="font-bold text-slate-900">
                      {active.length}
                      {employer.employees.length > active.length ? (
                        <span className="text-xs font-normal text-slate-500"> / {employer.employees.length}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="min-w-0 px-2">
                    <p className="text-xs text-slate-500">{t("الرواتب الشهرية", "Monthly payroll")}</p>
                    <p className="truncate font-bold text-slate-900">{money(monthly, currency)}</p>
                  </div>
                </div>

                <div className="flex-1 px-4 pt-4 sm:px-5">
                  <p className="mb-2 text-xs font-semibold text-slate-500">{t("الموظفون", "Employees")}</p>
                  {employer.employees.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("لا يوجد موظفون مرتبطون بعد.", "No linked employees yet.")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {employer.employees.slice(0, CHIP_LIMIT).map((employee) => (
                        <Link
                          key={employee.id}
                          href={`/employees/${employee.id}`}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-sm ring-1 ring-slate-200 hover:text-teal-800 hover:ring-teal-200"
                        >
                          <StatusDot status={employee.status} />
                          <span className="truncate">{personName(employee)}</span>
                          <span className="text-xs text-slate-400">{employee.employeeNumber}</span>
                        </Link>
                      ))}
                      {employer.employees.length > CHIP_LIMIT ? (
                        <Link href={`/employers/${employer.id}`} className="rounded-lg px-2.5 py-1 text-sm font-semibold text-teal-800">
                          {t(`+${employer.employees.length - CHIP_LIMIT} آخرين`, `+${employer.employees.length - CHIP_LIMIT} more`)}
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 p-3 sm:flex sm:flex-wrap sm:px-5">
                  <Link href={`/employers/${employer.id}`} className={`${primaryBtn} px-3 py-2`}>
                    {t("فتح الملف", "Open")}
                  </Link>
                  <Link href={`/employees/new?employerId=${employer.id}`} className={`${secondaryBtn} px-3 py-2`}>
                    {t("إضافة موظف", "Add employee")}
                  </Link>
                  <Link href={`/salaries?employerId=${employer.id}`} className={`${secondaryBtn} px-3 py-2`}>
                    {t("الرواتب", "Payroll")}
                  </Link>
                  <Link href={`/salaries/sheet?from=${period}&to=${period}&employerId=${employer.id}`} target="_blank" className={`${secondaryBtn} px-3 py-2`}>
                    {t("كشف الشهر", "Month sheet")}
                  </Link>
                  <Link href={`/address-book/print?employerId=${employer.id}`} target="_blank" className={`${secondaryBtn} col-span-2 px-3 py-2`}>
                    <Printer size={15} />
                    {t("طباعة جهات الاتصال", "Print contacts")}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {view === "list" && employers.length ? (
        <>
          <div className="space-y-2 md:hidden">
            {employers.map((employer) => {
              const active = employer.employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION").length;
              return (
                <div key={employer.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <SponsorAvatar logoUrl={employer.logoUrl} title={sponsorName(employer)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/employers/${employer.id}`} className="block break-words font-bold text-slate-900">
                        {sponsorName(employer)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)} · {t(`${active} موظف نشط`, `${active} active`)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    {employer.phone ? (
                      <a href={`tel:${employer.phone}`} className="inline-flex items-center gap-1" dir="ltr">
                        <Phone size={13} className="text-slate-400" />
                        {employer.phone}
                      </a>
                    ) : null}
                    {employer.email ? (
                      <a href={`mailto:${employer.email}`} className="inline-flex min-w-0 items-center gap-1 break-all" dir="ltr">
                        <Mail size={13} className="shrink-0 text-slate-400" />
                        {employer.email}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-start">{t("الكفيل", "Sponsor")}</th>
                  <th className="px-4 py-3 text-start">{t("النوع", "Type")}</th>
                  <th className="px-4 py-3 text-start">{t("السجل / المدني", "CR / ID")}</th>
                  <th className="px-4 py-3 text-start">{t("الهاتف", "Phone")}</th>
                  <th className="px-4 py-3 text-start">{t("البريد", "Email")}</th>
                  <th className="px-4 py-3 text-start">{t("الموظفون", "Employees")}</th>
                  <th className="px-4 py-3 text-start">{t("الرواتب الشهرية", "Monthly payroll")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {employers.map((employer) => {
                  const activeList = employer.employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION");
                  return (
                    <tr key={employer.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/employers/${employer.id}`} className="flex items-center gap-2.5 font-semibold text-slate-900 hover:text-teal-800">
                          <SponsorAvatar logoUrl={employer.logoUrl} title={sponsorName(employer)} size="xs" />
                          {sponsorName(employer)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{pick(EMPLOYER_KIND[employer.kind], lang, employer.kind)}</td>
                      <td className="px-4 py-3" dir="ltr">{employer.idNumber || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {employer.phone ? (
                          <a href={`tel:${employer.phone}`} className="hover:text-teal-800" dir="ltr">
                            {employer.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-52 truncate px-4 py-3">
                        {employer.email ? (
                          <a href={`mailto:${employer.email}`} className="hover:text-teal-800" dir="ltr">
                            {employer.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold">{activeList.length}</span>
                        {employer.employees.length > activeList.length ? <span className="text-xs text-slate-500"> / {employer.employees.length}</span> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{money(activeList.reduce((sum, employee) => sum + packageGross(employee), 0), currency)}</td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <Link href={`/address-book/print?employerId=${employer.id}`} target="_blank" className="me-3 text-xs font-semibold text-slate-600 hover:text-teal-800">
                          {t("طباعة", "Print")}
                        </Link>
                        <Link href={`/employers/${employer.id}`} className="text-xs font-semibold text-teal-800">
                          {t("فتح", "Open")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {view === "contacts" && contacts && resultCount ? (
        <ContactsDirectory contacts={contacts} lang={lang} t={t} />
      ) : null}
    </div>
  );
}

function SponsorAvatar({ logoUrl, title, size }: { logoUrl: string | null; title: string; size: "xs" | "sm" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-xl text-xl" : size === "sm" ? "h-10 w-10 rounded-lg text-base" : "h-8 w-8 rounded-lg text-sm";
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
        STATUS_TONE[status] === "green" ? "bg-emerald-500" : STATUS_TONE[status] === "red" ? "bg-red-500" : STATUS_TONE[status] === "amber" ? "bg-amber-500" : "bg-slate-300",
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
  relation: React.ReactNode;
  phone: string | null;
  email: string | null;
  extra: string | null;
  status?: string;
};

function ContactsDirectory({
  contacts,
  lang,
  t,
}: {
  contacts: Awaited<ReturnType<typeof loadContacts>>;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const rows: Row[] = [
    ...contacts.sponsors.map((sponsor) => {
      const name = lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name;
      const other = lang === "en" ? sponsor.name : sponsor.nameEn;
      return {
        key: `s-${sponsor.id}`,
        href: `/employers/${sponsor.id}`,
        name,
        secondName: other && other !== name ? other : null,
        type: sponsor.kind === "PERSON" ? ("PERSON" as const) : ("COMPANY" as const),
        relation: (
          <Link href={`/employers?view=contacts&employerId=${sponsor.id}`} className="font-semibold text-teal-800">
            {t(`${sponsor.contactCount} جهة اتصال مرتبطة`, `${sponsor.contactCount} linked contact(s)`)}
          </Link>
        ),
        phone: sponsor.phone,
        email: sponsor.email,
        extra: sponsor.idNumber,
      };
    }),
    ...contacts.employees.map((employee) => {
      const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
      const other = lang === "en" ? employee.fullName : employee.nameEn;
      const sponsor = employee.employer;
      return {
        key: `e-${employee.id}`,
        href: `/employees/${employee.id}`,
        name,
        secondName: other && other !== name ? other : null,
        type: "EMPLOYEE" as const,
        relation: sponsor ? (
          <Link href={`/employers/${sponsor.id}`} className="hover:text-teal-800">
            {t("يتبع: ", "Works for: ")}
            <span className="font-semibold">{lang === "en" && sponsor.nameEn ? sponsor.nameEn : sponsor.name}</span>
          </Link>
        ) : (
          <span className="text-amber-700">{t("بدون كفيل", "No sponsor")}</span>
        ),
        phone: employee.phone,
        email: employee.email,
        extra: [employee.employeeNumber, localizeTerm(employee.jobTitle, lang)].filter(Boolean).join(" · "),
        status: employee.status,
      };
    }),
  ];
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

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={row.href} className="block break-words font-bold text-slate-900">
                  {row.name}
                </Link>
                {row.secondName ? (
                  <p className="break-words text-xs text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                    {row.secondName}
                  </p>
                ) : null}
              </div>
              {typeBadge(row)}
            </div>
            <p className="mt-1.5 text-sm text-slate-600">{row.relation}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              {row.phone ? (
                <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1" dir="ltr">
                  <Phone size={13} className="text-slate-400" />
                  {row.phone}
                </a>
              ) : null}
              {row.email ? (
                <a href={`mailto:${row.email}`} className="inline-flex min-w-0 items-center gap-1 break-all" dir="ltr">
                  <Mail size={13} className="shrink-0 text-slate-400" />
                  {row.email}
                </a>
              ) : null}
              {!row.phone && !row.email ? <span className="text-slate-400">{t("لا توجد بيانات تواصل", "No contact details")}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-4 py-3 text-start">{t("الاسم", "Name")}</th>
              <th className="px-4 py-3 text-start">{t("النوع", "Type")}</th>
              <th className="px-4 py-3 text-start">{t("الارتباط", "Relation")}</th>
              <th className="px-4 py-3 text-start">{t("الهاتف", "Phone")}</th>
              <th className="px-4 py-3 text-start">{t("البريد", "Email")}</th>
              <th className="px-4 py-3 text-start">{t("بيانات أخرى", "Other")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 whitespace-nowrap">{typeBadge(row)}</td>
                <td className="px-4 py-3">{row.relation}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.phone ? (
                    <a href={`tel:${row.phone}`} className="hover:text-teal-800" dir="ltr">
                      {row.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-52 truncate px-4 py-3">
                  {row.email ? (
                    <a href={`mailto:${row.email}`} className="hover:text-teal-800" dir="ltr">
                      {row.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
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
    </>
  );
}
