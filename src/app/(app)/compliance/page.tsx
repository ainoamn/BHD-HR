import Link from "next/link";
import { Flag, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { DOC_LABEL } from "@/lib/constants";
import { describeExpiry } from "@/lib/expiry";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { omanization } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

const RENEWAL_TYPES = ["WORK_PERMIT", "VISA", "RESIDENCE", "ID_CARD", "PASSPORT"] as const;

export default async function CompliancePage() {
  const user = await requireUser();
  if (!can(user, "reports.view") && !can(user, "documents.view") && !can(user, "employees.view")) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
  const { lang, t } = await getI18n();
  const limits = { urgent: user.company.alertUrgentDays, warning: user.company.alertWarningDays, early: user.company.alertEarlyDays };
  const [staff, documents] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] } },
      select: {
        id: true,
        fullName: true,
        nameEn: true,
        employeeNumber: true,
        nationality: true,
        department: true,
        departmentEn: true,
        idExpiry: true,
        passportExpiry: true,
        residenceExpiry: true,
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.employeeDocument.findMany({
      where: { employee: { companyId: user.companyId, status: { in: ["ACTIVE", "VACATION"] } }, type: { in: [...RENEWAL_TYPES] }, expiryDate: { not: null } },
      select: { id: true, type: true, documentNo: true, expiryDate: true, employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true } } },
    }),
  ]);
  const name = (row: { fullName: string; nameEn: string | null }) => (lang === "en" && row.nameEn ? row.nameEn : row.fullName);
  const rows = [
    ...staff.flatMap((employee) =>
      (
        [
          ["ID_CARD", employee.idExpiry],
          ["PASSPORT", employee.passportExpiry],
          ["RESIDENCE", employee.residenceExpiry],
        ] as const
      )
        .filter((entry): entry is [(typeof entry)[0], Date] => Boolean(entry[1]))
        .map(([type, date]) => ({
          key: `${employee.id}-${type}`,
          employeeId: employee.id,
          who: name(employee),
          number: employee.employeeNumber,
          type,
          documentNo: "",
          date,
          status: describeExpiry(date, limits, lang),
        })),
    ),
    ...documents.map((doc) => ({
      key: doc.id,
      employeeId: doc.employee.id,
      who: name(doc.employee),
      number: doc.employee.employeeNumber,
      type: doc.type,
      documentNo: doc.documentNo || "",
      date: doc.expiryDate!,
      status: describeExpiry(doc.expiryDate, limits, lang),
    })),
  ]
    .filter((row) => row.status.key !== "ok")
    .sort((a, b) => a.status.days - b.status.days);
  const rate = omanization(staff.filter((employee) => employee.nationality !== undefined));
  const label = (type: string) => {
    const known = DOC_LABEL[type as keyof typeof DOC_LABEL];
    return known ? (lang === "en" ? known.en : known.ar) : type;
  };

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={ShieldCheck}
        title={t("الامتثال والتجديدات", "Compliance and renewals")}
        description={t(
          "أولوية انتهاء البطاقة والجواز والإقامة والتأشيرة وتصريح العمل، مع نسبة التعمين وروابط ملفات الرواتب.",
          "Priority list for ID, passport, residence, visa and work-permit expiry, plus Omanization and payroll file links.",
        )}
      />

      <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Flag size={16} className="text-teal-700" />
            {t("التعمين", "Omanization")} — {rate.percent}% ({rate.omani}/{rate.total})
          </h2>
          {can(user, "reports.view") ? (
            <Link href="/reports/omanization" className="text-sm font-semibold text-teal-800 underline">
              {t("تنزيل CSV", "Download CSV")}
            </Link>
          ) : null}
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {rate.departments.map((group) => (
            <li key={group.name || "none"} className="rounded-xl bg-slate-50 px-3 py-2">
              {(lang === "en" && group.nameEn ? group.nameEn : group.name) || t("بدون قسم", "No department")}: {group.omani}/{group.total} ({group.percent}%)
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-900">{t("ما يحتاج تجديداً", "Due for renewal")}</h2>
          <p className="text-xs text-slate-500">{t("المستندات السارية خارج نافذة التنبيه لا تظهر هنا.", "Documents still valid outside the alert window are hidden.")}</p>
        </div>
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.slice(0, 80).map((row) => (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/employees/${row.employeeId}?tab=docs`} className="font-semibold text-slate-900 hover:underline">
                    {row.who}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {row.number} · {label(row.type)}
                    {row.documentNo ? ` · ${row.documentNo}` : ""} · {formatDate(row.date)}
                  </p>
                </div>
                <span className={row.status.tone === "red" ? "font-semibold text-red-700" : row.status.tone === "orange" ? "font-semibold text-orange-700" : "text-amber-800"}>
                  {row.status.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("لا مستندات قاربت على الانتهاء.", "No documents are close to expiry.")}</p>
        )}
      </section>

      <section className="flex flex-wrap gap-3 text-sm">
        {can(user, "salaries.view") ? (
          <>
            <Link href="/salaries" className="rounded-xl bg-teal-800 px-3 py-2 font-semibold text-white">
              {t("شهر الرواتب", "Payroll month")}
            </Link>
            <Link href="/salaries/review" className="rounded-xl px-3 py-2 font-semibold text-teal-900 ring-1 ring-inset ring-teal-200">
              {t("مراجعة الحماية وملف البنك", "Review social protection and the bank file")}
            </Link>
          </>
        ) : null}
        <Link href="/employees/complete" className="rounded-xl px-3 py-2 font-semibold text-slate-800 ring-1 ring-inset ring-slate-200">
          {t("إكمال البيانات الناقصة", "Complete missing details")}
        </Link>
      </section>
    </div>
  );
}
