import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalendarCheck2, Clock3, FileUp, Files, ReceiptText, ScrollText, ShieldOff, Target, Wallet } from "lucide-react";
import { ClockButton } from "@/components/clock-button";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { Card, ToneBadge, fieldClass } from "@/components/ui";
import { muscatDay, muscatTime, workedLabel } from "@/lib/clock";
import { DOC_LABEL, EXTRA_DOC_TYPES, monthName, termText } from "@/lib/constants";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_PAY_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE } from "@/lib/expenses";
import { describeExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { attendanceLabel, computeLeaveBalances, leaveName } from "@/lib/leave";
import { SCORE_LABEL, criterionName, overallBand, overallTone, parseCriteria, parseScores } from "@/lib/performance";
import { LEAVE_REQUEST_LABEL, LEAVE_REQUEST_TONE, portalEmployee, portalLeaveChoices } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { THEME_COOKIE, daysLabel, formatDate, money, normalizeTheme, todayInputValue } from "@/lib/utils";
import { cancelExpense, cancelLeaveRequest, requestLeave, submitExpense, submitPortalDocument } from "@/server/portal-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The employee's own page, opened from a personal link. The token is the only key; nothing here needs a login. */
export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const employee = await portalEmployee(token);
  if (!employee) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
        <Flash error={sp.error} />
        <Card className="text-center">
          <ShieldOff size={32} className="mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t("الرابط غير صالح", "This link is not valid")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("ربما جُدّد الرابط أو أُوقف. اطلب رابطك الجديد من الموارد البشرية.", "It may have been renewed or turned off. Ask HR for your current link.")}
          </p>
        </Card>
      </main>
    );
  }

  const company = employee.company;
  const base = `/portal/${token}`;
  const today = muscatDay();
  const [leaveTypes, attendance, credits, requests, salaries, documents, letters, clockToday, clockRecent, reviews, claims] = await Promise.all([
    getLeaveTypes(company.id),
    prisma.attendance.findMany({ where: { employeeId: employee.id }, select: { type: true, balanceKey: true } }),
    prisma.leaveCredit.findMany({ where: { employeeId: employee.id }, select: { balanceKey: true, days: true } }),
    prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.salary.findMany({
      where: { employeeId: employee.id, paid: true },
      select: { id: true, year: true, month: true, netSalary: true, paidAt: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 12,
    }),
    prisma.employeeDocument.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } }),
    prisma.letter.findMany({
      where: { employeeId: employee.id, cancelledAt: null },
      select: { token: true, refNo: true, subject: true, subjectEn: true, issuedAt: true, acknowledgedAt: true },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    company.clockEnabled ? prisma.clockEntry.findUnique({ where: { employeeId_day: { employeeId: employee.id, day: today } } }) : null,
    company.clockEnabled ? prisma.clockEntry.findMany({ where: { employeeId: employee.id }, orderBy: { day: "desc" }, take: 7 }) : [],
    prisma.performanceReview.findMany({
      where: { employeeId: employee.id, status: "DONE", sharedAt: { not: null } },
      select: { id: true, scores: true, overall: true, strengths: true, improvements: true, goals: true, completedAt: true, cycle: { select: { name: true, periodStart: true, periodEnd: true, criteria: true } } },
      orderBy: { completedAt: "desc" },
      take: 6,
    }),
    prisma.expenseClaim.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const balances = computeLeaveBalances(employee, attendance, credits, leaveTypes).filter((item) => item.applies || item.remaining !== 0);
  const choices = portalLeaveChoices(leaveTypes, employee.jobTitleId, lang);
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, company);
  const logo = await inlineLogo(header.logoUrl, company.id);
  const issuer = lang === "en" && header.nameEn ? header.nameEn : header.name;
  const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const job = termText(employee.jobTitle, employee.jobTitleEn, lang);
  const limits = { urgent: company.alertUrgentDays, warning: company.alertWarningDays, early: company.alertEarlyDays };
  const primaryDocs = [
    { label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry },
    { label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry },
    { label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry },
  ].filter((doc) => doc.number || doc.expiry);
  const requestLabel = (choice: string) =>
    attendanceLabel({ type: choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: choice === "UNPAID_LEAVE" ? null : choice.slice(6) }, leaveTypes, lang);
  const sections = [
    company.clockEnabled ? { id: "clock", label: t("الحضور", "Clock-in") } : null,
    { id: "leave", label: t("الإجازات", "Leave") },
    { id: "payslips", label: t("الرواتب", "Payslips") },
    { id: "documents", label: t("المستندات", "Documents") },
    { id: "expenses", label: t("المصروفات", "Expenses") },
    letters.length ? { id: "letters", label: t("الخطابات", "Letters") } : null,
    reviews.length ? { id: "reviews", label: t("التقييم", "Reviews") } : null,
  ].filter((item): item is { id: string; label: string } => Boolean(item));
  const sectionTitle = (Icon: typeof Clock3, title: string, hint?: string) => (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-3xl items-start justify-between gap-3 px-4 pb-6 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1" /> : null}
            <div className="min-w-0">
              <p className="truncate text-xs text-white/70">{issuer}</p>
              <h1 className="break-words text-xl font-bold leading-tight">{name}</h1>
              <p className="mt-0.5 text-xs text-white/70">
                <span className="tabular">{employee.employeeNumber}</span>
                {job ? ` · ${job}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle initial={theme} className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20" />
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-surface/90 backdrop-blur-md" aria-label={t("أقسام البوابة", "Portal sections")}>
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800">
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <Flash error={sp.error} message={sp.message} />

        {company.clockEnabled ? (
          <Card id="clock" className="scroll-mt-16">
            {sectionTitle(
              Clock3,
              t("تسجيل الحضور والانصراف", "Clock in & out"),
              company.workLat !== null ? t(`يُسجَّل من موقع العمل فقط (ضمن ${company.workRadius} م).`, `Only from the work site (within ${company.workRadius} m).`) : undefined,
            )}
            <div className="mb-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-inset ring-slate-100">
                <p className="text-xs text-slate-500">{t("الحضور اليوم", "Clocked in")}</p>
                <p className="tabular mt-1 text-lg font-bold text-slate-900">{muscatTime(clockToday?.inAt)}</p>
                {clockToday?.lateMinutes ? <p className="text-xs font-semibold text-amber-700">{t(`متأخر ${clockToday.lateMinutes} د`, `${clockToday.lateMinutes} min late`)}</p> : null}
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-inset ring-slate-100">
                <p className="text-xs text-slate-500">{t("الانصراف", "Clocked out")}</p>
                <p className="tabular mt-1 text-lg font-bold text-slate-900">{muscatTime(clockToday?.outAt)}</p>
              </div>
            </div>
            {clockToday?.outAt ? (
              <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-800">
                {t(`اكتمل دوام اليوم: ${workedLabel(clockToday.inAt, clockToday.outAt)} ساعة`, `Today's shift is complete: ${workedLabel(clockToday.inAt, clockToday.outAt)} h`)}
              </p>
            ) : (
              <ClockButton token={token} next={clockToday ? "out" : "in"} needsLocation={company.workLat !== null && company.workLng !== null} />
            )}
            {clockRecent.length > 1 ? (
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {clockRecent
                  .filter((entry) => entry.day !== today)
                  .map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-slate-600">{formatDate(new Date(`${entry.day}T12:00:00Z`))}</span>
                      <span className="tabular text-slate-900" dir="ltr">
                        {muscatTime(entry.inAt)} – {muscatTime(entry.outAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        <Card id="leave" className="scroll-mt-16">
          {sectionTitle(CalendarCheck2, t("الإجازات", "Leave"), t("رصيدك الحالي، وطلب إجازة جديدة تصل للموارد البشرية للموافقة.", "Your balances, and a new request that goes to HR for approval."))}
          {balances.length ? (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {balances.map((figure) => (
                <div key={figure.key} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
                  <p className="truncate text-xs text-slate-500">{leaveName(figure, lang)}</p>
                  <p className={`tabular mt-0.5 text-lg font-bold ${figure.remaining < 0 ? "text-red-700" : "text-slate-900"}`}>
                    {daysLabel(figure.remaining)} <span className="text-xs font-normal text-slate-500">{t("يوم", "days")}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          <form action={requestLeave} className="grid gap-3 rounded-2xl border border-slate-200 p-3 sm:grid-cols-2 sm:p-4">
            <input type="hidden" name="token" value={token} />
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{t("نوع الإجازة", "Leave type")}</span>
              <select className={`${fieldClass} w-full`} name="choice" required defaultValue={choices[0]?.value}>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t("من", "From")}</span>
              <input className={`${fieldClass} w-full`} type="date" name="from" required defaultValue={todayInputValue()} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t("إلى", "To")}</span>
              <input className={`${fieldClass} w-full`} type="date" name="to" required defaultValue={todayInputValue()} />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{t("السبب (اختياري)", "Reason (optional)")}</span>
              <input className={`${fieldClass} w-full`} name="reason" maxLength={500} />
            </label>
            <div className="sm:col-span-2">
              <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                {t("إرسال الطلب", "Send request")}
              </SubmitButton>
            </div>
          </form>
          {requests.length ? (
            <ul className="mt-4 space-y-2">
              {requests.map((request) => (
                <li key={request.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{requestLabel(request.choice)}</p>
                      <p className="mt-0.5 text-slate-600">
                        {formatDate(request.fromDate)} — {formatDate(request.toDate)} · {daysLabel(request.days)} {t("يوم", "day(s)")}
                      </p>
                    </div>
                    <ToneBadge tone={LEAVE_REQUEST_TONE[request.status] || "slate"}>{pick(LEAVE_REQUEST_LABEL[request.status], lang, request.status)}</ToneBadge>
                  </div>
                  {request.reason ? <p className="mt-1.5 break-words text-xs text-slate-500">{request.reason}</p> : null}
                  {request.decisionNote ? <p className="mt-1.5 text-xs text-slate-600">{t("ملاحظة الإدارة:", "Note from HR:")} {request.decisionNote}</p> : null}
                  {request.status === "PENDING" ? (
                    <form action={cancelLeaveRequest} className="mt-2">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="id" value={request.id} />
                      <SubmitButton variant="link" confirm={t("إلغاء هذا الطلب؟", "Cancel this request?")}>
                        {t("إلغاء الطلب", "Cancel request")}
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card id="payslips" className="scroll-mt-16">
          {sectionTitle(ReceiptText, t("الرواتب المصروفة", "Paid salaries"), t("آخر 12 شهراً. افتح القسيمة لطباعتها أو حفظها PDF.", "The last 12 months. Open a payslip to print or save it as PDF."))}
          {salaries.length ? (
            <ul className="divide-y divide-slate-100">
              {salaries.map((salary) => (
                <li key={salary.id}>
                  <Link href={`${base}/payslip/${salary.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:text-teal-800">
                    <span className="font-medium">
                      {monthName(salary.month, lang)} {salary.year}
                    </span>
                    <span className="tabular font-bold">{money(salary.netSalary, company.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد رواتب مصروفة بعد.", "No paid salaries yet.")}</p>
          )}
        </Card>

        <Card id="documents" className="scroll-mt-16">
          {sectionTitle(Files, t("مستنداتي", "My documents"), t("تواريخ انتهاء وثائقك المسجّلة. أرسل نسخة محدّثة عند التجديد.", "Expiry dates on file. Send an updated copy when you renew."))}
          <ul className="divide-y divide-slate-100">
            {primaryDocs.map((doc) => {
              const status = describeExpiry(doc.expiry, limits, lang);
              return (
                <li key={doc.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{doc.label}</p>
                    <p className="text-xs text-slate-500">
                      <span dir="ltr">{doc.number || "—"}</span> · {formatDate(doc.expiry)}
                    </p>
                  </div>
                  <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                </li>
              );
            })}
            {documents.map((document) => {
              const status = describeExpiry(document.expiryDate, limits, lang);
              const waiting = document.submittedAt && !document.reviewedAt;
              return (
                <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{pick(DOC_LABEL[document.type], lang, document.type)}</p>
                    <p className="text-xs text-slate-500">
                      <span dir="ltr">{document.documentNo || "—"}</span> · {formatDate(document.expiryDate)}
                    </p>
                  </div>
                  {waiting ? <ToneBadge tone="amber">{t("بانتظار المراجعة", "Awaiting review")}</ToneBadge> : <ToneBadge tone={status.tone}>{status.label}</ToneBadge>}
                </li>
              );
            })}
          </ul>
          <details className="group mt-4 rounded-2xl border border-slate-200 p-3 sm:p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
              <FileUp size={16} />
              {t("إرسال مستند", "Send a document")}
            </summary>
            <form action={submitPortalDocument} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="token" value={token} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("النوع", "Type")}</span>
                <select className={`${fieldClass} w-full`} name="type" defaultValue="PASSPORT">
                  {EXTRA_DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {pick(DOC_LABEL[type], lang, type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("رقم المستند", "Document number")}</span>
                <input className={`${fieldClass} w-full`} name="documentNo" dir="ltr" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("تاريخ الانتهاء", "Expiry date")}</span>
                <input className={`${fieldClass} w-full`} type="date" name="expiryDate" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("الملف (صورة أو PDF، حتى 4 ميغابايت)", "File (image or PDF, up to 4 MB)")}</span>
                <input className={`${fieldClass} w-full`} type="file" name="file" required accept="application/pdf,image/png,image/jpeg,image/webp" />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("ملاحظة", "Note")}</span>
                <input className={`${fieldClass} w-full`} name="notes" maxLength={300} />
              </label>
              <div className="sm:col-span-2">
                <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الرفع...", "Uploading...")}>
                  {t("إرسال للمراجعة", "Send for review")}
                </SubmitButton>
              </div>
            </form>
          </details>
        </Card>

        <Card id="expenses" className="scroll-mt-16">
          {sectionTitle(Wallet, t("تعويض المصروفات", "Expense claims"), t("صرفت من مالك لأجل العمل؟ أرسل الإيصال، وبعد الموافقة يُصرف لك مع الراتب أو مباشرة.", "Spent your own money on work? Send the receipt; once approved it is paid with your salary or directly."))}
          <details className="group rounded-2xl border border-slate-200 p-3 sm:p-4" open={claims.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
              <FileUp size={16} />
              {t("طلب تعويض جديد", "New claim")}
            </summary>
            <form action={submitExpense} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="token" value={token} />
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("الوصف", "Description")}</span>
                <input className={`${fieldClass} w-full`} name="title" required maxLength={120} placeholder={t("مثال: وقود رحلة عمل إلى صحار", "e.g. Fuel for a work trip to Sohar")} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("النوع", "Category")}</span>
                <select className={`${fieldClass} w-full`} name="category" defaultValue="TRAVEL">
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {pick(EXPENSE_CATEGORY_LABEL[category], lang, category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  {t("المبلغ", "Amount")} ({company.currency})
                </span>
                <input className={`${fieldClass} w-full`} name="amount" type="number" inputMode="decimal" step="0.001" min="0.001" required dir="ltr" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("تاريخ المصروف", "Date spent")}</span>
                <input className={`${fieldClass} w-full`} type="date" name="spentAt" required defaultValue={todayInputValue()} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t("الإيصال (صورة أو PDF)", "Receipt (image or PDF)")}</span>
                <input className={`${fieldClass} w-full`} type="file" name="receipt" required accept="application/pdf,image/png,image/jpeg,image/webp" />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("ملاحظة", "Note")}</span>
                <input className={`${fieldClass} w-full`} name="notes" maxLength={500} />
              </label>
              <div className="sm:col-span-2">
                <SubmitButton className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                  {t("إرسال الطلب", "Send claim")}
                </SubmitButton>
              </div>
            </form>
          </details>
          {claims.length ? (
            <ul className="mt-4 space-y-2">
              {claims.map((claim) => (
                <li key={claim.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-900">{claim.title}</p>
                      <p className="mt-0.5 text-slate-600">
                        <span className="tabular font-semibold">{money(claim.amount, company.currency)}</span> · {formatDate(claim.spentAt)}
                      </p>
                    </div>
                    <ToneBadge tone={EXPENSE_STATUS_TONE[claim.status] || "slate"}>{pick(EXPENSE_STATUS_LABEL[claim.status], lang, claim.status)}</ToneBadge>
                  </div>
                  {claim.status === "PAID" && claim.payMethod ? (
                    <p className="mt-1.5 text-xs text-emerald-700">
                      {pick(EXPENSE_PAY_LABEL[claim.payMethod], lang, claim.payMethod)} · {formatDate(claim.paidAt)}
                    </p>
                  ) : null}
                  {claim.decisionNote ? <p className="mt-1.5 break-words text-xs text-slate-600">{t("ملاحظة الإدارة:", "Note from HR:")} {claim.decisionNote}</p> : null}
                  {claim.status === "PENDING" ? (
                    <form action={cancelExpense} className="mt-2">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="id" value={claim.id} />
                      <SubmitButton variant="link" confirm={t("إلغاء هذا الطلب؟", "Cancel this claim?")}>
                        {t("إلغاء الطلب", "Cancel claim")}
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        {letters.length ? (
          <Card id="letters" className="scroll-mt-16">
            {sectionTitle(ScrollText, t("الخطابات", "Letters"))}
            <ul className="divide-y divide-slate-100">
              {letters.map((letter) => (
                <li key={letter.token}>
                  <Link href={`/letter/${letter.token}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition hover:text-teal-800">
                    <span className="min-w-0">
                      <span className="block font-medium">{(lang === "en" && letter.subjectEn) || letter.subject}</span>
                      <span className="text-xs text-slate-500">
                        <span className="tabular">{letter.refNo}</span> · {formatDate(letter.issuedAt)}
                      </span>
                    </span>
                    {letter.acknowledgedAt ? <ToneBadge tone="green">{t("تم التأكيد", "Confirmed")}</ToneBadge> : <ToneBadge tone="amber">{t("بانتظار تأكيدك", "Please confirm")}</ToneBadge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {reviews.length ? (
          <Card id="reviews" className="scroll-mt-16">
            {sectionTitle(Target, t("تقييم الأداء", "Performance reviews"), t("الدرجات من 1 إلى 5، مع ملاحظات مديرك وأهدافك للفترة القادمة.", "Scores from 1 to 5, with your manager's notes and your goals for the next period."))}
            <div className="space-y-3">
              {reviews.map((review, index) => {
                const scores = parseScores(review.scores);
                const band = overallBand(review.overall);
                return (
                  <details key={review.id} open={index === 0} className="group rounded-2xl border border-slate-200 p-3 sm:p-4">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-900">{review.cycle.name}</span>
                        <span className="text-xs text-slate-500">
                          {formatDate(review.cycle.periodStart)} – {formatDate(review.cycle.periodEnd)}
                        </span>
                      </span>
                      {review.overall !== null ? (
                        <ToneBadge tone={overallTone(review.overall)}>
                          <span className="tabular">{review.overall} / 5</span>
                          {band ? ` · ${pick(SCORE_LABEL[band], lang)}` : ""}
                        </ToneBadge>
                      ) : null}
                    </summary>
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {parseCriteria(review.cycle.criteria).map((item) => (
                        <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="min-w-0 text-slate-700">{criterionName(item, lang)}</span>
                          <span className="tabular shrink-0 font-bold text-slate-900">{scores[item.key] ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                    {[
                      { label: t("نقاط القوة", "Strengths"), value: review.strengths },
                      { label: t("مجالات التحسين", "Areas to improve"), value: review.improvements },
                      { label: t("أهدافك للفترة القادمة", "Your goals for the next period"), value: review.goals },
                    ]
                      .filter((block) => block.value)
                      .map((block) => (
                        <div key={block.label} className="mt-3">
                          <p className="text-xs font-bold text-slate-500">{block.label}</p>
                          <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-7 text-slate-800">{block.value}</p>
                        </div>
                      ))}
                  </details>
                );
              })}
            </div>
          </Card>
        ) : null}

        <p className="px-2 pb-6 text-center text-xs leading-5 text-slate-500">
          {t("هذا الرابط خاص بك. لا تشاركه مع أحد.", "This link is personal. Do not share it.")}
        </p>
      </main>
    </div>
  );
}
