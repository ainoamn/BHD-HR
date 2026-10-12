import type { Metadata } from "next";
import { BadgeCheck, Briefcase, Building2, Hash, MapPin, Network, ShieldAlert, ShieldOff } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { headerFor } from "@/components/salary-docs";
import { Card } from "@/components/ui";
import { badgeEmployee } from "@/lib/badge";
import { termText } from "@/lib/constants";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** What anyone who scans an employee's QR code sees: identity and workplace only, never contact, ID or pay details. */
export default async function BadgePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { lang, t } = await getI18n();
  const employee = await badgeEmployee(token);
  if (!employee) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <Card className="text-center">
          <ShieldOff size={32} className="mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t("البطاقة غير صالحة", "This card is not valid")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("لم يُعثر على موظف بهذا الرمز، أو أُلغيت البطاقة وصدرت بطاقة جديدة.", "No employee matches this code, or the card was replaced by a new one.")}
          </p>
        </Card>
      </main>
    );
  }

  const company = employee.company;
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, company);
  const [logo, photo] = await Promise.all([inlineLogo(header.logoUrl, company.id), inlineLogo(employee.photoUrl, company.id)]);
  const issuer = lang === "en" && header.nameEn ? header.nameEn : header.name;
  const primary = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const secondary = lang === "en" ? (employee.nameEn ? employee.fullName : null) : employee.nameEn;
  const job = termText(employee.jobTitle, employee.jobTitleEn, lang);
  const department = termText(employee.department, employee.departmentEn, lang);
  const ended = employee.status === "TERMINATED";
  const status = ended
    ? { icon: ShieldAlert, text: t("انتهت خدمة هذا الموظف — البطاقة غير سارية", "This person no longer works here — card not valid"), tone: "bg-red-50 text-red-800 ring-red-100" }
    : employee.status === "INACTIVE"
      ? { icon: ShieldAlert, text: t("الموظف غير نشط حالياً", "Currently inactive"), tone: "bg-amber-50 text-amber-900 ring-amber-100" }
      : { icon: BadgeCheck, text: t("موظف حالي — بطاقة سارية", "Current employee — valid card"), tone: "bg-emerald-50 text-emerald-800 ring-emerald-100" };
  const rows = [
    { icon: Briefcase, label: t("المسمى الوظيفي", "Job title"), value: job },
    { icon: Network, label: t("القسم", "Department"), value: department },
    { icon: Building2, label: t("جهة العمل", "Workplace"), value: issuer },
    { icon: MapPin, label: t("موقع العمل", "Location"), value: header.address || company.address },
    { icon: Hash, label: t("الرقم الوظيفي", "Employee no."), value: employee.employeeNumber, ltr: true },
  ].filter((row) => row.value);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <section className="animate-fade-up overflow-hidden rounded-3xl border border-slate-200/90 bg-surface shadow-card">
        <div className="flex h-24 items-start justify-center gap-2.5 bg-gradient-to-l from-ink-900 to-teal-800 px-5 pt-3 text-white">
          {logo ? <img src={logo} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain p-0.5" /> : null}
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold">{issuer}</p>
            <p className="text-xs text-white/70">{t("بطاقة تعريف موظف", "Employee ID card")}</p>
          </div>
        </div>
        <div className="px-5 pb-6 text-center">
          <EmployeeAvatar
            name={primary}
            photo={photo}
            eager
            className={`relative mx-auto -mt-9 size-28 rounded-3xl bg-teal-700 text-4xl text-white shadow-raised ring-4 ring-surface ${ended ? "grayscale" : ""}`}
          />
          <h1 className="mt-3 break-words text-2xl font-bold text-slate-900">{primary}</h1>
          {secondary && secondary.trim() !== primary.trim() ? (
            <p className="break-words text-sm text-slate-500" dir="auto">
              {secondary}
            </p>
          ) : null}
          {job ? <p className="mt-1 font-semibold text-teal-700">{job}</p> : null}
          <p className={`mt-4 flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold ring-1 ring-inset ${status.tone}`}>
            <status.icon size={18} className="shrink-0" />
            {status.text}
          </p>
          <dl className="mt-4 divide-y divide-slate-100 text-start text-sm">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start gap-3 py-2.5">
                <row.icon size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <dt className="w-28 shrink-0 text-slate-500">{row.label}</dt>
                <dd className={`min-w-0 flex-1 break-words font-semibold text-slate-900 ${row.ltr ? "tabular" : ""}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">
        {t("هذه الصفحة تؤكد هوية الموظف فقط، ولا تعرض أي بيانات شخصية أخرى.", "This page only confirms who the employee is and shows no other personal data.")}
      </p>
    </main>
  );
}
