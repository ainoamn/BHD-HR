import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ProfileSheet } from "@/components/profile-sheet";
import { secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { loadProfile } from "@/lib/profile";
import { requestOrigin } from "@/lib/request-origin";
import { cn } from "@/lib/utils";

const chip = "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition";

export default async function EmployeeProfilePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string; docs?: string; salary?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang: uiLang, t } = await getI18n();
  const lang = sp.lang === "en" || sp.lang === "ar" ? sp.lang : uiLang;
  const allowSalary = can(user, "salaries.view");
  const options = { docs: sp.docs !== "0", salary: allowSalary && sp.salary === "1" };
  const data = await loadProfile(id, user.companyId, { lang, origin: await requestOrigin(), inline: false, documents: options.docs, salary: options.salary });
  if (!data) notFound();
  const href = (patch: Partial<{ lang: string; docs: string; salary: string }>) => {
    const query = new URLSearchParams({ lang: data.lang, docs: options.docs ? "1" : "0", salary: options.salary ? "1" : "0", ...patch });
    return `/employees/${id}/profile?${query}`;
  };
  const toggle = (on: boolean, label: string, patch: Partial<{ docs: string; salary: string }>) => (
    <Link href={href(patch)} replace className={cn(chip, on ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")} aria-pressed={on}>
      {on ? "✓ " : ""}
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/employees/${id}`} className="text-sm font-semibold text-teal-800">
            {t("رجوع لملف الموظف", "Back to the employee")}
          </Link>
          <div className="flex flex-wrap gap-2">
            {can(user, "employees.edit") ? (
              <Link href={`/employees/${id}/cv?lang=${data.lang}`} className={secondaryBtn}>
                <Pencil size={16} />
                {t("تعديل السيرة الذاتية", "Edit CV")}
              </Link>
            ) : null}
            <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-slate-200">
          {(["ar", "en"] as const).map((item) => (
            <Link key={item} href={href({ lang: item })} replace className={cn(chip, data.lang === item ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")}>
              {item === "ar" ? "العربية" : "English"}
            </Link>
          ))}
          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
          {toggle(options.docs, t("الوثائق الرسمية", "Official documents"), { docs: options.docs ? "0" : "1" })}
          {allowSalary ? toggle(options.salary, t("الراتب والبدلات", "Salary"), { salary: options.salary ? "0" : "1" }) : null}
        </div>
        {data.lang !== lang ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-100">
            {t("لا توجد سيرة بهذه اللغة بعد، فعُرضت النسخة المتوفرة.", "There is no CV in that language yet, so the available version is shown.")}
          </p>
        ) : null}
      </div>
      <ProfileSheet data={data} />
    </div>
  );
}
