import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { isOmani } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { wpsBankIssues } from "@/lib/wps-bank";
import { money, readPeriod, round3 } from "@/lib/utils";

export default async function PayrollReviewPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("salaries.view");
  const { lang, t } = await getI18n();
  const { year, month } = readPeriod(sp);
  const query = `year=${year}&month=${month}`;
  const salaries = await prisma.salary.findMany({
    where: { companyId: user.companyId, year, month },
    include: { employee: { select: { nationality: true, idNumber: true, residenceNumber: true, bankAccount: true, bankBic: true, status: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  const currency = user.company.currency;
  const name = (row: { employeeName: string; employeeNameEn: string | null }) => (lang === "en" && row.employeeNameEn ? row.employeeNameEn : row.employeeName);
  let employeeShare = 0;
  let employerShare = 0;
  const missingCivil: string[] = [];
  for (const salary of salaries) {
    employeeShare += salary.spfEmployee;
    employerShare += salary.spfEmployer;
    if (isOmani(salary.employee.nationality) && salary.spfEmployee + salary.spfEmployer > 0 && !salary.employee.idNumber) missingCivil.push(name(salary));
  }
  const bank = wpsBankIssues(
    salaries
      .filter((salary) => salary.netSalary > 0)
      .map((salary) => ({
        employeeId: salary.employeeId,
        name: name(salary),
        account: salary.employee.bankAccount,
        bic: salary.employee.bankBic,
      })),
    { bankAccount: user.company.bankAccount, bankBic: user.company.bankBic },
  );
  const blocked = bank.filter((item) => item.code !== "missing").length;
  const leftOut = bank.filter((item) => item.code === "missing").length;

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={ShieldCheck}
        title={t("مراجعة قبل الملفات", "Review before the files")}
        description={t(
          `اشتراكات الحماية الاجتماعية وملف WPS لشهر ${month}/${year}. راجع الأرقام ثم نزّل الملف.`,
          `Social protection and the WPS file for ${month}/${year}. Check the figures, then download.`,
        )}
      />

      {!user.company.spfEnabled ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {t("الحماية الاجتماعية غير مفعّلة في الإعدادات، لذلك الحصص صفر.", "Social protection is off in Settings, so the shares are zero.")}
        </p>
      ) : null}
      {missingCivil.length ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          {t(`عمانيون بلا رقم مدني وحصتهم أكبر من صفر: ${missingCivil.slice(0, 8).join("، ")}`, `Omanis with a contribution but no civil number: ${missingCivil.slice(0, 8).join(", ")}`)}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-900">{t("صندوق الحماية الاجتماعية", "Social Protection Fund")}</h2>
          <a href={`/salaries/spf?${query}`} className="text-sm font-semibold text-teal-800 underline">
            {t("تنزيل Excel", "Download Excel")}
          </a>
        </div>
        <div className="grid grid-cols-3 gap-3 px-4 py-3 text-sm">
          <p>{t("حصة الموظف", "Employee share")}: <strong className="tabular">{money(round3(employeeShare), currency)}</strong></p>
          <p>{t("حصة المنشأة", "Employer share")}: <strong className="tabular">{money(round3(employerShare), currency)}</strong></p>
          <p>{t("المجموع", "Total")}: <strong className="tabular">{money(round3(employeeShare + employerShare), currency)}</strong></p>
        </div>
        <ul className="max-h-80 divide-y divide-slate-100 overflow-auto border-t border-slate-100 text-sm">
          {salaries.filter((salary) => salary.spfEmployee + salary.spfEmployer > 0).map((salary) => (
            <li key={salary.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 truncate">{salary.employeeNumber} · {name(salary)}</span>
              <span className="tabular shrink-0 text-slate-600">{money(round3(salary.spfEmployee + salary.spfEmployer), currency)}</span>
            </li>
          ))}
          {!salaries.some((salary) => salary.spfEmployee + salary.spfEmployer > 0) ? (
            <li className="px-4 py-6 text-center text-slate-500">{t("لا اشتراكات في هذا الشهر.", "No contributions this month.")}</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">{t("ملف حماية الأجور", "Wage protection file")}</h2>
          {blocked ? (
            <span className="text-sm font-semibold text-red-700">{t("أصلح الملاحظات قبل التنزيل", "Fix the issues before downloading")}</span>
          ) : (
            <a href={`/salaries/wps?${query}`} className="text-sm font-semibold text-teal-800 underline">
              {t("تنزيل CSV", "Download CSV")}
            </a>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t(`${salaries.length} مسير. ${leftOut} بلا حساب ولن يدخلوا الملف. ${blocked} ملاحظة تمنع الاعتماد.`, `${salaries.length} records. ${leftOut} have no account and stay out of the file. ${blocked} issue(s) should be fixed first.`)}
        </p>
        {bank.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {bank.slice(0, 20).map((item, index) => (
              <li key={`${item.code}-${item.employeeId || index}`} className={item.level === "danger" ? "text-red-800" : "text-amber-900"}>
                {item.code === "payer"
                  ? t("حساب المنشأة أو رمز البنك غير صالح.", "The company account or bank code is invalid.")
                  : `${item.name}: ${item.code === "duplicate" ? t("حساب مكرر", "duplicate account") : item.code === "format" ? t("طول الحساب غير صالح", "invalid account length") : t("بلا حساب", "no account")}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-teal-800">{t("الحسابات جاهزة للملف.", "Accounts are ready for the file.")}</p>
        )}
        <p className="mt-3 text-sm">
          <Link href={`/salaries?${query}`} className="font-semibold text-teal-800 underline">{t("العودة إلى المسير", "Back to payroll")}</Link>
          {" · "}
          <Link href={`/salaries/journal?${query}`} className="font-semibold text-teal-800 underline">{t("القيد المحاسبي", "Accounting journal")}</Link>
        </p>
      </section>
    </div>
  );
}
