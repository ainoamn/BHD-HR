import Link from "next/link";
import { notFound } from "next/navigation";
import { Tr } from "@/components/ai-translate";
import { AccountCard } from "@/components/account-card";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, InfoItem as Info, SectionTitle, ToneBadge, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { SELF_FIELD_LABEL, readSelfMarks, type SelfField } from "@/lib/self-data";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookUser,
  BriefcaseBusiness,
  CalendarCheck2,
  ClipboardList,
  Contact,
  DoorOpen,
  FileUser,
  ExternalLink,
  FileBadge,
  Inbox,
  Mail,
  Pencil,
  Phone,
  Printer,
  ReceiptText,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cvCompleteness, cvFor, readCv } from "@/lib/cv";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { badgeUrl, ensureBadgeToken, qrSvg } from "@/lib/badge";
import { AttendanceEditForm, DeleteButton, DocumentEditForm } from "@/components/row-forms";
import { can, requirePermission } from "@/lib/auth";
import { allowanceAmount, describeAllowance } from "@/lib/allowances";
import { DOC_LABEL, EXTRA_DOC_TYPES, GENDER_LABEL, STATUS_LABEL, STATUS_TONE, monthName, termText } from "@/lib/constants";
import { describeExpiry, worstExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { formatPhone, phoneHref } from "@/lib/phone";
import {
  attendanceChoiceOf,
  attendanceChoices,
  attendanceLabel,
  computeLeaveBalances,
  groupAttendance,
  leaveName,
  leaveWarningText,
  leaveWarnings,
  remainingByKey,
} from "@/lib/leave";
import { nationalityName } from "@/lib/nationalities";
import { prisma } from "@/lib/prisma";
import { monthKey, payItemProgress } from "@/lib/pay-items";
import { packageGross, totalDeductions, totalEarnings } from "@/lib/salary";
import { cn, currentPeriod, daysLabel, formatDate, money, round3, text, toDateInput, todayInputValue } from "@/lib/utils";
import { deleteAttendance, markAttendance, updateAttendance } from "@/server/attendance-actions";
import { addDocument, deleteDocument, updateDocument } from "@/server/document-actions";
import { DocumentScan } from "@/components/document-scan";
import { bankName } from "@/lib/banks";
import { HR_DOC_LABEL, HR_DOC_NEEDS_SALARY, HR_DOC_TYPES } from "@/lib/hr-docs";
import { gratuity } from "@/lib/oman";
import { deleteEmployee, renewBadgeToken } from "@/server/employee-actions";
import { addLeaveCredit } from "@/server/leave-actions";
import { savePayItem } from "@/server/pay-item-actions";
import { createSalary } from "@/server/salary-actions";
import { PayItemForm } from "@/components/pay-item-form";
import { PayItemsList } from "@/components/pay-items-list";
import { EmployeeHrTab } from "@/components/employee-hr-tab";
import { EmployeeLettersTab, EmployeeNotesTab, EmployeeTasksTab, PinnedNotes } from "@/components/employee-workspace";
import { LETTER_KIND, WARNING_KINDS, WARNING_LOOKBACK_DAYS, type LetterKind } from "@/lib/letters";
import { employeeOptions, loadBoardTasks } from "@/lib/task-data";
import { isClosedStatus } from "@/lib/tasks";
import { ShareLetter } from "@/components/share-letter";
import { muscatTime, workedLabel } from "@/lib/clock";
import { portalUrl } from "@/lib/portal";
import { requestOrigin } from "@/lib/request-origin";
import { disablePortalLink, renewPortalLink } from "@/server/request-actions";

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      employer: true,
      documents: { orderBy: { createdAt: "desc" } },
      attendance: { orderBy: { date: "desc" } },
      leaveCredits: { orderBy: { createdAt: "desc" } },
      salaries: { orderBy: [{ year: "desc" }, { month: "desc" }] },
      allowances: { include: { allowanceType: true }, orderBy: { createdAt: "asc" } },
      manager: { select: { id: true, fullName: true, nameEn: true } },
      reports: { where: { status: { not: "TERMINATED" } }, select: { id: true, fullName: true, nameEn: true }, orderBy: { fullName: "asc" } },
      clockEntries: { orderBy: { day: "desc" }, take: 31 },
      _count: { select: { leaveRequests: { where: { status: "PENDING" } } } },
    },
  });
  if (!employee) notFound();
  const selfMarks = Object.entries(readSelfMarks(employee.selfProvided)) as [SelfField, { at: string }][];
  const leaveTypes = await getLeaveTypes(user.companyId);
  const allow = {
    edit: can(user, "employees.edit"),
    remove: can(user, "employees.delete"),
    docs: can(user, "documents.view"),
    docAdd: can(user, "documents.create"),
    docEdit: can(user, "documents.edit"),
    docDelete: can(user, "documents.delete"),
    attendance: can(user, "attendance.view"),
    attAdd: can(user, "attendance.create"),
    attEdit: can(user, "attendance.edit"),
    attDelete: can(user, "attendance.delete"),
    salaries: can(user, "salaries.view"),
    tasks: can(user, "tasks.view"),
    taskAdd: can(user, "tasks.create"),
    taskEdit: can(user, "tasks.edit"),
    taskDelete: can(user, "tasks.delete"),
    letters: can(user, "letters.view"),
    letterAdd: can(user, "letters.create"),
    reviews: can(user, "performance.view"),
    assets: can(user, "assets.view"),
    expenses: can(user, "expenses.view"),
  };
  const warningSince = new Date(Date.now() - WARNING_LOOKBACK_DAYS * 86400000);
  const [notes, employeeTasks, taskEmployees, letters, openRequests] = await Promise.all([
    allow.tasks
      ? prisma.employeeNote.findMany({
          where: { employeeId: employee.id, companyId: user.companyId },
          select: { id: true, kind: true, body: true, pinned: true, authorName: true, createdAt: true, updatedAt: true },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        })
      : [],
    allow.tasks ? loadBoardTasks({ companyId: user.companyId, archivedAt: null, assignees: { some: { employeeId: employee.id } } }, lang) : [],
    allow.taskAdd ? employeeOptions(user.companyId, lang) : [],
    allow.letters
      ? prisma.letter.findMany({
          where: { employeeId: employee.id, companyId: user.companyId },
          select: { id: true, kind: true, refNo: true, subject: true, issuedAt: true, cancelledAt: true, acknowledgedAt: true, viewedAt: true, deliveries: { select: { status: true } } },
          orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        })
      : [],
    prisma.employeeRequest.findMany({
      where: { employeeId: employee.id, companyId: user.companyId, OR: [{ status: "PENDING" }, { type: "RESIGNATION", status: "APPROVED" }] },
      select: { id: true, type: true, status: true, lastDay: true, approvedLastDay: true, letterId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const accepted = employee.status === "TERMINATED" ? null : openRequests.find((request) => request.type === "RESIGNATION" && request.status === "APPROVED");
  const acceptedResignation = accepted ? { ...accepted, lastDay: accepted.approvedLastDay || accepted.lastDay } : null;
  const pendingRequests = openRequests.filter((request) => request.status === "PENDING").length;
  const activeWarnings = letters.filter((letter) => !letter.cancelledAt && WARNING_KINDS.includes(letter.kind as LetterKind) && letter.issuedAt >= warningSince).length;
  const openTasks = employeeTasks.filter((task) => !isClosedStatus(task.status)).length;
  const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes);
  const annual = balances.find((item) => item.key === "annual") || balances[0];
  const periods = groupAttendance(employee.attendance);
  const warnDays = user.company.leaveWarningDays;
  const warnings = leaveWarnings(balances, warnDays);
  const warnedKeys = new Set(warnings.map((item) => item.key));
  const balanceMap = { [employee.id]: remainingByKey(balances) };
  const choices = attendanceChoices(leaveTypes, lang);
  const tabAllowed: Record<string, boolean> = {
    info: true,
    notes: allow.tasks,
    tasks: allow.tasks,
    letters: allow.letters,
    docs: allow.docs,
    attendance: allow.attendance,
    salaries: allow.salaries,
    pay: allow.salaries,
    hr: allow.reviews || allow.assets || allow.expenses,
  };
  const now = currentPeriod();
  const nowKey = monthKey(now.year, now.month);
  const defaultStart = `${now.year}-${String(now.month).padStart(2, "0")}`;
  const payItems = allow.salaries
    ? await prisma.payItem.findMany({
        where: { employeeId: employee.id, companyId: user.companyId },
        include: {
          employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true } },
          lines: { select: { amount: true, salary: { select: { year: true, month: true, paid: true } } } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const payProgress = payItems.map((item) => payItemProgress(item, nowKey));
  const outstanding = round3(payProgress.reduce((sum, progress) => sum + (progress.status === "STOPPED" ? 0 : progress.remaining || 0), 0));
  const openPayItems = payProgress.filter((progress) => progress.status === "ACTIVE" || progress.status === "SCHEDULED").length;
  const tab = tabAllowed[sp.tab || ""] ? sp.tab! : "info";
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const currency = user.company.currency;
  const gross = packageGross(employee);
  const primaryDocs = [
    { label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry, fileUrl: employee.idFileUrl },
    { label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry, fileUrl: employee.passportFileUrl },
    { label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry, fileUrl: employee.residenceFileUrl },
  ];
  const docsWorst = worstExpiry(
    [...primaryDocs.map((doc) => doc.expiry), ...employee.documents.map((doc) => doc.expiryDate)],
    limits,
    lang,
  );
  const lastSalary = employee.salaries[0];
  const accrued = gratuity({ joiningDate: employee.joiningDate, endDate: new Date(), basicSalary: employee.basicSalary, nationality: employee.nationality });
  const tabs = [
    { id: "info", label: t("البيانات", "Details"), count: null },
    { id: "notes", label: t("الملاحظات", "Notes"), count: notes.length },
    { id: "tasks", label: t("المهام", "Tasks"), count: openTasks },
    { id: "letters", label: t("الخطابات والإنذارات", "Letters & warnings"), count: letters.length },
    { id: "docs", label: t("الوثائق", "Documents"), count: primaryDocs.filter((doc) => doc.number || doc.expiry || doc.fileUrl).length + employee.documents.length },
    { id: "attendance", label: t("الحضور والإجازات", "Attendance & leave"), count: periods.length },
    { id: "salaries", label: t("الرواتب", "Salaries"), count: employee.salaries.length },
    { id: "pay", label: t("السلف والمكافآت", "Advances & bonuses"), count: openPayItems },
    { id: "hr", label: t("الأداء والعهد والمصروفات", "Performance, assets & expenses"), count: null },
  ].filter((item) => tabAllowed[item.id]);
  const employer = employee.employer;
  const employerName = employer ? (lang === "en" && employer.nameEn ? employer.nameEn : employer.name) : null;
  const displayName = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const otherName = lang === "en" ? employee.fullName : employee.nameEn;
  const secondName = otherName && otherName.trim().toLowerCase() !== displayName.trim().toLowerCase() ? otherName : null;
  const jobTitle = termText(employee.jobTitle, employee.jobTitleEn, lang);
  const department = termText(employee.department, employee.departmentEn, lang);
  const base = `/employees/${employee.id}`;
  const origin = await requestOrigin();
  const portalLink = employee.portalToken ? portalUrl(origin, employee.portalToken) : null;
  const badgeLink = badgeUrl(origin, await ensureBadgeToken(employee));
  const badgeSvg = await qrSvg(badgeLink);
  const cvProgress = cvCompleteness(cvFor(readCv(employee.cv), lang).content, Boolean(employee.photoUrl));
  const personName = (person: { fullName: string; nameEn: string | null }) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;

  const periodActions = (period: (typeof periods)[number]) =>
    allow.attEdit || allow.attDelete ? (
      <div className="flex flex-wrap items-start justify-end gap-3">
        {allow.attEdit ? (
          <AttendanceEditForm
            action={updateAttendance}
            id={period.deleteId}
            returnTo={`${base}?tab=attendance`}
            type={attendanceChoiceOf(period.row)}
            choices={choices}
            start={period.start}
            end={period.end}
            deductsSalary={period.row.deductsSalary}
            notes={period.row.notes}
          />
        ) : null}
        {allow.attDelete ? (
          <DeleteButton
            action={deleteAttendance}
            fields={{ id: period.deleteId, returnTo: `${base}?tab=attendance` }}
            confirm={t("حذف هذه الفترة وإرجاع أيامها إلى الرصيد؟", "Delete this period and return its days to the balance?")}
          />
        ) : null}
      </div>
    ) : null;

  const salaryActions = (salary: (typeof employee.salaries)[number]) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <Link className="font-semibold text-teal-800" href={`/salaries/${salary.id}`}>
        {t("عرض", "View")}
      </Link>
      <Link className="font-semibold text-slate-700" href={`/salaries/${salary.id}/print?doc=slip`}>
        {t("القسيمة", "Payslip")}
      </Link>
      {salary.paid ? (
        <Link className="font-semibold text-slate-700" href={`/salaries/${salary.id}/print?doc=receipt`}>
          {t("إيصال", "Receipt")}
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="page-wide space-y-5">
      <Link href="/employees" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل الموظفين", "All employees")}
      </Link>

      <section className="animate-fade-up overflow-hidden rounded-3xl border border-slate-200/90 bg-surface shadow-card">
        <div className="relative h-24 overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 sm:h-28" aria-hidden="true">
          <div className="higher-horizon absolute -bottom-10 end-4 h-44 w-72 bg-[length:100%] opacity-[0.1]" />
        </div>
        <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-end gap-4 sm:min-w-[18rem] sm:flex-1">
            <EmployeeAvatar
              name={displayName}
              photo={employee.photoUrl}
              eager
              className="relative -mt-10 size-20 rounded-2xl bg-teal-700 text-3xl text-white shadow-raised ring-4 ring-surface sm:-mt-12 sm:size-24"
            />
            <div className="min-w-0 pb-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{displayName}</h1>
                <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
              </div>
              {secondName ? (
                <p className="mt-0.5 break-words text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                  {secondName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {allow.edit ? (
              <Link href={`${base}/edit`} className={primaryBtn}>
                <Pencil size={16} />
                {t("تعديل البيانات", "Edit")}
              </Link>
            ) : null}
            <Link href={`${base}/profile`} className={secondaryBtn}>
              <Printer size={16} />
              {t("طباعة الملف", "Print profile")}
            </Link>
            {allow.salaries ? (
              <Link href={`${base}?tab=salaries#statement`} className={secondaryBtn}>
                <ReceiptText size={16} />
                {t("كشف الرواتب", "Statement")}
              </Link>
            ) : null}
            {allow.letterAdd ? (
              <Link href={`/letters/new?employeeId=${employee.id}`} className={secondaryBtn}>
                <ScrollText size={16} />
                {t("خطاب / إنذار", "Letter / warning")}
              </Link>
            ) : null}
            {allow.remove ? (
              <DeleteButton
                action={deleteEmployee}
                fields={{ id: employee.id }}
                variant="danger"
                label={t("حذف الموظف", "Delete employee")}
                confirm={t(
                  `حذف ${employee.fullName} نهائياً مع وثائقه وسجل حضوره ورواتبه غير المصروفة؟ لا يمكن التراجع.`,
                  `Permanently delete ${employee.fullName} with documents, attendance and unpaid salaries? This cannot be undone.`,
                )}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs sm:px-6">
          <span className="tabular inline-flex items-center rounded-full bg-surface px-3 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">{employee.employeeNumber}</span>
          {jobTitle ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-slate-700 ring-1 ring-slate-200">
              <BriefcaseBusiness size={13} className="text-slate-400" />
              {jobTitle}
            </span>
          ) : null}
          {department ? <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-slate-700 ring-1 ring-slate-200">{department}</span> : null}
          {employerName ? (
            <Link href={`/employers/${employer!.id}`} className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-800 ring-1 ring-teal-100 hover:bg-teal-100">
              {t("الكفيل:", "Sponsor:")} {employerName}
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-amber-800 ring-1 ring-amber-100">{t("بدون كفيل", "No sponsor")}</span>
          )}
          {employee.phone ? (
            <a href={phoneHref(employee.phone)} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-slate-700 ring-1 ring-slate-200 hover:text-teal-700" dir="ltr">
              <Phone size={13} className="text-slate-400" />
              {formatPhone(employee.phone)}
            </a>
          ) : null}
          {employee.email ? (
            <a href={`mailto:${employee.email}`} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-surface px-3 py-1 text-slate-700 ring-1 ring-slate-200 hover:text-teal-700" dir="ltr">
              <Mail size={13} className="shrink-0 text-slate-400" />
              <span className="truncate">{employee.email}</span>
            </a>
          ) : null}
        </div>
      </section>

      {allow.attendance && warnings.length ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800" role="alert">
          <p className="font-bold">{t("تنبيه رصيد الإجازات", "Leave balance alert")}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
            {warnings.map((item) => (
              <li key={item.key}>{leaveWarningText(item, lang)}</li>
            ))}
          </ul>
          {warnings.some((item) => item.level === "exceeded") ? (
            <p className="mt-1.5 text-xs">
              {t(
                "الأيام الزائدة تبقى ظاهرة بالأحمر حتى تضيف أياماً للرصيد من «أرصدة الإجازة» أو تحذف الفترة.",
                "Extra days stay red until you add days under “Leave balances” or delete the period.",
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {acceptedResignation ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="flex items-start gap-2 text-sm">
            <DoorOpen size={18} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-bold">{t("استقالة مقبولة", "Resignation accepted")}</span> —{" "}
              {t(`آخر يوم عمل ${formatDate(acceptedResignation.lastDay)}. أنهِ الخدمة من «تعديل» بعد إخلاء الطرف وصرف المستحقات.`, `last working day ${formatDate(acceptedResignation.lastDay)}. End the service from “Edit” after clearance and settlement.`)}
            </span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
            {allow.salaries ? (
              <Link href={`${base}/hr-doc?type=settlement&end=${toDateInput(acceptedResignation.lastDay)}`} className="underline underline-offset-4">
                {t("تسوية نهاية الخدمة", "Final settlement")}
              </Link>
            ) : null}
            <Link href={`/approvals/resignation/${acceptedResignation.id}`} className="underline underline-offset-4">
              {t("الاستقالة الموقّعة", "Signed resignation")}
            </Link>
            {acceptedResignation.letterId && allow.letters ? (
              <Link href={`/letters/${acceptedResignation.letterId}`} className="underline underline-offset-4">
                {t("خطاب القبول", "Acceptance letter")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {pendingRequests ? (
        <Link href="/approvals#requests" className="flex items-center justify-between gap-2 rounded-2xl border border-aqua-100 bg-aqua-50 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-aqua-100">
          <span className="flex items-center gap-2">
            <Inbox size={17} className="text-aqua-700" />
            {t(`لدى الموظف ${pendingRequests} طلب بانتظار الاعتماد`, `${pendingRequests} request(s) from this employee awaiting approval`)}
          </span>
          <span className="text-teal-800">{t("فتح الطلبات", "Open requests")}</span>
        </Link>
      ) : null}

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {allow.salaries ? (
          <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-slate-500">{t("إجمالي الراتب", "Gross salary")}</p>
              <Wallet size={17} className="shrink-0 text-gold-500" />
            </div>
            <p className="tabular mt-1.5 truncate text-lg font-bold text-slate-900">{money(gross, currency)}</p>
          </div>
        ) : null}
        {allow.attendance && annual ? (
          <div className={cn("min-w-0 rounded-2xl border p-4 shadow-card", warnedKeys.has(annual.key) ? "border-red-200 bg-red-50" : "border-slate-200/90 bg-surface")}>
            <div className="flex items-center justify-between gap-2">
              <p className={cn("truncate text-xs font-medium", warnedKeys.has(annual.key) ? "text-red-700" : "text-slate-500")}>
                {t("رصيد", "Left:")} {leaveName(annual, lang)}
              </p>
              <CalendarCheck2 size={17} className={cn("shrink-0", warnedKeys.has(annual.key) ? "text-red-500" : "text-teal-600")} />
            </div>
            <p className={cn("tabular mt-1.5 text-lg font-bold", warnedKeys.has(annual.key) ? "text-red-700" : "text-slate-900")}>
              {daysLabel(annual.remaining)} <span className="text-sm font-normal text-slate-500">{t("يوم", "days")}</span>
            </p>
          </div>
        ) : null}
        {allow.docs ? (
          <Link href={`${base}?tab=docs`} className="min-w-0 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-slate-500">{t("أقرب انتهاء وثيقة", "Nearest document expiry")}</p>
              <FileBadge size={17} className="shrink-0 text-navy-500" />
            </div>
            <div className="mt-2">
              <ToneBadge tone={docsWorst.tone}>{docsWorst.label}</ToneBadge>
            </div>
          </Link>
        ) : null}
        {allow.salaries ? (
        <Link href={`${base}?tab=salaries`} className="min-w-0 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-slate-500">{t("آخر راتب", "Last salary")}</p>
            <ReceiptText size={17} className="shrink-0 text-aqua-600" />
          </div>
          {lastSalary ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">
                {monthName(lastSalary.month, lang)} {lastSalary.year}
              </span>
              <ToneBadge tone={lastSalary.paid ? "green" : "amber"}>{lastSalary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">{t("لا يوجد بعد", "None yet")}</p>
          )}
        </Link>
        ) : null}
      </div>

      <nav className="no-print -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t("أقسام ملف الموظف", "Profile sections")}>
        <div className="segmented flex-nowrap">
          {tabs.map((item) => (
            <Link key={item.id} href={`${base}?tab=${item.id}`} aria-current={item.id === tab ? "page" : undefined}>
              {item.label}
              {item.count ? (
                <span className={cn("tabular rounded-full px-1.5 text-xs leading-5", item.id === tab ? "bg-teal-50 text-teal-800" : "bg-surface/70 text-slate-500")}>{item.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {tab === "notes" ? (
            <EmployeeNotesTab
              employeeId={employee.id}
              notes={notes}
              lang={lang}
              returnTo={`${base}?tab=notes`}
              allow={{ create: allow.taskAdd, edit: allow.taskEdit, remove: allow.taskDelete }}
            />
          ) : null}

          {tab === "tasks" ? (
            <EmployeeTasksTab
              employeeId={employee.id}
              tasks={employeeTasks.map(({ dueDate: _dueDate, createdAt: _createdAt, ...task }) => task)}
              employees={taskEmployees}
              lang={lang}
              returnTo={`${base}?tab=tasks`}
              canCreate={allow.taskAdd}
            />
          ) : null}

          {tab === "hr" ? (
            <EmployeeHrTab
              employeeId={employee.id}
              companyId={user.companyId}
              lang={lang}
              currency={user.company.currency}
              returnTo={`${base}?tab=hr`}
              show={{ reviews: allow.reviews, assets: allow.assets, expenses: allow.expenses }}
              claimAllow={{ decide: can(user, "expenses.edit"), pay: can(user, "expenses.pay"), salaryPay: allow.salaries && can(user, "salaries.create"), remove: can(user, "expenses.delete") }}
            />
          ) : null}

          {tab === "letters" ? <EmployeeLettersTab employeeId={employee.id} letters={letters} activeWarnings={activeWarnings} lang={lang} canCreate={allow.letterAdd} /> : null}

          {tab === "info" ? (
            <>
              <PinnedNotes notes={notes.filter((note) => note.pinned)} lang={lang} href={`${base}?tab=notes`} />
              <Card>
                <SectionTitle>{t("البيانات الشخصية", "Personal details")}</SectionTitle>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <Info label={t("الاسم الكامل", "Full name")} value={employee.fullName} />
                  <Info label={t("الاسم بالإنجليزية", "Name in English")} value={text(employee.nameEn)} dir="ltr" />
                  <Info label={t("الجنسية", "Nationality")} value={text(nationalityName(employee.nationality, lang))} />
                  <Info label={t("الجنس", "Gender")} value={employee.gender ? pick(GENDER_LABEL[employee.gender], lang, employee.gender) : "—"} />
                  <Info label={t("تاريخ الميلاد", "Date of birth")} value={formatDate(employee.dateOfBirth)} />
                  <Info label={t("الهاتف", "Phone")} value={text(formatPhone(employee.phone))} dir="ltr" />
                  <Info label={t("البريد الإلكتروني", "Email")} value={text(employee.email)} dir="ltr" />
                  <Info label={t("العنوان", "Address")} value={text(employee.address)} wide />
                </dl>
                {selfMarks.length ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm leading-6 text-sky-800 ring-1 ring-inset ring-sky-200">
                    <ShieldCheck size={16} className="mt-1 shrink-0" />
                    <p className="min-w-0">
                      <span className="font-semibold">{t("أدخلها الموظف بنفسه من بوابته وأقرّ بصحتها وتحمّل مسؤوليتها:", "Entered by the employee in their portal, declared correct and their responsibility:")}</span>{" "}
                      {selfMarks.map(([field, mark]) => `${pick(SELF_FIELD_LABEL[field], lang)} (${formatDate(new Date(mark.at))})`).join(lang === "ar" ? "، " : ", ")}.{" "}
                      <span className="text-xs text-slate-500">{t("تزول العلامة عن أي بيان تعدّله أنت.", "The mark goes from any detail you change.")}</span>
                    </p>
                  </div>
                ) : null}
              </Card>
              <Card>
                <SectionTitle>{t("العمل والعقد", "Employment & contract")}</SectionTitle>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <Info
                    label={t("الكفيل / صاحب العمل", "Sponsor / employer")}
                    value={
                      employerName ? (
                        <Link href={`/employers/${employer!.id}`} className="text-teal-800 hover:underline">
                          {employerName}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Info label={t("المسمى الوظيفي", "Job title")} value={text(jobTitle)} />
                  <Info label={t("القسم", "Department")} value={text(department)} />
                  <Info
                    label={t("المدير المباشر", "Direct manager")}
                    value={
                      employee.manager ? (
                        <Link href={`/employees/${employee.manager.id}`} className="text-teal-800 hover:underline">
                          {personName(employee.manager)}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Info
                    label={t("يتبعه مباشرة", "Direct reports")}
                    value={
                      employee.reports.length ? (
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {employee.reports.map((person) => (
                            <Link key={person.id} href={`/employees/${person.id}`} className="text-teal-800 hover:underline">
                              {personName(person)}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Info label={t("الحالة", "Status")} value={pick(STATUS_LABEL[employee.status], lang, employee.status)} />
                  <Info label={t("تاريخ الالتحاق", "Joining date")} value={formatDate(employee.joiningDate)} />
                  <Info label={t("نهاية العقد", "Contract end")} value={formatDate(employee.contractEnd)} />
                  {allow.salaries ? (
                    <Info
                      label={t("الحساب البنكي", "Bank account")}
                      value={employee.bankAccount ? `${bankName(employee.bankBic, lang) || "—"} · ${employee.bankAccount}` : "—"}
                      dir="ltr"
                    />
                  ) : null}
                </dl>
              </Card>
              {allow.docs ? (
              <Card>
                <SectionTitle
                  action={
                    <Link href={`${base}?tab=docs`} className="text-sm font-semibold text-teal-800">
                      {t("كل الوثائق", "All documents")}
                    </Link>
                  }
                >
                  {t("الهوية والإقامة", "Identity & residence")}
                </SectionTitle>
                <div className="divide-y divide-slate-100">
                  {primaryDocs.map((doc) => {
                    const status = describeExpiry(doc.expiry, limits, lang);
                    return (
                      <div key={doc.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{doc.label}</p>
                          <p className="text-xs text-slate-500">
                            {doc.number || doc.expiry ? (
                              <>
                                <span dir="ltr">{text(doc.number)}</span> · {t("ينتهي", "Expires")} {formatDate(doc.expiry)}
                              </>
                            ) : (
                              t("غير مسجّل", "Not recorded")
                            )}
                            {doc.fileUrl ? (
                              <>
                                {" · "}
                                <a className="font-semibold text-teal-800" href={doc.fileUrl} target="_blank">
                                  {t("عرض المرفق", "View file")}
                                </a>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                      </div>
                    );
                  })}
                </div>
              </Card>
              ) : null}
              {employee.notes ? (
                <Card>
                  <SectionTitle>{t("ملاحظات", "Notes")}</SectionTitle>
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-600">
                    <Tr text={employee.notes} />
                  </p>
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === "docs" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {primaryDocs.map((doc) => {
                  const status = describeExpiry(doc.expiry, limits, lang);
                  return (
                    <Card key={doc.label} className="space-y-2">
                      <h2 className="font-bold">{doc.label}</h2>
                      <p className="text-sm text-slate-500">
                        {t("الرقم", "No.")}: <span dir="ltr">{text(doc.number)}</span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {t("الانتهاء", "Expiry")}: {formatDate(doc.expiry)}
                      </p>
                      <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                      {doc.fileUrl ? (
                        <a className="block text-sm font-semibold text-teal-800" href={doc.fileUrl} target="_blank">
                          {t("عرض المرفق", "View file")}
                        </a>
                      ) : allow.edit ? (
                        <Link className="block text-xs text-slate-500 hover:text-teal-800" href={`${base}/edit`}>
                          {t("لا يوجد مرفق — أرفقه من تعديل البيانات", "No file — attach it from Edit")}
                        </Link>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
              <Card>
                <SectionTitle>{t("مستندات إضافية", "Additional documents")}</SectionTitle>
                {employee.documents.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد مستندات مرفوعة.", "No documents uploaded.")}</p> : null}
                <div className="space-y-2">
                  {employee.documents.map((document) => {
                    const status = describeExpiry(document.expiryDate, limits, lang);
                    return (
                      <div key={document.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold">{pick(DOC_LABEL[document.type], lang, document.type)}</p>
                          <p className="text-xs text-slate-500">
                            <span dir="ltr">{text(document.documentNo)}</span> · {formatDate(document.expiryDate)}
                            {document.fileUrl ? (
                              <>
                                {" · "}
                                <a className="font-semibold text-teal-800" href={document.fileUrl} target="_blank">
                                  {t("عرض الملف", "View file")}
                                </a>
                              </>
                            ) : null}
                          </p>
                          {document.notes ? (
                            <p className="mt-1 text-xs text-slate-500">
                              <Tr text={document.notes} />
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-start justify-between gap-3 sm:justify-end">
                          {document.submittedAt && !document.reviewedAt ? (
                            <Link href="/approvals#documents">
                              <ToneBadge tone="amber">{t("من البوابة — بانتظار المراجعة", "From portal — awaiting review")}</ToneBadge>
                            </Link>
                          ) : (
                            <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                          )}
                          {allow.docEdit ? <DocumentEditForm action={updateDocument} returnTo={`${base}?tab=docs`} document={document} /> : null}
                          {allow.docDelete ? (
                            <DeleteButton
                              action={deleteDocument}
                              fields={{ id: document.id, returnTo: `${base}?tab=docs` }}
                              confirm={t("حذف هذا المستند وملفه المرفق؟", "Delete this document and its file?")}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {allow.docAdd ? (
              <Card>
                <SectionTitle>{t("إضافة مستند", "Add a document")}</SectionTitle>
                <form action={addDocument} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <input type="hidden" name="returnTo" value={`${base}?tab=docs`} />
                  <div className="sm:col-span-2">
                    <DocumentScan mode="document" />
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("النوع", "Type")}</span>
                    <select className={`${fieldClass} w-full`} name="type" defaultValue="DRIVING_LICENSE">
                      {EXTRA_DOC_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {pick(DOC_LABEL[type], lang, type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("رقم المستند", "Document number")}</span>
                    <input className={`${fieldClass} w-full`} name="documentNo" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("تاريخ الانتهاء", "Expiry date")}</span>
                    <input className={`${fieldClass} w-full`} type="date" name="expiryDate" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("الملف (PDF أو صورة)", "File (PDF or image)")}</span>
                    <input className={`${fieldClass} w-full`} type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-slate-600">{t("ملاحظة", "Note")}</span>
                    <input className={`${fieldClass} w-full`} name="notes" />
                  </label>
                  <div className="sm:col-span-2">
                    <SubmitButton>{t("إضافة مستند", "Add document")}</SubmitButton>
                  </div>
                </form>
              </Card>
              ) : null}
            </>
          ) : null}

          {tab === "attendance" ? (
            <>
              {allow.attAdd ? (
                <Card>
                  <SectionTitle>{t("تسجيل غياب أو إجازة", "Record absence or leave")}</SectionTitle>
                  <LeaveRangeForm
                    action={markAttendance}
                    employees={[{ id: employee.id, fullName: displayName }]}
                    balances={balanceMap}
                    choices={choices}
                    returnTo={`${base}?tab=attendance`}
                    defaultType="ABSENT"
                    warnDays={warnDays}
                  />
                </Card>
              ) : null}
              <Card>
                <SectionTitle>{t("السجل", "History")}</SectionTitle>
                {periods.length === 0 ? <p className="text-sm text-slate-500">{t("لا توجد سجلات.", "No records.")}</p> : null}
                <div className="space-y-2 md:hidden">
                  {periods.map((period) => (
                    <div key={period.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{attendanceLabel(period.row, leaveTypes, lang)}</p>
                        <ToneBadge tone={period.row.deductsSalary ? "red" : "slate"}>
                          {period.row.deductsSalary ? t("خصم راتب", "Deducted") : t("بدون خصم", "No deduction")}
                        </ToneBadge>
                      </div>
                      <p className="mt-1 text-slate-600">
                        {formatDate(period.start)} — {formatDate(period.end)} · {daysLabel(period.days)} {t("يوم", "day(s)")}
                      </p>
                      {period.row.notes ? <p className="mt-1 text-xs text-slate-500">{period.row.notes}</p> : null}
                      <div className="mt-2">{periodActions(period)}</div>
                    </div>
                  ))}
                </div>
                {periods.length ? (
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="py-2 text-start font-semibold">{t("من", "From")}</th>
                          <th className="py-2 text-start font-semibold">{t("إلى", "To")}</th>
                          <th className="py-2 text-start font-semibold">{t("الأيام", "Days")}</th>
                          <th className="py-2 text-start font-semibold">{t("النوع", "Type")}</th>
                          <th className="py-2 text-start font-semibold">{t("خصم الراتب", "Salary deduction")}</th>
                          <th className="py-2 text-start font-semibold">{t("ملاحظة", "Note")}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((period) => (
                          <tr key={period.id} className="border-t border-slate-100">
                            <td className="py-2.5">{formatDate(period.start)}</td>
                            <td>{formatDate(period.end)}</td>
                            <td>{daysLabel(period.days)}</td>
                            <td>{attendanceLabel(period.row, leaveTypes, lang)}</td>
                            <td>
                              <ToneBadge tone={period.row.deductsSalary ? "red" : "slate"}>
                                {period.row.deductsSalary ? t("نعم", "Yes") : t("لا", "No")}
                              </ToneBadge>
                            </td>
                            <td className="max-w-48 truncate">{text(period.row.notes)}</td>
                            <td className="text-end">{periodActions(period)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>
              {employee.clockEntries.length ? (
                <Card>
                  <SectionTitle hint={t("من بوابة الموظف، آخر 31 يوماً مسجّلاً", "From the employee portal, last 31 recorded days")}>{t("سجل الدوام", "Clock-in log")}</SectionTitle>
                  <div className="table-shell">
                    <table className="table-stack min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className="px-4 py-2.5 text-start">{t("اليوم", "Day")}</th>
                          <th className="px-4 py-2.5 text-start">{t("الحضور", "In")}</th>
                          <th className="px-4 py-2.5 text-start">{t("الانصراف", "Out")}</th>
                          <th className="px-4 py-2.5 text-start">{t("المدة", "Hours")}</th>
                          <th className="px-4 py-2.5 text-start">{t("التأخير", "Late")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employee.clockEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="cell-title px-4 py-2.5 font-medium">{formatDate(new Date(`${entry.day}T12:00:00Z`))}</td>
                            <td className="tabular px-4 py-2.5" data-label={t("الحضور", "In")}>
                              {muscatTime(entry.inAt)}
                            </td>
                            <td className="tabular px-4 py-2.5" data-label={t("الانصراف", "Out")}>
                              {muscatTime(entry.outAt)}
                            </td>
                            <td className="tabular px-4 py-2.5" data-label={t("المدة", "Hours")}>
                              {workedLabel(entry.inAt, entry.outAt)}
                            </td>
                            <td className="px-4 py-2.5" data-label={t("التأخير", "Late")}>
                              {entry.lateMinutes ? <ToneBadge tone="amber">{t(`${entry.lateMinutes} د`, `${entry.lateMinutes} min`)}</ToneBadge> : <span className="text-slate-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === "salaries" ? (
            <>
              <Card>
                <SectionTitle>{t("رواتب الموظف", "Employee salaries")}</SectionTitle>
                {employee.salaries.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {t("لم يُنشأ أي راتب لهذا الموظف بعد. أنشئ رواتب الشهر من صفحة الرواتب.", "No salaries yet. Generate the month's payroll from the Payroll page.")}
                  </p>
                ) : null}
                {can(user, "salaries.create") ? (
                  <form action={createSalary} className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <label className="space-y-1 text-xs">
                      <span className="text-slate-600">{t("الشهر", "Month")}</span>
                      <select className={`${fieldClass} block`} name="month" defaultValue={new Date().getMonth() + 1}>
                        {Array.from({ length: 12 }, (_, index) => (
                          <option key={index} value={index + 1}>
                            {monthName(index + 1, lang)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-slate-600">{t("السنة", "Year")}</span>
                      <input className={`${fieldClass} block w-24`} type="number" name="year" min="2000" max="2100" defaultValue={new Date().getFullYear()} />
                    </label>
                    <SubmitButton variant="secondary">{t("+ إضافة راتب لهذا الشهر", "+ Add salary for this month")}</SubmitButton>
                  </form>
                ) : null}
                <div className="space-y-2 md:hidden">
                  {employee.salaries.map((salary) => (
                    <div key={salary.id} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">
                          {monthName(salary.month, lang)} {salary.year}
                        </p>
                        <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                      </div>
                      <p className="mt-1 text-lg font-bold text-slate-900">{money(salary.netSalary, currency)}</p>
                      <div className="mt-2">{salaryActions(salary)}</div>
                    </div>
                  ))}
                </div>
                {employee.salaries.length ? (
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="py-2 text-start font-semibold">{t("الشهر", "Month")}</th>
                          <th className="py-2 text-start font-semibold">{t("الإجمالي", "Gross")}</th>
                          <th className="py-2 text-start font-semibold">{t("الخصم", "Deductions")}</th>
                          <th className="py-2 text-start font-semibold">{t("الصافي", "Net")}</th>
                          <th className="py-2 text-start font-semibold">{t("الحالة", "Status")}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {employee.salaries.map((salary) => (
                          <tr key={salary.id} className="border-t border-slate-100">
                            <td className="py-3 font-medium">
                              {monthName(salary.month, lang)} {salary.year}
                            </td>
                            <td className="whitespace-nowrap">{money(totalEarnings(salary), currency)}</td>
                            <td className="whitespace-nowrap">{money(totalDeductions(salary), currency)}</td>
                            <td className="whitespace-nowrap font-semibold">{money(salary.netSalary, currency)}</td>
                            <td>
                              <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
                            </td>
                            <td>{salaryActions(salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>
              <Card>
                <div id="statement" className="scroll-mt-24" />
                <SectionTitle>{t("طباعة كشف رواتب الموظف", "Print employee salary statement")}</SectionTitle>
                <form action={`${base}/statement`} method="get" target="_blank" className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input type="radio" name="mode" value="contract" defaultChecked />
                      {t("مدة العقد", "Contract period")}
                    </label>
                    <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input type="radio" name="mode" value="custom" />
                      {t("بين تاريخين", "Between two dates")}
                    </label>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("من تاريخ", "From")}</span>
                    <input className={`${fieldClass} w-full`} type="date" name="from" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">{t("إلى تاريخ", "To")}</span>
                    <input className={`${fieldClass} w-full`} type="date" name="to" />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-slate-600">{t("المرفقات", "Attachments")}</span>
                    <select className={`${fieldClass} w-full`} name="docs" defaultValue="slips">
                      <option value="none">{t("الكشف فقط", "Statement only")}</option>
                      <option value="slips">{t("الكشف + قسيمة كل راتب", "Statement + payslip for each salary")}</option>
                      <option value="receipts">{t("الكشف + إيصال استلام كل راتب", "Statement + receipt for each salary")}</option>
                      <option value="both">{t("الكشف + القسيمة + الإيصال", "Statement + payslips + receipts")}</option>
                    </select>
                  </label>
                  <button className={`${primaryBtn} sm:col-span-2`}>{t("طباعة الكشف", "Print statement")}</button>
                </form>
              </Card>
            </>
          ) : null}

          {tab === "pay" ? (
            <>
              {can(user, "salaries.create") ? (
                <Card>
                  <SectionTitle>{t("إضافة سلفة أو مكافأة أو خصم", "Add an advance, bonus or deduction")}</SectionTitle>
                  <PayItemForm action={savePayItem} returnTo={`${base}?tab=pay`} employeeId={employee.id} today={todayInputValue()} defaultStart={defaultStart} currency={currency} />
                </Card>
              ) : null}
              <Card>
                <SectionTitle
                  action={
                    outstanding > 0 ? (
                      <ToneBadge tone="amber">{t(`متبقي السلف ${money(outstanding, currency)}`, `Advances outstanding ${money(outstanding, currency)}`)}</ToneBadge>
                    ) : null
                  }
                >
                  {t("السلف والمكافآت والخصومات", "Advances, bonuses & deductions")}
                </SectionTitle>
                <PayItemsList
                  items={payItems}
                  lang={lang}
                  currency={currency}
                  nowKey={nowKey}
                  returnTo={`${base}?tab=pay`}
                  allow={{ edit: can(user, "salaries.edit"), remove: can(user, "salaries.delete") }}
                  showEmployee={false}
                  today={todayInputValue()}
                  defaultStart={defaultStart}
                />
              </Card>
            </>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <AccountCard
            user={user}
            kind="employee"
            personId={employee.id}
            person={{ name: employee.fullName, email: employee.email, phone: employee.phone, active: employee.status !== "TERMINATED" }}
            hasReports={employee.reports.length > 0}
          />
          {allow.edit ? (
            <Card id="portal" className="scroll-mt-24">
              <SectionTitle
                action={
                  employee._count.leaveRequests ? (
                    <Link href="/approvals#leave">
                      <ToneBadge tone="amber">{t(`${employee._count.leaveRequests} طلب معلّق`, `${employee._count.leaveRequests} pending`)}</ToneBadge>
                    </Link>
                  ) : null
                }
              >
                {t("بوابة الموظف", "Employee portal")}
              </SectionTitle>
              <p className="mb-3 text-xs leading-5 text-slate-600">
                {t(
                  "رابط شخصي بلا كلمة مرور يفتح به الموظف صفحته: طلب الإجازات ومتابعتها، رصيده، قسائم رواتبه، مستنداته وإرسال المحدّث منها، خطاباته، وتسجيل الحضور إن كان مفعّلاً.",
                  "A personal, password-free link to the employee's own page: leave requests and balances, payslips, documents (and sending renewed ones), letters, and clock-in when enabled.",
                )}
              </p>
              {portalLink ? (
                <div className="space-y-3">
                  <ShareLetter
                    url={portalLink}
                    subject={t("رابط صفحتك في نظام الموارد البشرية", "Your HR portal link")}
                    message={t(
                      `مرحباً ${employee.fullName}،\nهذا رابط صفحتك في نظام الموارد البشرية لدى ${companyName}:\n${portalLink}\nاحتفظ به ولا تشاركه مع أحد.`,
                      `Hello ${employee.nameEn || employee.fullName},\nThis is your HR portal link at ${companyName}:\n${portalLink}\nKeep it private.`,
                    )}
                    phone={employee.phone}
                    email={employee.email}
                    openLabel={t("فتح البوابة", "Open portal")}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <form action={renewPortalLink}>
                      <input type="hidden" name="employeeId" value={employee.id} />
                      <SubmitButton variant="secondary" confirm={t("سيتوقف الرابط الحالي ويُنشأ رابط جديد. متابعة؟", "The current link will stop working and a new one is created. Continue?")}>
                        {t("رابط جديد", "New link")}
                      </SubmitButton>
                    </form>
                    <form action={disablePortalLink}>
                      <input type="hidden" name="employeeId" value={employee.id} />
                      <SubmitButton variant="link" confirm={t("إيقاف رابط البوابة؟ لن يفتح بعد الآن.", "Turn off the portal link? It will stop opening.")}>
                        {t("إيقاف البوابة", "Turn off")}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ) : (
                <form action={renewPortalLink}>
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <SubmitButton className="w-full">{t("إنشاء رابط البوابة", "Create portal link")}</SubmitButton>
                </form>
              )}
            </Card>
          ) : null}
          <Card id="profile-prints" className="scroll-mt-24">
            <SectionTitle>{t("الملف الشخصي والمطبوعات", "Profile and prints")}</SectionTitle>
            <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-600">{t("اكتمال السيرة الذاتية", "CV completeness")}</span>
                <span className="tabular font-bold text-teal-800">{cvProgress.score}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${cvProgress.score}%` }} />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                {employee.cvUpdatedAt
                  ? t(`آخر تحديث ${formatDate(employee.cvUpdatedAt)}. يعدّلها الموظف من بوابته أيضاً.`, `Updated ${formatDate(employee.cvUpdatedAt)}. The employee can edit it from the portal too.`)
                  : t("لم تُعبأ بعد. يعبّئها الموظف من بوابته أو تعبّئها أنت.", "Not filled yet. The employee fills it from the portal, or you can.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: `${base}/profile`, Icon: Printer, label: t("الملف الكامل (سيرة ذاتية)", "Full profile (CV)") },
                allow.edit ? { href: `${base}/cv`, Icon: FileUser, label: t("تعديل السيرة الذاتية", "Edit CV") } : null,
                { href: `${base}/job-description`, Icon: ClipboardList, label: t("بطاقة الوصف الوظيفي", "Job description"), ai: true },
                { href: `${base}/business-card`, Icon: Contact, label: t("بطاقة العمل", "Business card") },
                { href: `${base}/passport-sticker`, Icon: BookUser, label: t("ملصق الجواز (بياناته ومستنداته)", "Passport sticker (details and documents)") },
              ]
                .filter((item): item is { href: string; Icon: typeof Printer; label: string; ai?: boolean } => Boolean(item))
                .map(({ href, Icon, label, ai }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                  >
                    <Icon size={17} className="shrink-0 text-teal-700" />
                    <span className="min-w-0">
                      {label}
                      {ai ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <Sparkles size={11} />
                          {t("بالذكاء الاصطناعي", "AI-assisted")}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
            </div>
          </Card>
          <Card id="badge" className="scroll-mt-24">
            <SectionTitle>{t("بطاقة الموظف", "Employee ID card")}</SectionTitle>
            <p className="mb-3 text-xs leading-5 text-slate-600">
              {t(
                "رمز QR خاص بالموظف. مسحه بكاميرا أي هاتف يفتح صفحة تحقق تُظهر صورته واسمه ومسماه الوظيفي وجهة عمله فقط، دون أي بيانات شخصية أخرى.",
                "The employee's own QR code. Scanning it with any phone camera opens a check page showing only the photo, name, job title and workplace, with no other personal data.",
              )}
            </p>
            <div className="flex items-center gap-4">
              <div className="size-32 shrink-0 rounded-2xl bg-white p-1.5 ring-1 ring-slate-200 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: badgeSvg }} />
              <div className="flex min-w-0 flex-col items-start gap-2">
                <Link href={`${base}/badge`} className={secondaryBtn}>
                  <Printer size={16} />
                  {t("طباعة البطاقة", "Print card")}
                </Link>
                <a href={badgeLink} target="_blank" rel="noreferrer" className={linkAction}>
                  <ExternalLink size={15} />
                  {t("فتح صفحة التحقق", "Open check page")}
                </a>
              </div>
            </div>
            {allow.edit && !employee.photoUrl ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-inset ring-amber-100">
                {t("لا توجد صورة للموظف بعد. أضفها من «تعديل البيانات» لتظهر في البطاقة وصفحة التحقق.", "No photo yet. Add one from “Edit” so it shows on the card and the check page.")}
              </p>
            ) : null}
            {allow.edit ? (
              <form action={renewBadgeToken} className="mt-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="id" value={employee.id} />
                <SubmitButton
                  variant="link"
                  className="inline-flex items-center gap-1.5"
                  confirm={t("سيتوقف رمز البطاقة الحالية عن العمل ويلزم طباعة بطاقة جديدة. متابعة؟", "The current card's code will stop working and a new card must be printed. Continue?")}
                >
                  <RefreshCw size={15} />
                  {t("رمز جديد (إلغاء بطاقة مفقودة)", "New code (cancel a lost card)")}
                </SubmitButton>
              </form>
            ) : null}
          </Card>
          <Card>
            <SectionTitle>{t("مستندات الموارد البشرية", "HR documents")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {HR_DOC_TYPES.filter((type) => !HR_DOC_NEEDS_SALARY[type] || allow.salaries).map((type) => (
                <Link key={type} href={`${base}/hr-doc?type=${type}`} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800">
                  {pick(HR_DOC_LABEL[type], lang)}
                </Link>
              ))}
            </div>
            {allow.letterAdd ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <BadgeCheck size={14} className="text-emerald-600" />
                  {t("إصدار رسمي موقّع إلكترونياً مع QR:", "Official e-signed issue with QR:")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {(["SALARY_CERTIFICATE", "EMPLOYMENT_CERTIFICATE", "EXPERIENCE_CERTIFICATE", "SALARY_TRANSFER", "NOC"] as const)
                    .filter((kind) => !LETTER_KIND[kind].salary || allow.salaries)
                    .map((kind) => (
                      <Link key={kind} href={`/letters/new?employeeId=${employee.id}&kind=${kind}`} className="font-semibold text-teal-800 underline-offset-4 hover:underline">
                        {pick(LETTER_KIND[kind].label, lang)}
                      </Link>
                    ))}
                </div>
              </div>
            ) : null}
            {allow.salaries ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-inset ring-slate-100">
                {accrued.eligible
                  ? t(
                      `مكافأة نهاية الخدمة المستحقة حتى اليوم: ${money(accrued.amount, currency)} (${accrued.months} شهر من الأجر الأساسي).`,
                      `End-of-service gratuity accrued to date: ${money(accrued.amount, currency)} (${accrued.months} month(s) of basic pay).`,
                    )
                  : accrued.reason === "OMANI"
                    ? t("عماني: مشمول بصندوق الحماية الاجتماعية، لا مكافأة نهاية خدمة على صاحب العمل.", "Omani: covered by the Social Protection Fund; no employer gratuity.")
                    : t("أدخل تاريخ الالتحاق لحساب مكافأة نهاية الخدمة.", "Enter the joining date to calculate the gratuity.")}
              </p>
            ) : null}
          </Card>
          {allow.salaries ? (
          <Card>
            <SectionTitle>{t("الراتب الشهري", "Monthly salary")}</SectionTitle>
            <dl className="space-y-2 text-sm">
              {[
                [t("الأساسي", "Basic"), employee.basicSalary],
                [t("بدل السكن", "Housing"), employee.housingAllowance],
                [t("بدل النقل", "Transport"), employee.transportAllowance],
                [t("بدلات أخرى", "Other"), employee.otherAllowance],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-2">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="whitespace-nowrap">{money(Number(value), currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 font-bold text-teal-900">
                <dt>{t("الإجمالي", "Gross")}</dt>
                <dd className="whitespace-nowrap">{money(gross, currency)}</dd>
              </div>
            </dl>
            {employee.allowances.length ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="mb-2 text-sm font-bold text-slate-900">{t("العلاوات", "Allowances")}</h3>
                <ul className="space-y-2 text-sm">
                  {employee.allowances.map((allowance) => (
                    <li key={allowance.id} className={cn(!allowance.active && "opacity-60")}>
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-slate-800">{termText(allowance.allowanceType.nameAr, allowance.allowanceType.nameEn, lang)}</span>
                        <span className="whitespace-nowrap">{money(allowanceAmount(allowance, employee), currency)}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {describeAllowance(allowance, lang, currency)}
                        {allowance.active ? "" : t(" — موقوفة", " — stopped")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-slate-500">{t("راتب كل شهر يُحفظ وحده عند إنشاء المسير.", "Each month's salary is saved separately when payroll is generated.")}</p>
          </Card>
          ) : null}

          {allow.attendance ? (
          <Card>
            <SectionTitle>{t("أرصدة الإجازة", "Leave balances")}</SectionTitle>
            <div className="space-y-3">
              {balances.map((figure) => {
                const key = figure.key;
                const total = figure.entitlement + figure.added;
                const percent = total > 0 ? Math.max(0, Math.min(100, (figure.remaining / total) * 100)) : 0;
                const warned = warnedKeys.has(key);
                return (
                  <div key={key} className={cn(warned && "rounded-xl bg-red-50 p-2 ring-1 ring-red-200")}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className={cn("font-medium", warned ? "text-red-800" : "text-slate-800")}>{leaveName(figure, lang)}</span>
                      <span className={cn("whitespace-nowrap font-bold", warned ? "text-red-700" : "text-slate-900")}>
                        {daysLabel(figure.remaining)}
                        <span className="text-xs font-normal text-slate-500"> / {daysLabel(total)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full", warned ? "bg-red-500" : "bg-teal-600")} style={{ width: `${figure.remaining < 0 ? 100 : percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {figure.cycle === "ONCE"
                        ? t(
                            `مستحق ${daysLabel(figure.entitlement)} + إضافي ${daysLabel(figure.added)} − مستخدم ${daysLabel(figure.used)}`,
                            `Entitled ${daysLabel(figure.entitlement)} + extra ${daysLabel(figure.added)} − used ${daysLabel(figure.used)}`,
                          )
                        : t(
                            `مُرحّل ${daysLabel(figure.carried ?? 0)} + مكتسب هذه السنة ${daysLabel(figure.earned ?? 0)} + إضافي ${daysLabel(figure.added)} − مستخدم هذه السنة ${daysLabel(figure.used)}`,
                            `Carried ${daysLabel(figure.carried ?? 0)} + earned this year ${daysLabel(figure.earned ?? 0)} + extra ${daysLabel(figure.added)} − used this year ${daysLabel(figure.used)}`,
                          )}
                      {figure.forfeited ? (
                        <span className="block text-amber-700">
                          {t(`سقط ${daysLabel(figure.forfeited)} لتجاوز حد الترحيل في سنوات سابقة`, `${daysLabel(figure.forfeited)} lost to the carry-over limit in past years`)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                );
              })}
            </div>
            {allow.attEdit ? (
            <details className="group mt-4 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer list-none text-sm font-bold text-teal-800">
                <span className="group-open:hidden">+ </span>
                <span className="hidden group-open:inline">− </span>
                {t("إضافة أيام إضافية للرصيد", "Add extra days to a balance")}
              </summary>
              <form action={addLeaveCredit} className="mt-3 space-y-2">
                <input type="hidden" name="employeeId" value={employee.id} />
                <input type="hidden" name="returnTo" value={`${base}?tab=attendance`} />
                <select className={`${fieldClass} w-full`} name="balanceKey" defaultValue={balances.some((item) => item.key === "compensatory") ? "compensatory" : balances[0]?.key}>
                  {balances.map((figure) => (
                    <option key={figure.key} value={figure.key}>
                      {leaveName(figure, lang)}
                    </option>
                  ))}
                </select>
                <input className={`${fieldClass} w-full`} type="number" min="0.5" step="0.5" name="days" placeholder={t("عدد الأيام", "Number of days")} required />
                <input className={`${fieldClass} w-full`} name="reason" placeholder={t("السبب، مثل تعويض أو مكافأة", "Reason, e.g. compensation")} />
                <SubmitButton>{t("إضافة للرصيد", "Add to balance")}</SubmitButton>
              </form>
            </details>
            ) : null}
          </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
