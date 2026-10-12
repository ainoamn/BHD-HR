import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GetForm } from "@/components/get-form";
import { PrintButton } from "@/components/print-button";
import { Bi, HeaderBar, headerFor, sheetClass } from "@/components/salary-docs";
import { fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { HR_DOC_LABEL, HR_DOC_NEEDS_SALARY, HR_DOC_TYPES, certificateText, type HrDocType } from "@/lib/hr-docs";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances } from "@/lib/leave";
import { gratuity, servicePeriod } from "@/lib/oman";
import { monthKey, payItemProgress } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { currentPeriod, daysLabel, formatDate, money, parseDateInput, round3, toDateInput } from "@/lib/utils";

const cell = "border border-slate-200 px-3 py-2";

export default async function HrDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; to?: string; end?: string; leave?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const type: HrDocType = (HR_DOC_TYPES as readonly string[]).includes(sp.type || "") ? (sp.type as HrDocType) : "salary";
  if (HR_DOC_NEEDS_SALARY[type] && !can(user, "salaries.view")) redirect(`/employees/${id}?error=${encodeURIComponent(t("لا تملك صلاحية عرض الرواتب", "You can't view salaries"))}`);
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { employer: true, attendance: { select: { type: true, balanceKey: true } }, leaveCredits: { select: { balanceKey: true, days: true } } },
  });
  if (!employee) notFound();
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);
  const currency = user.company.currency;
  const gross = packageGross(employee);
  const to = (sp.to || "").trim().slice(0, 120);
  const endInput = parseDateInput(sp.end);
  const left = employee.status === "TERMINATED";
  const endDate = endInput || (left ? employee.contractEnd : null);
  const label = HR_DOC_LABEL[type];
  const today = new Date();

  let body: React.ReactNode;
  if (type === "settlement") {
    const end = endDate || new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12));
    const [leaveTypes, unpaidSalaries, payItems] = await Promise.all([
      getLeaveTypes(user.companyId),
      prisma.salary.findMany({ where: { employeeId: employee.id, paid: false }, select: { year: true, month: true, netSalary: true }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
      prisma.payItem.findMany({
        where: { employeeId: employee.id, companyId: user.companyId, kind: "ADVANCE" },
        include: { lines: { select: { amount: true, salary: { select: { year: true, month: true, paid: true } } } } },
      }),
    ]);
    const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes);
    const annual = balances.find((item) => item.key === "annual");
    const leaveDays = sp.leave !== undefined && sp.leave !== "" && Number.isFinite(Number(sp.leave)) ? Number(sp.leave) : annual?.remaining || 0;
    const dailyBasic = user.company.salaryDays > 0 ? employee.basicSalary / user.company.salaryDays : 0;
    const leavePay = round3(leaveDays * dailyBasic);
    const unpaidNet = round3(unpaidSalaries.reduce((sum, salary) => sum + Math.max(0, salary.netSalary), 0));
    const now = currentPeriod();
    const advances = round3(payItems.reduce((sum, item) => sum + (item.stoppedAt ? 0 : payItemProgress(item, monthKey(now.year, now.month)).remaining || 0), 0));
    const grat = gratuity({ joiningDate: employee.joiningDate, endDate: end, basicSalary: employee.basicSalary, nationality: employee.nationality });
    const gratAmount = grat.eligible ? grat.amount : 0;
    const total = round3(gratAmount + leavePay + unpaidNet - advances);
    const period = employee.joiningDate ? servicePeriod(employee.joiningDate, end) : null;
    const rows: { ar: string; en: string; note?: string; value: number; deduct?: boolean }[] = [
      {
        ar: "مكافأة نهاية الخدمة",
        en: "End-of-service gratuity",
        note: grat.eligible
          ? `${grat.oldYears > 0 ? `قبل 31/7/2023: ${grat.oldYears} سنة (أول 3 سنوات بنصف أجر) · ` : ""}بعده: ${grat.newYears} سنة بأجر كامل = ${grat.months} شهر × ${money(grat.basic, currency)}`
          : grat.reason === "OMANI"
            ? "عماني مشمول بصندوق الحماية الاجتماعية — لا مكافأة على صاحب العمل / Omani covered by the Social Protection Fund"
            : "أدخل تاريخ الالتحاق / Joining date missing",
        value: gratAmount,
      },
      { ar: "بدل الإجازات غير المستخدمة", en: "Unused leave pay", note: `${daysLabel(leaveDays)} يوم × ${money(round3(dailyBasic), currency)} (الأجر الأساسي اليومي)`, value: leavePay },
      { ar: "رواتب غير مصروفة", en: "Unpaid salaries", note: unpaidSalaries.map((salary) => `${salary.month}/${salary.year}`).join("، ") || undefined, value: unpaidNet },
      { ar: "سلف متبقية (تُخصم)", en: "Outstanding advances (deducted)", value: advances, deduct: true },
    ];
    body = (
      <>
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 print:grid-cols-2">
          {(
            [
              ["الموظف", "Employee", employee.nameEn ? `${employee.fullName} — ${employee.nameEn}` : employee.fullName],
              ["الرقم الوظيفي", "Employee no.", employee.employeeNumber],
              ["تاريخ الالتحاق", "Joining date", formatDate(employee.joiningDate)],
              ["تاريخ انتهاء الخدمة", "Last working day", formatDate(end)],
              ["مدة الخدمة", "Service", period ? `${period.years} سنة ${period.months} شهر ${period.days} يوم / ${period.years}y ${period.months}m ${period.days}d` : "—"],
              ["آخر أجر أساسي", "Last basic wage", money(employee.basicSalary, currency)],
            ] as const
          ).map(([ar, en, value]) => (
            <div key={en} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <Bi ar={ar} en={en} className="text-slate-500" />
              <strong className="text-end">{value}</strong>
            </div>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[440px] border-collapse text-sm print:min-w-0">
            <tbody>
              {rows.map((row) => (
                <tr key={row.en}>
                  <td className={cell}>
                    <Bi ar={row.ar} en={row.en} />
                    {row.note ? <span className="mt-1 block text-xs text-slate-500">{row.note}</span> : null}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-end ${row.deduct ? "text-red-700" : ""}`}>
                    {row.deduct && row.value ? "− " : ""}
                    {money(row.value, currency)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className={cell}>
                  <Bi ar="صافي المستحق" en="Net amount due" />
                </td>
                <td className={`${cell} whitespace-nowrap text-end`}>{money(total, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          حساب استرشادي وفق المادة 61 من قانون العمل (المرسوم السلطاني 53/2023) وأرصدة النظام؛ راجعه قبل الاعتماد. / Indicative calculation under Labour Law art. 61 (RD 53/2023) and the
          system balances; review before approval.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 print:grid-cols-2">
          <div>
            <Bi ar="عن الإدارة" en="For the management" className="text-slate-500" />
            <div className="mt-12 border-b border-slate-800" />
          </div>
          <div>
            <Bi ar="إقرار الموظف" en="Employee acknowledgement" className="text-slate-500" />
            <p className="mt-2 text-xs leading-5 text-slate-500">أقر باستلامي كامل مستحقاتي المبينة أعلاه / I confirm receiving all the dues above.</p>
            <div className="mt-8 border-b border-slate-800" />
          </div>
        </div>
      </>
    );
  } else {
    const text = certificateText(type, { employee, issuer: header, to, endDate: type === "experience" ? endDate : null, gross, currency });
    const addressee = "addressee" in text ? text.addressee : null;
    body = (
      <>
        <p className="mt-6 text-sm font-bold">{addressee ? addressee.ar : to ? `السادة / ${to} المحترمين` : "إلى من يهمه الأمر"}</p>
        <section className="mt-4 space-y-3 text-[0.95rem] leading-8">
          {addressee ? <p className="font-bold">الموضوع: {label.ar}</p> : null}
          <p>تحية طيبة وبعد،</p>
          {text.ar.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p>وتفضلوا بقبول فائق الاحترام والتقدير،</p>
        </section>
        <section dir="ltr" className="mt-6 space-y-3 border-t border-dashed border-slate-300 pt-5 text-start text-[0.9rem] leading-7 text-slate-700">
          <p className="font-bold text-slate-900">{addressee ? `To: ${addressee.en}` : to ? `To: ${to}` : "To whom it may concern"}</p>
          {addressee ? <p className="font-bold text-slate-900">Subject: {label.en}</p> : null}
          {text.en.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p>Yours sincerely,</p>
        </section>
        <div className="mt-10 grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 print:grid-cols-2">
          <div>
            <Bi ar="عن الإدارة" en="For the management" className="text-slate-500" />
            <div className="mt-12 border-b border-slate-800" />
          </div>
          <div className="flex h-24 items-end justify-center rounded-lg border border-dashed border-slate-300 pb-2 text-xs text-slate-400">ختم المنشأة / Company stamp</div>
        </div>
      </>
    );
  }

  const available = HR_DOC_TYPES.filter((item) => !HR_DOC_NEEDS_SALARY[item] || can(user, "salaries.view"));
  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/employees/${employee.id}`} className="text-sm font-semibold text-teal-800">
            {t("رجوع لملف الموظف", "Back to the employee")}
          </Link>
          <PrintButton label={t("طباعة / حفظ PDF", "Print / Save PDF")} />
        </div>
        <GetForm className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
          <select name="type" defaultValue={type} className={`${fieldClass} w-full`} aria-label={t("نوع المستند", "Document type")}>
            {available.map((item) => (
              <option key={item} value={item}>
                {HR_DOC_LABEL[item][lang]}
              </option>
            ))}
          </select>
          {type === "settlement" ? (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" name="end" defaultValue={toDateInput(endDate)} className={`${fieldClass} w-full`} aria-label={t("آخر يوم عمل", "Last working day")} />
              <input type="number" step="0.5" name="leave" defaultValue={sp.leave || ""} placeholder={t("أيام الإجازة", "Leave days")} className={`${fieldClass} w-full`} aria-label={t("أيام الإجازة غير المستخدمة", "Unused leave days")} />
            </div>
          ) : (
            <div className={type === "experience" ? "grid grid-cols-2 gap-2" : ""}>
              <input name="to" defaultValue={to} placeholder={type === "bank" ? t("اسم البنك (إن لم يُحدد في الملف)", "Bank name (if not in the profile)") : t("الجهة المقدَّمة إليها (اختياري)", "Addressed to (optional)")} className={`${fieldClass} w-full`} />
              {type === "experience" ? <input type="date" name="end" defaultValue={toDateInput(endDate)} className={`${fieldClass} w-full`} aria-label={t("تاريخ انتهاء العمل", "End of service")} /> : null}
            </div>
          )}
          <button type="submit" className={secondaryBtn}>
            {t("تحديث", "Update")}
          </button>
        </GetForm>
      </div>
      <article className={sheetClass}>
        <HeaderBar header={header} titleAr={label.ar} titleEn={label.en} />
        <p className="mt-5 text-sm">
          <span className="text-slate-500">التاريخ / Date: </span>
          <strong className="tabular">{formatDate(today)}</strong>
        </p>
        {body}
      </article>
    </div>
  );
}
