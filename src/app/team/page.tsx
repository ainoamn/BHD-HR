import Link from "next/link";
import { CalendarCheck2, CalendarX2, Check, ChevronLeft, ChevronRight, FileWarning, Inbox, Receipt, Users, X } from "lucide-react";
import { Tr } from "@/components/ai-translate";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { ExpenseClaimCard } from "@/components/expense-claim";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { canTeam } from "@/lib/auth";
import { muscatDay } from "@/lib/clock";
import { termText } from "@/lib/constants";
import { worstExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { getI18n } from "@/lib/lang";
import { attendanceChoices, attendanceLabel, computeLeaveBalances, parseAttendanceChoice, remainingByKey } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/team";
import { daysLabel, formatDate, formatDateTime } from "@/lib/utils";
import { markAttendance } from "@/server/attendance-actions";
import { decideLeaveRequest } from "@/server/request-actions";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { user, scope } = await requireTeam();
  const { lang, t } = await getI18n();
  const allow = {
    attendance: canTeam(user, "team.attendance.view"),
    record: canTeam(user, "team.attendance.create"),
    approve: canTeam(user, "team.leave.approve"),
    docs: canTeam(user, "team.documents.view"),
    expenses: canTeam(user, "team.expenses.approve"),
  };
  const company = user.company;
  const today = new Date(`${muscatDay()}T00:00:00.000Z`);
  const limits = { urgent: company.alertUrgentDays, warning: company.alertWarningDays, early: company.alertEarlyDays };
  const [employees, requests, claims, leaveTypes] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: scope }, companyId: user.companyId },
      select: {
        id: true,
        fullName: true,
        nameEn: true,
        photoUrl: true,
        employeeNumber: true,
        idNumber: true,
        jobTitle: true,
        jobTitleEn: true,
        jobTitleId: true,
        leaveDays: true,
        idExpiry: true,
        passportExpiry: true,
        residenceExpiry: true,
        documents: allow.docs ? { select: { expiryDate: true } } : false,
        attendance: allow.attendance ? { select: { type: true, balanceKey: true, date: true } } : false,
        leaveCredits: allow.attendance ? { select: { balanceKey: true, days: true } } : false,
      },
      orderBy: { fullName: "asc" },
    }),
    allow.approve
      ? prisma.leaveRequest.findMany({
          where: { companyId: user.companyId, employeeId: { in: scope }, status: "PENDING" },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
          orderBy: { fromDate: "asc" },
        })
      : [],
    allow.expenses
      ? prisma.expenseClaim.findMany({
          where: { companyId: user.companyId, employeeId: { in: scope }, status: "PENDING" },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    getLeaveTypes(user.companyId),
  ]);
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const balancesOf = (employee: (typeof employees)[number]) =>
    allow.attendance ? computeLeaveBalances(employee, employee.attendance ?? [], employee.leaveCredits ?? [], leaveTypes) : [];
  const rows = employees.map((employee) => {
    const todayRow = allow.attendance ? (employee.attendance ?? []).find((row) => +row.date === +today) : undefined;
    const docs = allow.docs ? worstExpiry([employee.idExpiry, employee.passportExpiry, employee.residenceExpiry, ...(employee.documents ?? []).map((doc) => doc.expiryDate)], limits, lang) : null;
    return { employee, todayRow, docs, balances: balancesOf(employee) };
  });
  const outToday = rows.filter((row) => row.todayRow).length;
  const expiring = rows.filter((row) => row.docs && ["expired", "today", "urgent", "warning"].includes(row.docs.key)).length;
  const requestLabel = (choice: string) =>
    attendanceLabel({ type: choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: choice === "UNPAID_LEAVE" ? null : choice.slice(6) }, leaveTypes, lang);
  const Chevron = lang === "en" ? ChevronRight : ChevronLeft;
  const employer = user.role === "EMPLOYER";
  const stats = [
    { label: employer ? t("العمّال", "Workers") : t("أعضاء الفريق", "Team members"), value: employees.length, icon: Users, show: true },
    { label: t("غائبون أو في إجازة اليوم", "Away today"), value: outToday, icon: CalendarX2, show: allow.attendance },
    { label: t("بانتظار قرارك", "Awaiting you"), value: requests.length + claims.length, icon: Inbox, show: allow.approve || allow.expenses },
    { label: t("وثائق تنتهي قريباً", "Documents expiring"), value: expiring, icon: FileWarning, show: allow.docs },
  ].filter((item) => item.show);

  return (
    <div className="space-y-5">
      <Flash error={sp.error} message={sp.message} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
              <stat.icon size={19} />
            </span>
            <div className="min-w-0">
              <p className="tabular text-xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs leading-5 text-slate-500">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {allow.approve ? (
        <Card id="leave">
          <SectionTitle hint={t(`${requests.length} بانتظار القرار`, `${requests.length} awaiting a decision`)}>{t("طلبات الإجازة", "Leave requests")}</SectionTitle>
          {requests.length === 0 ? <EmptyState icon={CalendarCheck2} title={t("لا طلبات معلّقة", "No pending requests")} text={t("تظهر هنا طلبات الإجازة التي يرسلها فريقك من بوابتهم.", "Leave your team asks for from their portal appears here.")} /> : null}
          <ul className="space-y-3">
            {requests.map((request) => {
              const row = rows.find((item) => item.employee.id === request.employeeId);
              const choice = parseAttendanceChoice(request.choice, leaveTypes);
              const balance = choice?.balanceKey ? row?.balances.find((item) => item.key === choice.balanceKey) : null;
              const short = balance ? balance.remaining < request.days : false;
              return (
                <li key={request.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/team/${request.employeeId}`} className="font-bold text-slate-900 hover:text-teal-700">
                        {nameOf(request.employee)}
                      </Link>
                      <p className="mt-0.5 text-sm text-slate-600">
                        <ToneBadge tone="teal">{requestLabel(request.choice)}</ToneBadge> {formatDate(request.fromDate)} — {formatDate(request.toDate)} · {daysLabel(request.days)} {t("يوم", "day(s)")}
                      </p>
                      {request.reason ? (
                        <p className="mt-1 text-sm text-slate-600">
                          <Tr text={request.reason} />
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">
                        {t("أُرسل", "Sent")} {formatDateTime(request.createdAt)}
                      </p>
                    </div>
                    {balance ? (
                      <span className={`rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${short ? "bg-red-50 text-red-800 ring-red-100" : "bg-slate-50 text-slate-700 ring-slate-100"}`}>
                        {t(`الرصيد المتبقي ${daysLabel(balance.remaining)} يوم`, `${daysLabel(balance.remaining)} day(s) left`)}
                      </span>
                    ) : null}
                  </div>
                  <form action={decideLeaveRequest} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="returnTo" value="/team#leave" />
                    <label className="block min-w-0 space-y-1 text-xs text-slate-500">
                      <span>{t("ملاحظة للموظف (اختياري)", "Note to the employee (optional)")}</span>
                      <input className={`${fieldClass} w-full`} name="note" maxLength={300} />
                    </label>
                    <SubmitButton name="decision" value="approve" pendingLabel={t("جارٍ الحفظ...", "Saving...")}>
                      <Check size={16} />
                      {t("موافقة", "Approve")}
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="danger" confirm={t("رفض هذا الطلب؟", "Reject this request?")}>
                      <X size={16} />
                      {t("رفض", "Reject")}
                    </SubmitButton>
                    {short ? (
                      <label className="flex items-center gap-2 text-xs font-semibold text-red-700 sm:col-span-3">
                        <input type="checkbox" name="allowOverdraft" value="1" className="size-4 accent-red-700" />
                        {t("الموافقة رغم تجاوز الرصيد", "Approve over the balance")}
                      </label>
                    ) : null}
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {allow.expenses ? (
        <Card id="expenses">
          <SectionTitle hint={t(`${claims.length} بانتظار الاعتماد`, `${claims.length} awaiting approval`)}>{t("طلبات تعويض المصروفات", "Expense claims")}</SectionTitle>
          {claims.length === 0 ? <EmptyState icon={Receipt} title={t("لا طلبات معلّقة", "No pending claims")} text={t("تظهر هنا طلبات التعويض التي يرسلها فريقك مع الإيصالات.", "Claims your team sends with receipts appear here.")} /> : null}
          <ul className="space-y-3">
            {claims.map((claim) => (
              <ExpenseClaimCard
                key={claim.id}
                claim={claim}
                lang={lang}
                currency={company.currency}
                allow={{ decide: true, pay: false, salaryPay: false, remove: false }}
                returnTo="/team#expenses"
                employeeBase="/team/"
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {allow.record && employees.length ? (
        <Card id="record">
          <SectionTitle hint={t("يُخصم من رصيد الإجازة حسب النوع", "Uses the leave balance for the chosen type")}>{t("تسجيل غياب أو إجازة", "Record an absence or leave")}</SectionTitle>
          <LeaveRangeForm
            action={markAttendance}
            employees={employees.map((employee) => ({
              id: employee.id,
              fullName: nameOf(employee),
              employeeNumber: employee.employeeNumber,
              idNumber: employee.idNumber,
            }))}
            balances={Object.fromEntries(rows.map((row) => [row.employee.id, remainingByKey(row.balances)]))}
            choices={attendanceChoices(leaveTypes, lang)}
            returnTo="/team#record"
            warnDays={company.leaveWarningDays}
          />
        </Card>
      ) : null}

      <Card id="people">
        <SectionTitle hint={t(`${employees.length} شخص`, `${employees.length} people`)}>{employer ? t("العمّال المكفولون", "Sponsored workers") : t("فريقك", "Your team")}</SectionTitle>
        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={employer ? t("لا عمّال مرتبطون بك بعد", "No workers linked to you yet") : t("لا يتبعك أحد بعد", "Nobody reports to you yet")}
            text={
              employer
                ? t("تربط الموارد البشرية كل عامل بكفيله من ملفه.", "HR links each worker to their sponsor from the worker's file.")
                : t("تحدد الموارد البشرية المدير المباشر لكل موظف من ملفه.", "HR sets each employee's direct manager from their file.")
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ employee, todayRow, docs }) => (
              <li key={employee.id}>
                <Link
                  href={`/team/${employee.id}`}
                  className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-200 hover:bg-teal-50/40"
                >
                  <EmployeeAvatar name={nameOf(employee)} photo={employee.photoUrl} className="size-11 rounded-xl bg-teal-50 text-base text-teal-800 ring-1 ring-inset ring-teal-100" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{nameOf(employee)}</p>
                    <p className="truncate text-sm text-slate-500">
                      <span className="tabular">{employee.employeeNumber}</span>
                      {termText(employee.jobTitle, employee.jobTitleEn, lang) ? ` · ${termText(employee.jobTitle, employee.jobTitleEn, lang)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {allow.attendance ? (
                        todayRow ? <ToneBadge tone="amber">{attendanceLabel(todayRow, leaveTypes, lang)}</ToneBadge> : <ToneBadge tone="green">{t("على رأس العمل", "At work")}</ToneBadge>
                      ) : null}
                      {docs && docs.key !== "ok" && docs.key !== "none" ? <ToneBadge tone={docs.tone}>{docs.label}</ToneBadge> : null}
                    </div>
                  </div>
                  <Chevron size={18} className="mt-1 shrink-0 text-slate-400 transition group-hover:text-teal-700" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}