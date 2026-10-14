import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fragment } from "react";
import { CalendarCheck2, CircleHelp, Clock3, Contact, FileUp, FileUser, Files, FolderLock, IdCard, Inbox, KeyRound, LayoutDashboard, LogOut, PenLine, Printer, ReceiptText, ScrollText, ShieldOff, Target, UserRound, Users, Wallet } from "lucide-react";
import { bankName } from "@/lib/banks";
import { nationalityName } from "@/lib/nationalities";
import { packageGross } from "@/lib/salary";
import { Tr, TranslateToggle } from "@/components/ai-translate";
import { cvCompleteness, cvFor, hasCvContent, readCv } from "@/lib/cv";
import { PortalRequests } from "@/components/portal-requests";
import { CUSTODY_DIRECTION, HELD_STATUS_LABEL, HELD_STATUS_TONE, heldDocLabel } from "@/lib/custody";
import { LETTER_KIND, readAutoKinds, type LetterKind } from "@/lib/letters";
import { submitEmployeeRequest } from "@/server/employee-request-actions";
import { getSessionUser, isStaffRole } from "@/lib/auth";
import { isTeamRole } from "@/lib/permissions";
import { logout, switchCompany } from "@/server/auth-actions";
import { CompanySwitcher } from "@/components/company-switcher";
import { ClockButton } from "@/components/clock-button";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { Card, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { muscatDay, muscatTime, workedLabel } from "@/lib/clock";
import { DOC_LABEL, EXTRA_DOC_TYPES, STATUS_LABEL, monthName, termText } from "@/lib/constants";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_PAY_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE } from "@/lib/expenses";
import { describeExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { badgeUrl, ensureBadgeToken, qrSvg } from "@/lib/badge";
import { pick } from "@/lib/i18n";
import { inlineLogo } from "@/lib/inline-logo";
import { getI18n } from "@/lib/lang";
import { attendanceLabel, computeLeaveBalances, leaveName } from "@/lib/leave";
import { SCORE_LABEL, criterionName, overallBand, overallTone, parseCriteria, parseScores } from "@/lib/performance";
import { LEAVE_REQUEST_LABEL, LEAVE_REQUEST_TONE, portalEmployee, portalLeaveChoices } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { lettersMissing, missingFields } from "@/lib/self-data";
import { SelfDataFields } from "@/components/self-data-fields";
import { SectionSpy } from "@/components/section-spy";
import { THEME_COOKIE, daysLabel, formatDate, money, normalizeTheme, toDateInput, todayInputValue } from "@/lib/utils";
import { cancelExpense, cancelLeaveRequest, completeMyDetails, requestLeave, submitExpense, submitPortalDocument } from "@/server/portal-actions";

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
  const session = await getSessionUser();
  const signedIn = session && session.employeeId === employee.id ? session : null;
  const headerPill = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20";
  const today = muscatDay();
  const [leaveTypes, attendance, credits, requests, salaries, documents, letters, clockToday, clockRecent, reviews, claims, employeeRequests, heldDocuments, custodyForms, manager] = await Promise.all([
    getLeaveTypes(company.id),
    prisma.attendance.findMany({ where: { employeeId: employee.id }, select: { type: true, balanceKey: true, date: true } }),
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
      select: { token: true, kind: true, refNo: true, subject: true, subjectEn: true, issuedAt: true, acknowledgedAt: true },
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
    prisma.employeeRequest.findMany({
      where: { employeeId: employee.id },
      omit: { signature: true, signedText: true, signedTextEn: true },
      include: { letter: { select: { token: true, refNo: true, cancelledAt: true } }, custodyForm: { select: { id: true, refNo: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.heldDocument.findMany({ where: { employeeId: employee.id }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] }),
    prisma.custodyForm.findMany({
      where: { employeeId: employee.id },
      select: { id: true, refNo: true, direction: true, createdAt: true, acknowledgedAt: true, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    employee.managerId ? prisma.employee.findFirst({ where: { id: employee.managerId, companyId: company.id }, select: { fullName: true, nameEn: true } }) : null,
  ]);
  const autoKinds = readAutoKinds(company.letterAutoKinds);
  const selfMissing = missingFields(employee);
  const letterMissing = lettersMissing(employee);
  const pendingDocIds = new Set(employeeRequests.filter((request) => request.type === "DOCUMENTS" && request.status === "PENDING").flatMap((request) => request.documentIds));
  const requestableDocs = heldDocuments.filter((doc) => doc.status === "HELD" && !pendingDocIds.has(doc.id));
  const unacknowledged = custodyForms.filter((form) => form.direction === "OUT" && !form.acknowledgedAt).length;
  const now = new Date();
  const balances = computeLeaveBalances(employee, attendance, credits, leaveTypes).filter((item) => item.applies || item.remaining !== 0);
  const choices = portalLeaveChoices(leaveTypes, employee.jobTitleId, lang);
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, company);
  const [logo, photo, badgeToken, origin] = await Promise.all([
    inlineLogo(header.logoUrl, company.id),
    inlineLogo(employee.photoUrl, company.id),
    ensureBadgeToken(employee),
    requestOrigin(),
  ]);
  const badgeSvg = await qrSvg(badgeUrl(origin, badgeToken));
  const cvVersion = cvFor(readCv(employee.cv), lang);
  const cvProgress = cvCompleteness(cvVersion.content, Boolean(employee.photoUrl));
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
    { id: "profile", label: t("ملفي", "My file"), icon: UserRound, count: selfMissing.length },
    company.clockEnabled ? { id: "clock", label: t("الحضور", "Clock-in"), icon: Clock3 } : null,
    { id: "leave", label: t("الإجازات", "Leave"), icon: CalendarCheck2 },
    { id: "payslips", label: t("الرواتب", "Payslips"), icon: ReceiptText },
    { id: "documents", label: t("المستندات", "Documents"), icon: Files },
    heldDocuments.length || custodyForms.length ? { id: "custody", label: t("أصولي لدى المنشأة", "My originals"), icon: FolderLock, count: unacknowledged } : null,
    { id: "requests", label: t("الطلبات", "Requests"), icon: Inbox },
    { id: "expenses", label: t("المصروفات", "Expenses"), icon: Wallet },
    letters.length ? { id: "letters", label: t("الخطابات", "Letters"), icon: ScrollText } : null,
    reviews.length ? { id: "reviews", label: t("التقييم", "Reviews"), icon: Target } : null,
    { id: "cv", label: t("سيرتي", "My CV"), icon: FileUser },
    { id: "badge", label: t("بطاقتي", "My ID card"), icon: IdCard },
  ].filter((item): item is { id: string; label: string; icon: typeof Clock3; count?: number } => Boolean(item));
  const shell = "page-wide px-4 sm:px-6 lg:px-8";
  const spyCurrent = "aria-[current=location]:bg-teal-50 aria-[current=location]:text-teal-800";
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
  const fact = (label: string, value: string | null | undefined, ltr = false) =>
    value ? (
      <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900" dir={ltr ? "ltr" : undefined}>
          {value}
        </dd>
      </div>
    ) : null;
  const factGroup = (title: string, items: [label: string, value: string | null | undefined, ltr?: boolean][]) => {
    const shown = items.filter(([, value]) => value);
    return shown.length ? (
      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{title}</h3>
        <dl className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
          {shown.map(([label, value, ltr]) => (
            <Fragment key={label}>{fact(label, value, ltr)}</Fragment>
          ))}
        </dl>
      </div>
    ) : null;
  };
  const pay = [
    { label: t("الراتب الأساسي", "Basic salary"), value: employee.basicSalary },
    { label: t("بدل السكن", "Housing allowance"), value: employee.housingAllowance },
    { label: t("بدل النقل", "Transport allowance"), value: employee.transportAllowance },
    { label: t("بدلات أخرى", "Other allowances"), value: employee.otherAllowance },
  ].filter((item) => item.value > 0);
  const salaryLetters: LetterKind[] = ["SALARY_CERTIFICATE", "SALARY_TRANSFER", "EMPLOYMENT_CERTIFICATE"];
  const managerName = manager ? (lang === "en" && manager.nameEn ? manager.nameEn : manager.fullName) : null;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className={`${shell} relative flex flex-wrap items-start justify-between gap-3 pb-6 pt-5`}>
          <div className="flex min-w-[12rem] flex-1 items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/30" />
            ) : logo ? (
              <img src={logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-xs text-white/70">{issuer}</p>
              <h1 className="break-words text-xl font-bold leading-tight">{name}</h1>
              <p className="mt-0.5 text-xs text-white/70">
                <span className="tabular">{employee.employeeNumber}</span>
                {job ? ` · ${job}` : ""}
              </p>
            </div>
          </div>
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
            <TranslateToggle tone="dark" compact />
            <ThemeToggle initial={theme} className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            <LangToggle className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20" />
            <Link href={`${base}/help`} className={headerPill} title={t("شرح استخدام صفحتي", "How to use my page")}>
              <CircleHelp size={15} />
              {t("شرح", "Help")}
            </Link>
            {signedIn ? (
              <>
                {isTeamRole(signedIn.role) ? (
                  <Link href="/team" className={headerPill}>
                    <Users size={15} />
                    {signedIn.role === "EMPLOYER" ? t("عمّالي", "My workers") : t("فريقي", "My team")}
                  </Link>
                ) : isStaffRole(signedIn.role) ? (
                  <Link href="/" className={headerPill}>
                    <LayoutDashboard size={15} />
                    {t("النظام", "System")}
                  </Link>
                ) : null}
                <Link href="/password" className={headerPill} title={t("تغيير كلمة المرور", "Change password")}>
                  <KeyRound size={15} />
                </Link>
                <form action={logout}>
                  <button type="submit" className={headerPill}>
                    <LogOut size={15} />
                    {t("خروج", "Sign out")}
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
        {signedIn && signedIn.memberships.length > 1 ? (
          <div className={`${shell} relative flex flex-wrap items-center gap-2 pb-4`}>
            <span className="text-xs text-white/70">{t("التبديل بين منشآتك:", "Switch company:")}</span>
            <CompanySwitcher
              action={switchCompany}
              activeId={signedIn.companyId}
              label={t("المنشأة", "Company")}
              companies={signedIn.memberships.map((item) => ({ id: item.companyId, name: lang === "en" && item.company.nameEn ? item.company.nameEn : item.company.name }))}
            />
          </div>
        ) : null}
      </header>

      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-surface/90 backdrop-blur-md lg:hidden" aria-label={t("أقسام البوابة", "Portal sections")}>
        <div className={`${shell} flex gap-1 overflow-x-auto py-2`} data-spy-scroll>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-spy
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800 ${spyCurrent}`}
            >
              {section.label}
              {section.count ? <span className="tabular size-1.5 rounded-full bg-amber-500" aria-hidden="true" /> : null}
            </a>
          ))}
        </div>
      </nav>
      <SectionSpy />

      <div className={`${shell} py-5 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:py-6 2xl:grid-cols-[15rem_minmax(0,1fr)] 2xl:gap-8`}>
        <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          <nav aria-label={t("أقسام البوابة", "Portal sections")} className="rounded-2xl border border-slate-200/90 bg-surface p-2 shadow-card">
            <ul className="space-y-0.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    data-spy
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${spyCurrent}`}
                  >
                    <section.icon size={17} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    {section.count ? <span className="tabular shrink-0 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-800">{section.count}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="mt-3 px-3 text-xs leading-5 text-slate-500">{t("هذا الرابط خاص بك. لا تشاركه مع أحد.", "This link is personal. Do not share it.")}</p>
        </aside>
        <main className="min-w-0 space-y-4">
          <Flash error={sp.error} message={sp.message} />
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <div className="@container min-w-0 space-y-4">
              <Card id="profile" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(UserRound, t("ملفي وبياناتي", "My file and details"), t("بياناتك كما هي مسجّلة لدى الموارد البشرية.", "Your details as HR has them on file."))}
                <div className="space-y-4">
                  {factGroup(t("البيانات الشخصية", "Personal details"), [
                    [t("الاسم بالعربية", "Name in Arabic"), employee.fullName],
                    [t("الاسم بالإنجليزية", "Name in English"), employee.nameEn, true],
                    [t("الجنسية", "Nationality"), nationalityName(employee.nationality, lang)],
                    [t("تاريخ الميلاد", "Date of birth"), employee.dateOfBirth ? formatDate(employee.dateOfBirth) : null],
                    [t("الهاتف", "Phone"), employee.phone, true],
                    [t("البريد الإلكتروني", "Email"), employee.email, true],
                    [t("العنوان", "Address"), employee.address],
                  ])}
                  {factGroup(t("وظيفتي", "My job"), [
                    [t("الرقم الوظيفي", "Employee no."), employee.employeeNumber, true],
                    [t("المسمى الوظيفي", "Job title"), job],
                    [t("القسم", "Department"), termText(employee.department, employee.departmentEn, lang)],
                    [t("المدير المباشر", "Direct manager"), managerName],
                    [t("جهة العمل", "Employer"), issuer],
                    [t("تاريخ التعيين", "Joining date"), employee.joiningDate ? formatDate(employee.joiningDate) : null],
                    [t("نهاية العقد", "Contract end"), employee.contractEnd ? formatDate(employee.contractEnd) : null],
                    [t("الحالة", "Status"), pick(STATUS_LABEL[employee.status], lang, employee.status)],
                  ])}
                  {pay.length || employee.bankAccount ? (
                    <details className="group rounded-2xl border border-slate-200 p-3 @md:p-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-teal-800">
                        {t("راتبي وحسابي البنكي", "My salary and bank account")}
                        <span className="text-xs font-medium text-slate-500 group-open:hidden">{t("اضغط للعرض", "Tap to show")}</span>
                      </summary>
                      <dl className="mt-3 grid grid-cols-1 gap-2 @sm:grid-cols-2">
                        {pay.map((item) => (
                          <Fragment key={item.label}>{fact(item.label, money(item.value, company.currency))}</Fragment>
                        ))}
                        {pay.length ? fact(t("الإجمالي الشهري", "Monthly total"), money(packageGross(employee), company.currency)) : null}
                        {fact(t("البنك", "Bank"), employee.bankBic ? bankName(employee.bankBic, lang) || employee.bankBic : null)}
                        {fact(t("رقم الحساب", "Account number"), employee.bankAccount ? `•••• ${employee.bankAccount.slice(-4)}` : null, true)}
                      </dl>
                    </details>
                  ) : null}
                  {selfMissing.length ? (
                    <details id="complete" className="group scroll-mt-16 rounded-2xl border border-amber-200 p-3 @md:p-4" open={selfMissing.length >= 3}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-bold text-amber-900">
                        {t(`أكمل بياناتك الناقصة (${selfMissing.length})`, `Complete your missing details (${selfMissing.length})`)}
                        <span className="text-xs font-medium text-slate-500 group-open:hidden">{t("اضغط للإكمال", "Tap to complete")}</span>
                      </summary>
                      <form action={completeMyDetails} className="mt-3 space-y-3">
                        <input type="hidden" name="token" value={token} />
                        <SelfDataFields
                          fields={selfMissing}
                          lang={lang}
                          t={t}
                          required={false}
                          intro={t(
                            "هذه البيانات غير موجودة في ملفك، وبعض الخطابات والمستندات تعتمد عليها. أدخل ما ينطبق عليك (يمكن ترك ما لا ينطبق فارغاً).",
                            "These details are missing from your file, and some letters and documents depend on them. Enter what applies to you (leave the rest empty).",
                          )}
                        />
                        <SubmitButton className="w-full @md:w-auto" pendingLabel={t("جارٍ الحفظ...", "Saving...")}>
                          {t("حفظ بياناتي", "Save my details")}
                        </SubmitButton>
                      </form>
                    </details>
                  ) : null}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 @md:flex-row @md:items-center @md:justify-between">
                    <p className="text-xs leading-5 text-slate-500">
                      {t("بيان غير صحيح؟ ", "Something wrong? ")}
                      <a href="#requests" className="font-semibold text-teal-800 underline underline-offset-2">
                        {t("أرسل طلباً إلى الموارد البشرية لتصحيحه", "Send HR a request to correct it")}
                      </a>
                    </p>
                    <Link href={`${base}/profile`} className={`${secondaryBtn} w-full @md:w-auto`}>
                      <Printer size={16} />
                      {t("طباعة ملفي الكامل", "Print my profile")}
                    </Link>
                  </div>
                </div>
              </Card>

              {company.clockEnabled ? (
                <Card id="clock" className="scroll-mt-16 lg:scroll-mt-6">
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

              <Card id="leave" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(CalendarCheck2, t("الإجازات", "Leave"), t("رصيدك الحالي، وطلب إجازة جديدة تصل للموارد البشرية للموافقة.", "Your balances, and a new request that goes to HR for approval."))}
                {balances.length ? (
                  <div className="mb-4 grid grid-cols-2 gap-2 @md:grid-cols-3">
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
                <form action={requestLeave} className="grid gap-3 rounded-2xl border border-slate-200 p-3 @md:grid-cols-2 @md:p-4">
                  <input type="hidden" name="token" value={token} />
                  <label className="block space-y-1.5 @md:col-span-2">
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
                  <label className="block space-y-1.5 @md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">{t("السبب (اختياري)", "Reason (optional)")}</span>
                    <input className={`${fieldClass} w-full`} name="reason" maxLength={500} />
                  </label>
                  <div className="@md:col-span-2">
                    <SubmitButton className="w-full @md:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
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
                        {request.reason ? (
                          <p className="mt-1.5 break-words text-xs text-slate-500">
                            <Tr text={request.reason} />
                          </p>
                        ) : null}
                        {request.decisionNote ? (
                          <p className="mt-1.5 text-xs text-slate-600">
                            {t("ملاحظة الإدارة:", "Note from HR:")} <Tr text={request.decisionNote} />
                          </p>
                        ) : null}
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

              <Card id="payslips" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(
                  ReceiptText,
                  t("رواتبي ورسائل الراتب", "My salaries and salary letters"),
                  t("آخر 12 شهراً: لكل شهر قسيمة الراتب وإيصال استلامه في ملف واحد للطباعة أو الحفظ PDF.", "The last 12 months: each month's payslip and salary receipt in one file to print or save as PDF."),
                )}
                {salaries.length ? (
                  <ul className="divide-y divide-slate-100">
                    {salaries.map((salary) => (
                      <li key={salary.id}>
                        <Link href={`${base}/payslip/${salary.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:text-teal-800">
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {monthName(salary.month, lang)} {salary.year}
                            </span>
                            <span className="block text-xs text-slate-500">{t("القسيمة وإيصال الاستلام", "Payslip and receipt")}</span>
                          </span>
                          <span className="tabular shrink-0 font-bold">{money(salary.netSalary, company.currency)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{t("لا توجد رواتب مصروفة بعد.", "No paid salaries yet.")}</p>
                )}
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-800">{t("رسائل الراتب والشهادات", "Salary letters and certificates")}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {t("موقّعة إلكترونياً برمز QR تقبلها البنوك والجهات. «إصدار الآن» تصدر فوراً؛ و«طلب» يصل إلى الإدارة.", "E-signed with a QR code that banks and offices accept. “Issue now” is instant; “Request” goes to HR.")}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {salaryLetters.map((kind) => {
                      const latest = letters.find((letter) => letter.kind === kind);
                      const pending = employeeRequests.some((request) => request.type === "LETTER" && request.letterKind === kind && request.status === "PENDING");
                      const instant = autoKinds.includes(kind as (typeof autoKinds)[number]);
                      return (
                        <li key={kind} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900">{pick(LETTER_KIND[kind].label, lang)}</span>
                            {latest ? (
                              <Link href={`/letter/${latest.token}`} className="text-xs font-semibold text-teal-800 underline underline-offset-2">
                                {t(`تحميل آخر نسخة ${latest.refNo} (${formatDate(latest.issuedAt)})`, `Download latest ${latest.refNo} (${formatDate(latest.issuedAt)})`)}
                              </Link>
                            ) : null}
                          </span>
                          {pending ? (
                            <ToneBadge tone="amber">{t("بانتظار الاعتماد", "Awaiting approval")}</ToneBadge>
                          ) : letterMissing[kind] ? (
                            <details className="group w-full min-w-0">
                              <summary className={`${instant ? primaryBtn : secondaryBtn} w-full cursor-pointer list-none @md:w-auto group-open:hidden`}>
                                {instant ? t("إصدار الآن", "Issue now") : t("طلب", "Request")}
                              </summary>
                              <form action={submitEmployeeRequest} className="mt-1 space-y-3">
                                <input type="hidden" name="token" value={token} />
                                <input type="hidden" name="type" value="LETTER" />
                                <input type="hidden" name="letterKind" value={kind} />
                                <input type="hidden" name="section" value="payslips" />
                                <SelfDataFields
                                  fields={letterMissing[kind]!}
                                  lang={lang}
                                  t={t}
                                  required
                                  intro={t(`هذا الخطاب يعتمد على بيانات غير موجودة في ملفك. أدخلها ليصدر بها.`, `This letter depends on details missing from your file. Enter them so it can be issued.`)}
                                />
                                <SubmitButton variant={instant ? "primary" : "secondary"} className="w-full @md:w-auto" pendingLabel={t("جارٍ...", "Working...")}>
                                  {instant ? t("حفظ البيانات وإصدار الخطاب", "Save details and issue the letter") : t("حفظ البيانات وإرسال الطلب", "Save details and send the request")}
                                </SubmitButton>
                              </form>
                            </details>
                          ) : (
                            <form action={submitEmployeeRequest}>
                              <input type="hidden" name="token" value={token} />
                              <input type="hidden" name="type" value="LETTER" />
                              <input type="hidden" name="letterKind" value={kind} />
                              <input type="hidden" name="section" value="payslips" />
                              <SubmitButton variant={instant ? "primary" : "secondary"} pendingLabel={t("جارٍ...", "Working...")}>
                                {latest ? (instant ? t("نسخة جديدة الآن", "New copy now") : t("طلب نسخة جديدة", "Request a new copy")) : instant ? t("إصدار الآن", "Issue now") : t("طلب", "Request")}
                              </SubmitButton>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Card>

              <Card id="documents" className="scroll-mt-16 lg:scroll-mt-6">
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
                <details className="group mt-4 rounded-2xl border border-slate-200 p-3 @md:p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
                    <FileUp size={16} />
                    {t("إرسال مستند", "Send a document")}
                  </summary>
                  <form action={submitPortalDocument} className="mt-3 grid gap-3 @md:grid-cols-2">
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
                    <label className="block space-y-1.5 @md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">{t("ملاحظة", "Note")}</span>
                      <input className={`${fieldClass} w-full`} name="notes" maxLength={300} />
                    </label>
                    <div className="@md:col-span-2">
                      <SubmitButton className="w-full @md:w-auto" pendingLabel={t("جارٍ الرفع...", "Uploading...")}>
                        {t("إرسال للمراجعة", "Send for review")}
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              </Card>

              {heldDocuments.length || custodyForms.length ? (
                <Card id="custody" className="scroll-mt-16 lg:scroll-mt-6">
                  {sectionTitle(
                    FolderLock,
                    t("مستنداتي الأصلية لدى المنشأة", "My originals held by the company"),
                    t(
                      "جوازك وبطاقاتك وشهاداتك الأصلية المحفوظة لدى المنشأة. اطلب استلام ما تحتاجه، وأقرّ إلكترونياً بكل استمارة استلام أو تسليم.",
                      "Your original passport, cards and certificates kept by the company. Ask to collect what you need, and acknowledge each receipt or handover form online.",
                    ),
                  )}
                  {unacknowledged ? (
                    <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                      {t(`لديك ${unacknowledged} استمارة تسليم بانتظار إقرارك بالاستلام`, `${unacknowledged} handover form(s) await your acknowledgement`)}
                    </p>
                  ) : null}
                  <ul className="divide-y divide-slate-100">
                    {heldDocuments.map((doc) => {
                      const late = doc.status === "OUT" && doc.dueBack && doc.dueBack < now;
                      return (
                        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{pick(heldDocLabel(doc), lang)}</p>
                            <p className="text-xs text-slate-500">
                              <span dir="ltr">{doc.documentNo || "—"}</span>
                              {doc.status === "OUT" && doc.dueBack ? ` · ${t("أعِده قبل", "Return by")} ${formatDate(doc.dueBack)}` : ""}
                              {pendingDocIds.has(doc.id) ? ` · ${t("طلبت استلامه", "You asked for it")}` : ""}
                            </p>
                          </div>
                          <ToneBadge tone={late ? "red" : HELD_STATUS_TONE[doc.status] || "slate"}>
                            {late ? t("تأخرت إعادته", "Overdue") : doc.status === "OUT" ? t("معي", "With me") : pick(HELD_STATUS_LABEL.HELD, lang)}
                          </ToneBadge>
                        </li>
                      );
                    })}
                  </ul>
                  {requestableDocs.length ? (
                    <details className="group mt-4 rounded-2xl border border-slate-200 p-3 @md:p-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
                        <FileUp size={16} />
                        {t("طلب استلام مستندات أصلية", "Ask to collect originals")}
                      </summary>
                      <form action={submitEmployeeRequest} className="mt-3 grid gap-3 @md:grid-cols-2">
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="type" value="DOCUMENTS" />
                        <fieldset className="space-y-2 @md:col-span-2">
                          <legend className="mb-1.5 text-sm font-medium text-slate-700">{t("المستندات", "Documents")}</legend>
                          {requestableDocs.map((doc) => (
                            <label key={doc.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface p-3 ring-1 ring-inset ring-slate-200 has-[:checked]:bg-teal-50/60 has-[:checked]:ring-teal-300">
                              <input type="checkbox" name="documentIds" value={doc.id} className="mt-1 size-4 accent-teal-700" />
                              <span className="min-w-0 text-sm">
                                <span className="block font-semibold text-slate-900">{pick(heldDocLabel(doc), lang)}</span>
                                {doc.documentNo ? (
                                  <span className="block text-xs text-slate-500" dir="ltr">
                                    {doc.documentNo}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-slate-700">{t("الغرض", "Purpose")}</span>
                          <input className={`${fieldClass} w-full`} name="details" required minLength={3} maxLength={500} placeholder={t("مثال: سفر، تجديد رخصة، معاملة بنكية", "e.g. travel, licence renewal, bank errand")} />
                        </label>
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-slate-700">{t("سأعيدها بتاريخ", "I will return them on")}</span>
                          <input className={`${fieldClass} w-full`} type="date" name="dueBack" required min={todayInputValue()} defaultValue={toDateInput(new Date(Date.now() + 7 * 86_400_000))} />
                        </label>
                        <p className="text-xs leading-5 text-slate-500 @md:col-span-2">
                          {t(
                            "بعد موافقة الإدارة تصدر استمارة تسليم باسمك، تُقرّ فيها إلكترونياً باستلام المستندات وتتعهد بإعادتها في الموعد.",
                            "Once management approves, a handover form is issued in your name; you acknowledge receipt online and undertake to return them on time.",
                          )}
                        </p>
                        <div className="@md:col-span-2">
                          <SubmitButton className="w-full @md:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                            {t("إرسال الطلب", "Send request")}
                          </SubmitButton>
                        </div>
                      </form>
                    </details>
                  ) : null}
                  {custodyForms.length ? (
                    <div className="mt-4">
                      <h3 className="mb-2 text-sm font-bold text-slate-800">{t("استمارات الاستلام والتسليم", "Receipt and handover forms")}</h3>
                      <ul className="divide-y divide-slate-100">
                        {custodyForms.map((form) => (
                          <li key={form.id}>
                            <Link href={`${base}/custody/${form.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition hover:text-teal-800">
                              <span className="min-w-0">
                                <span className="block font-medium">{pick(CUSTODY_DIRECTION[form.direction]?.title, lang, form.direction)}</span>
                                <span className="text-xs text-slate-500">
                                  <span className="tabular" dir="ltr">
                                    {form.refNo}
                                  </span>{" "}
                                  · {formatDate(form.createdAt)} · {t(`${form._count.items} مستند`, `${form._count.items} document(s)`)}
                                </span>
                              </span>
                              {form.acknowledgedAt ? (
                                <ToneBadge tone="green">{t("أقررت بها", "Acknowledged")}</ToneBadge>
                              ) : (
                                <ToneBadge tone="amber">{t("بانتظار إقرارك", "Please acknowledge")}</ToneBadge>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ) : null}
            </div>
            <div className="@container min-w-0 space-y-4">
              <Card id="requests" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(
                  Inbox,
                  t("الطلبات والخطابات", "Requests and letters"),
                  t("اطلب شهادة راتب أو تعريف أو تحويل راتب أو أي خطاب، أو سلفة، أو قدّم استقالتك. تعتمدها الإدارة إلكترونياً وتظهر النتيجة هنا.", "Ask for a salary, employment or salary-transfer letter or any other letter, an advance, or submit your resignation. Management approves electronically and the result shows here."),
                )}
                <PortalRequests
                  token={token}
                  requests={employeeRequests}
                  currency={company.currency}
                  lang={lang}
                  t={t}
                  autoKinds={autoKinds}
                  letterMissing={letterMissing}
                  resignationContext={{
                    name: employee.fullName,
                    nameEn: employee.nameEn || employee.fullName,
                    employeeNumber: employee.employeeNumber,
                    female: employee.gender === "FEMALE",
                    job: termText(employee.jobTitle, employee.jobTitleEn, "ar") || "",
                    jobEn: termText(employee.jobTitle, employee.jobTitleEn, "en") || "",
                    company: employee.employer?.name || company.name,
                    companyEn: employee.employer?.nameEn || employee.employer?.name || company.nameEn || company.name,
                  }}
                />
              </Card>

              <Card id="expenses" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(Wallet, t("تعويض المصروفات", "Expense claims"), t("صرفت من مالك لأجل العمل؟ أرسل الإيصال، وبعد الموافقة يُصرف لك مع الراتب أو مباشرة.", "Spent your own money on work? Send the receipt; once approved it is paid with your salary or directly."))}
                <details className="group rounded-2xl border border-slate-200 p-3 @md:p-4" open={claims.length === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-teal-800">
                    <FileUp size={16} />
                    {t("طلب تعويض جديد", "New claim")}
                  </summary>
                  <form action={submitExpense} className="mt-3 grid gap-3 @md:grid-cols-2">
                    <input type="hidden" name="token" value={token} />
                    <label className="block space-y-1.5 @md:col-span-2">
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
                    <label className="block space-y-1.5 @md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">{t("ملاحظة", "Note")}</span>
                      <input className={`${fieldClass} w-full`} name="notes" maxLength={500} />
                    </label>
                    <div className="@md:col-span-2">
                      <SubmitButton className="w-full @md:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
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
                        {claim.decisionNote ? (
                          <p className="mt-1.5 break-words text-xs text-slate-600">
                            {t("ملاحظة الإدارة:", "Note from HR:")} <Tr text={claim.decisionNote} />
                          </p>
                        ) : null}
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
                <Card id="letters" className="scroll-mt-16 lg:scroll-mt-6">
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
                          {LETTER_KIND[letter.kind as LetterKind]?.document ? (
                            <ToneBadge tone="teal">{t("موقّع إلكترونياً", "E-signed")}</ToneBadge>
                          ) : letter.acknowledgedAt ? (
                            <ToneBadge tone="green">{t("تم التأكيد", "Confirmed")}</ToneBadge>
                          ) : (
                            <ToneBadge tone="amber">{t("بانتظار تأكيدك", "Please confirm")}</ToneBadge>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              {reviews.length ? (
                <Card id="reviews" className="scroll-mt-16 lg:scroll-mt-6">
                  {sectionTitle(Target, t("تقييم الأداء", "Performance reviews"), t("الدرجات من 1 إلى 5، مع ملاحظات مديرك وأهدافك للفترة القادمة.", "Scores from 1 to 5, with your manager's notes and your goals for the next period."))}
                  <div className="space-y-3">
                    {reviews.map((review, index) => {
                      const scores = parseScores(review.scores);
                      const band = overallBand(review.overall);
                      return (
                        <details key={review.id} open={index === 0} className="group rounded-2xl border border-slate-200 p-3 @md:p-4">
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
                          <ul className="mt-3 grid gap-1.5 @md:grid-cols-2">
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

              <Card id="cv" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(
                  FileUser,
                  t("سيرتي الذاتية وملفي", "My CV and profile"),
                  t("عبّئ سيرتك بأسلوبك ودع الذكاء الاصطناعي يصوغها باحتراف، ثم اطبع ملفك الكامل أو بطاقة عملك.", "Fill in your CV your way and let AI polish it, then print your full profile or business card."),
                )}
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-600">{t("اكتمال السيرة", "CV completeness")}</span>
                    <span className="tabular font-bold text-teal-800">{cvProgress.score}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${cvProgress.score}%` }} />
                  </div>
                  {cvProgress.missing.length ? (
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {t("ينقصها: ", "Missing: ")}
                      {cvProgress.missing
                        .slice(0, 3)
                        .map((item) => pick(item, lang))
                        .join(t("، ", ", "))}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 @md:grid-cols-3">
                  <Link href={`${base}/cv`} className={primaryBtn}>
                    <PenLine size={16} />
                    {hasCvContent(cvVersion.content) ? t("تعديل سيرتي", "Edit my CV") : t("إنشاء سيرتي", "Create my CV")}
                  </Link>
                  <Link href={`${base}/profile`} className={secondaryBtn}>
                    <Printer size={16} />
                    {t("طباعة ملفي الكامل", "Print my profile")}
                  </Link>
                  <Link href={`${base}/business-card`} className={secondaryBtn}>
                    <Contact size={16} />
                    {t("بطاقة العمل", "Business card")}
                  </Link>
                </div>
              </Card>

              <Card id="badge" className="scroll-mt-16 lg:scroll-mt-6">
                {sectionTitle(
                  IdCard,
                  t("بطاقتي", "My ID card"),
                  t("اعرض هذا الرمز عند الطلب. مسحه يُظهر اسمك ووظيفتك وجهة عملك وصورتك فقط.", "Show this code when asked. Scanning it shows only your name, job, workplace and photo."),
                )}
                <div className="flex flex-col items-center gap-4 @md:flex-row">
                  <div className="size-44 shrink-0 rounded-2xl bg-white p-2 ring-1 ring-slate-200 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: badgeSvg }} />
                  <div className="min-w-0 text-center @md:text-start">
                    <p className="font-bold text-slate-900">{name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      <span className="tabular">{employee.employeeNumber}</span>
                      {job ? ` · ${job}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">{issuer}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
          <p className="px-2 pb-6 text-center text-xs leading-5 text-slate-500 lg:hidden">
            {t("هذا الرابط خاص بك. لا تشاركه مع أحد.", "This link is personal. Do not share it.")}
          </p>
        </main>
      </div>
    </div>
  );
}
