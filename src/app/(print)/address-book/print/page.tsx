import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, headerFor, sheetClass } from "@/components/salary-docs";
import { fieldClass, secondaryBtn } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { EMPLOYER_KIND, STATUS_LABEL, bothTerm } from "@/lib/constants";
import { loadContacts, readContactKind } from "@/lib/contacts";
import { both } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatLongDate } from "@/lib/utils";

const cell = "border border-slate-200 px-2 py-1.5 align-top";

function Names({ ar, en }: { ar: string; en: string | null }) {
  return (
    <>
      <span className="block font-semibold">{ar}</span>
      {en && en !== ar ? (
        <span className="block text-[10px] text-slate-500" dir="ltr">
          {en}
        </span>
      ) : null}
    </>
  );
}

function Ltr({ value }: { value: string | null | undefined }) {
  return value ? <span dir="ltr">{value}</span> : <span className="text-slate-400">—</span>;
}

export default async function ContactsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ employerId?: string; kind?: string; q?: string; layout?: string; terminated?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("employers.view");
  const { t } = await getI18n();
  const employerId = sp.employerId || "";
  const kind = readContactKind(sp.kind);
  const q = sp.q?.trim() || "";
  const layout = sp.layout === "grouped" ? "grouped" : "flat";
  const includeTerminated = sp.terminated === "1";

  const [contacts, sponsorOptions, employer] = await Promise.all([
    loadContacts({ companyId: user.companyId, q, kind, employerId, includeTerminated }),
    prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" } }),
    employerId && employerId !== "none" ? prisma.employer.findFirst({ where: { id: employerId, companyId: user.companyId } }) : Promise.resolve(null),
  ]);
  const header = employer ? headerFor({ employerName: employer.name, employerNameEn: employer.nameEn, employer }, user.company) : headerFor({}, user.company);
  const scope = employer
    ? `${employer.name}${employer.nameEn && employer.nameEn !== employer.name ? ` / ${employer.nameEn}` : ""}`
    : employerId === "none"
      ? "بدون كفيل / No sponsor"
      : "جميع الكفلاء / All sponsors";
  const kindLabel =
    kind === "EMPLOYEE" ? "الموظفون / Employees" : kind ? both(EMPLOYER_KIND[kind]) : "الكل / All";
  const sponsorCount = contacts.sponsors.length;
  const employeeCount = contacts.employees.length;

  const groups = new Map<string, { id: string | null; name: string; nameEn: string | null; employees: typeof contacts.employees }>();
  if (layout === "grouped") {
    for (const sponsor of contacts.sponsors) groups.set(sponsor.id, { id: sponsor.id, name: sponsor.name, nameEn: sponsor.nameEn, employees: [] });
    for (const employee of contacts.employees) {
      const key = employee.employer?.id || "none";
      if (!groups.has(key)) {
        groups.set(key, {
          id: employee.employer?.id || null,
          name: employee.employer?.name || "بدون كفيل",
          nameEn: employee.employer ? employee.employer.nameEn : "No sponsor",
          employees: [],
        });
      }
      groups.get(key)!.employees.push(employee);
    }
  }
  const sponsorById = new Map(contacts.sponsors.map((sponsor) => [sponsor.id, sponsor]));
  const statusText = (status: string) => (STATUS_LABEL[status] ? both(STATUS_LABEL[status]) : status);
  const backQuery = new URLSearchParams({ view: "contacts" });
  if (employerId) backQuery.set("employerId", employerId);
  if (kind) backQuery.set("kind", kind);
  if (q) backQuery.set("q", q);

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 10mm; } .group-block { break-inside: avoid; } thead { display: table-header-group; } tr { break-inside: avoid; }`}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/employers?${backQuery.toString()}`} className="text-sm font-semibold text-teal-800">
            {t("رجوع لدفتر العناوين", "Back to address book")}
          </Link>
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
        <form method="get" className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-center">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <select className={`${fieldClass} w-full`} name="employerId" defaultValue={employerId} aria-label={t("الكفيل", "Sponsor")}>
            <option value="">{t("كل الكفلاء", "All sponsors")}</option>
            {sponsorOptions.map((sponsor) => (
              <option key={sponsor.id} value={sponsor.id}>
                {t(sponsor.name, sponsor.nameEn || sponsor.name)}
              </option>
            ))}
            <option value="none">{t("بدون كفيل", "No sponsor")}</option>
          </select>
          <select className={`${fieldClass} w-full`} name="kind" defaultValue={kind} aria-label={t("النوع", "Type")}>
            <option value="">{t("الكفلاء والموظفون", "Sponsors & employees")}</option>
            <option value="COMPANY">{t("الشركات فقط", "Companies only")}</option>
            <option value="PERSON">{t("الأفراد فقط", "Individuals only")}</option>
            <option value="EMPLOYEE">{t("الموظفون فقط", "Employees only")}</option>
          </select>
          <select className={`${fieldClass} w-full`} name="layout" defaultValue={layout} aria-label={t("التنسيق", "Layout")}>
            <option value="flat">{t("جدول واحد", "Single table")}</option>
            <option value="grouped">{t("مجمّع حسب الكفيل", "Grouped by sponsor")}</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="terminated" value="1" defaultChecked={includeTerminated} />
            {t("تضمين منتهي الخدمة", "Include terminated")}
          </label>
          <button className={secondaryBtn} type="submit">
            {t("تحديث", "Update")}
          </button>
        </form>
      </div>

      <article className={sheetClass}>
        <HeaderBar header={header} titleAr="دليل جهات الاتصال" titleEn="Contacts Directory" />
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-2">
          <p>
            <span className="text-slate-500">النطاق / Scope: </span>
            <strong>{scope}</strong>
          </p>
          <p>
            <span className="text-slate-500">النوع / Type: </span>
            <strong>{kindLabel}</strong>
          </p>
          <p>
            <span className="text-slate-500">العدد / Count: </span>
            <strong>
              {sponsorCount} كفيل / sponsor(s) · {employeeCount} موظف / employee(s)
            </strong>
          </p>
          <p>
            <span className="text-slate-500">تاريخ الطباعة / Printed: </span>
            <strong>{formatLongDate("ar")}</strong>
          </p>
          {q ? (
            <p className="sm:col-span-2 print:col-span-2">
              <span className="text-slate-500">بحث / Search: </span>
              <strong>{q}</strong>
            </p>
          ) : null}
        </div>

        {employer ? (
          <section className="group-block mt-5 rounded-xl border border-slate-200 p-3 text-sm">
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
              <p>
                <span className="text-slate-500">النوع / Type: </span>
                {both(EMPLOYER_KIND[employer.kind] || EMPLOYER_KIND.COMPANY)}
              </p>
              <p>
                <span className="text-slate-500">السجل / CR-ID: </span>
                <Ltr value={employer.idNumber} />
              </p>
              <p>
                <span className="text-slate-500">الهاتف / Phone: </span>
                <Ltr value={employer.phone} />
              </p>
              <p>
                <span className="text-slate-500">البريد / Email: </span>
                <Ltr value={employer.email} />
              </p>
              <p className="sm:col-span-2 print:col-span-2">
                <span className="text-slate-500">العنوان / Address: </span>
                {employer.address || "—"}
              </p>
              <p className="sm:col-span-2 print:col-span-2">
                <span className="text-slate-500">جهات الاتصال المرتبطة / Linked contacts: </span>
                <strong>{sponsorById.get(employer.id)?.contactCount ?? employeeCount}</strong>
              </p>
            </div>
          </section>
        ) : null}

        {sponsorCount + employeeCount === 0 ? (
          <p className="mt-6 text-sm text-slate-500">لا توجد جهات اتصال مطابقة / No matching contacts</p>
        ) : null}

        {layout === "flat" && sponsorCount + employeeCount > 0 ? (
          <div className="mt-5 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[640px] border-collapse text-xs print:min-w-0">
              <thead>
                <tr className="bg-slate-100">
                  <th className={`${cell} w-8 text-start`}>#</th>
                  <th className={`${cell} text-start`}><Bi ar="الاسم" en="Name" /></th>
                  <th className={`${cell} text-start`}><Bi ar="النوع" en="Type" /></th>
                  <th className={`${cell} text-start`}><Bi ar="الارتباط" en="Relation" /></th>
                  <th className={`${cell} text-start`}><Bi ar="الهاتف" en="Phone" /></th>
                  <th className={`${cell} text-start`}><Bi ar="البريد" en="Email" /></th>
                  <th className={`${cell} text-start`}><Bi ar="بيانات أخرى" en="Other" /></th>
                </tr>
              </thead>
              <tbody>
                {contacts.sponsors.map((sponsor, index) => (
                  <tr key={sponsor.id} className="bg-teal-50/40" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                    <td className={cell}>{index + 1}</td>
                    <td className={cell}><Names ar={sponsor.name} en={sponsor.nameEn} /></td>
                    <td className={cell}>{both(EMPLOYER_KIND[sponsor.kind] || EMPLOYER_KIND.COMPANY)}</td>
                    <td className={cell}>
                      <strong>{sponsor.contactCount}</strong> جهة اتصال / contact(s)
                    </td>
                    <td className={`${cell} whitespace-nowrap`}><Ltr value={sponsor.phone} /></td>
                    <td className={`${cell} break-all`}><Ltr value={sponsor.email} /></td>
                    <td className={cell}>
                      {sponsor.idNumber ? (
                        <>
                          <span className="text-slate-500">CR: </span>
                          <span dir="ltr">{sponsor.idNumber}</span>
                        </>
                      ) : null}
                      {sponsor.address ? <span className="block text-[10px] text-slate-500">{sponsor.address}</span> : null}
                      {!sponsor.idNumber && !sponsor.address ? "—" : null}
                    </td>
                  </tr>
                ))}
                {contacts.employees.map((employee, index) => (
                  <tr key={employee.id}>
                    <td className={cell}>{sponsorCount + index + 1}</td>
                    <td className={cell}><Names ar={employee.fullName} en={employee.nameEn} /></td>
                    <td className={cell}>موظف / Employee</td>
                    <td className={cell}>
                      {employee.employer ? (
                        <>
                          <span className="text-slate-500">يتبع / Works for: </span>
                          <Names ar={employee.employer.name} en={employee.employer.nameEn} />
                        </>
                      ) : (
                        "بدون كفيل / No sponsor"
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap`}><Ltr value={employee.phone} /></td>
                    <td className={`${cell} break-all`}><Ltr value={employee.email} /></td>
                    <td className={cell}>
                      <span dir="ltr">{employee.employeeNumber}</span>
                      {employee.jobTitle ? <span className="block text-[10px] text-slate-500">{bothTerm(employee.jobTitle)}</span> : null}
                      {employee.status !== "ACTIVE" ? <span className="block text-[10px] text-slate-500">{statusText(employee.status)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {layout === "grouped"
          ? [...groups.entries()].map(([key, group]) => {
              const sponsor = group.id ? sponsorById.get(group.id) : undefined;
              return (
                <section key={key} className="mt-6">
                  <div className="group-block mb-2 flex flex-wrap items-end justify-between gap-2 border-b-2 border-teal-800 pb-1.5">
                    <div>
                      <h3 className="font-bold text-teal-900">
                        {group.name}
                        {group.nameEn && group.nameEn !== group.name ? <span className="ms-2 text-sm font-semibold text-slate-500" dir="ltr">{group.nameEn}</span> : null}
                      </h3>
                      {sponsor ? (
                        <p className="text-[11px] text-slate-600">
                          {both(EMPLOYER_KIND[sponsor.kind] || EMPLOYER_KIND.COMPANY)}
                          {sponsor.idNumber ? <> · CR: <span dir="ltr">{sponsor.idNumber}</span></> : null}
                          {sponsor.phone ? <> · <span dir="ltr">{sponsor.phone}</span></> : null}
                          {sponsor.email ? <> · <span dir="ltr">{sponsor.email}</span></> : null}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {sponsor ? sponsor.contactCount : group.employees.length} جهة اتصال / contact(s)
                    </span>
                  </div>
                  {group.employees.length === 0 ? (
                    <p className="text-xs text-slate-500">لا يوجد موظفون مرتبطون / No linked employees</p>
                  ) : (
                    <div className="overflow-x-auto print:overflow-visible">
                      <table className="w-full min-w-[600px] border-collapse text-xs print:min-w-0">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className={`${cell} w-8 text-start`}>#</th>
                            <th className={`${cell} text-start`}><Bi ar="الموظف" en="Employee" /></th>
                            <th className={`${cell} text-start`}><Bi ar="الرقم والوظيفة" en="No. & job" /></th>
                            <th className={`${cell} text-start`}><Bi ar="الهاتف" en="Phone" /></th>
                            <th className={`${cell} text-start`}><Bi ar="البريد" en="Email" /></th>
                            <th className={`${cell} text-start`}><Bi ar="الحالة" en="Status" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.employees.map((employee, index) => (
                            <tr key={employee.id}>
                              <td className={cell}>{index + 1}</td>
                              <td className={cell}><Names ar={employee.fullName} en={employee.nameEn} /></td>
                              <td className={cell}>
                                <span dir="ltr">{employee.employeeNumber}</span>
                                {employee.jobTitle ? <span className="block text-[10px] text-slate-500">{bothTerm(employee.jobTitle)}</span> : null}
                              </td>
                              <td className={`${cell} whitespace-nowrap`}><Ltr value={employee.phone} /></td>
                              <td className={`${cell} break-all`}><Ltr value={employee.email} /></td>
                              <td className={cell}>{statusText(employee.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })
          : null}
      </article>
    </div>
  );
}
