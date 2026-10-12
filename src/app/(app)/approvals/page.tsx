import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, Check, FileCheck2, Inbox, Receipt, X } from "lucide-react";
import { ExpenseClaimCard } from "@/components/expense-claim";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { DOC_LABEL } from "@/lib/constants";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { attendanceLabel, computeLeaveBalances, parseAttendanceChoice } from "@/lib/leave";
import { LEAVE_REQUEST_LABEL, LEAVE_REQUEST_TONE } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { daysLabel, formatDate, formatDateTime } from "@/lib/utils";
import { decideLeaveRequest, reviewPortalDocument } from "@/server/request-actions";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const allow = {
    leave: can(user, "attendance.view"),
    decide: can(user, "attendance.create"),
    docs: can(user, "documents.view"),
    review: can(user, "documents.edit"),
    expenses: can(user, "expenses.view"),
  };
  if (!allow.leave && !allow.docs && !allow.expenses) redirect(`/?error=${encodeURIComponent(t("ليست لديك صلاحية لهذه الصفحة", "You cannot open this page"))}`);
  const claimAllow = { decide: can(user, "expenses.edit"), pay: false, salaryPay: false, remove: false };
  const [pending, decided, documents, leaveTypes, claims] = await Promise.all([
    allow.leave
      ? prisma.leaveRequest.findMany({
          where: { companyId: user.companyId, status: "PENDING" },
          include: { employee: { include: { attendance: { select: { type: true, balanceKey: true } }, leaveCredits: { select: { balanceKey: true, days: true } } } } },
          orderBy: { fromDate: "asc" },
        })
      : [],
    allow.leave
      ? prisma.leaveRequest.findMany({
          where: { companyId: user.companyId, status: { not: "PENDING" } },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
          orderBy: { updatedAt: "desc" },
          take: 15,
        })
      : [],
    allow.docs
      ? prisma.employeeDocument.findMany({
          where: { employee: { companyId: user.companyId }, submittedAt: { not: null }, reviewedAt: null },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
          orderBy: { submittedAt: "asc" },
        })
      : [],
    getLeaveTypes(user.companyId),
    allow.expenses
      ? prisma.expenseClaim.findMany({
          where: { companyId: user.companyId, status: "PENDING" },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } } },
          orderBy: { createdAt: "asc" },
          take: 50,
        })
      : [],
  ]);
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const labelOf = (choice: string) =>
    attendanceLabel({ type: choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: choice === "UNPAID_LEAVE" ? null : choice.slice(6) }, leaveTypes, lang);

  return (
    <div className="page-wide">
      <PageHeader
        icon={Inbox}
        title={t("طلبات الموظفين", "Employee requests")}
        description={t(
          "طلبات الإجازة والمستندات وتعويض المصروفات التي أرسلها الموظفون من بوابتهم. الموافقة على الإجازة تسجّلها في الحضور وتخصمها من الرصيد.",
          "Leave requests, documents and expense claims employees sent from their portal. Approving leave records it in attendance and uses the balance.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      {allow.leave ? (
        <Card className="mb-5" id="leave">
          <SectionTitle hint={t(`${pending.length} بانتظار القرار`, `${pending.length} awaiting a decision`)}>{t("طلبات الإجازة", "Leave requests")}</SectionTitle>
          {pending.length === 0 ? <EmptyState icon={CalendarCheck2} title={t("لا طلبات معلّقة", "No pending requests")} text={t("تظهر هنا طلبات الإجازة الجديدة.", "New leave requests appear here.")} /> : null}
          <ul className="space-y-3">
            {pending.map((request) => {
              const choice = parseAttendanceChoice(request.choice, leaveTypes);
              const balance = choice?.balanceKey
                ? computeLeaveBalances(request.employee, request.employee.attendance, request.employee.leaveCredits, leaveTypes).find((item) => item.key === choice.balanceKey)
                : null;
              const short = balance ? balance.remaining < request.days : false;
              return (
                <li key={request.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/employees/${request.employeeId}?tab=attendance`} className="font-bold text-slate-900 hover:text-teal-700">
                        {nameOf(request.employee)}
                      </Link>
                      <p className="mt-0.5 text-sm text-slate-600">
                        <ToneBadge tone="teal">{labelOf(request.choice)}</ToneBadge>{" "}
                        {formatDate(request.fromDate)} — {formatDate(request.toDate)} · {daysLabel(request.days)} {t("يوم", "day(s)")}
                      </p>
                      {request.reason ? <p className="mt-1 text-sm text-slate-600">{request.reason}</p> : null}
                      <p className="mt-1 text-xs text-slate-400">{t("أُرسل", "Sent")} {formatDateTime(request.createdAt)}</p>
                    </div>
                    {balance ? (
                      <span className={`rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${short ? "bg-red-50 text-red-800 ring-red-100" : "bg-slate-50 text-slate-700 ring-slate-100"}`}>
                        {t(`الرصيد المتبقي ${daysLabel(balance.remaining)} يوم`, `${daysLabel(balance.remaining)} day(s) left`)}
                      </span>
                    ) : null}
                  </div>
                  {allow.decide ? (
                    <form action={decideLeaveRequest} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                      <input type="hidden" name="id" value={request.id} />
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
                  ) : null}
                </li>
              );
            })}
          </ul>
          {decided.length ? (
            <details className="group mt-5 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer list-none text-sm font-bold text-teal-800">{t("آخر القرارات", "Recent decisions")}</summary>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {decided.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{nameOf(request.employee)}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {labelOf(request.choice)} · {formatDate(request.fromDate)} — {formatDate(request.toDate)}
                        {request.decidedByName ? ` · ${request.decidedByName}` : ""}
                      </span>
                    </span>
                    <ToneBadge tone={LEAVE_REQUEST_TONE[request.status] || "slate"}>{pick(LEAVE_REQUEST_LABEL[request.status], lang, request.status)}</ToneBadge>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {allow.docs ? (
        <Card id="documents">
          <SectionTitle hint={t(`${documents.length} بانتظار المراجعة`, `${documents.length} awaiting review`)}>{t("مستندات من البوابة", "Documents from the portal")}</SectionTitle>
          {documents.length === 0 ? <EmptyState icon={FileCheck2} title={t("لا مستندات بانتظار المراجعة", "Nothing to review")} text={t("المستندات التي يرسلها الموظفون تظهر هنا قبل إضافتها لملفاتهم.", "Documents employees send appear here before they join their file.")} /> : null}
          <ul className="space-y-3">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <Link href={`/employees/${document.employee.id}?tab=docs`} className="font-bold text-slate-900 hover:text-teal-700">
                    {nameOf(document.employee)}
                  </Link>
                  <p className="mt-0.5 text-slate-600">
                    {pick(DOC_LABEL[document.type], lang, document.type)} · <span dir="ltr">{document.documentNo || "—"}</span> · {t("ينتهي", "expires")} {formatDate(document.expiryDate)}
                  </p>
                  {document.notes ? <p className="mt-0.5 text-xs text-slate-500">{document.notes}</p> : null}
                  {document.fileUrl ? (
                    <a href={document.fileUrl} target="_blank" className="mt-1 inline-block text-xs font-semibold text-teal-800 underline">
                      {t("فتح الملف", "Open file")}
                    </a>
                  ) : null}
                </div>
                {allow.review ? (
                  <form action={reviewPortalDocument} className="flex shrink-0 gap-2">
                    <input type="hidden" name="id" value={document.id} />
                    <SubmitButton name="decision" value="accept">
                      <Check size={16} />
                      {t("قبول", "Accept")}
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="danger" confirm={t("رفض المستند وحذف ملفه؟", "Reject and delete this document?")}>
                      <X size={16} />
                      {t("رفض", "Reject")}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {allow.expenses ? (
        <Card id="expenses" className="mt-5">
          <SectionTitle
            hint={t(`${claims.length} بانتظار الموافقة`, `${claims.length} awaiting approval`)}
            action={
              <Link href="/expenses?view=APPROVED" className={linkAction}>
                {t("المعتمدة بانتظار الصرف", "Approved, to be paid")}
              </Link>
            }
          >
            {t("طلبات تعويض المصروفات", "Expense claims")}
          </SectionTitle>
          {claims.length === 0 ? <EmptyState icon={Receipt} title={t("لا طلبات معلّقة", "No pending claims")} text={t("طلبات التعويض التي يرسلها الموظفون مع الإيصالات تظهر هنا.", "Claims employees send with receipts appear here.")} /> : null}
          <ul className="space-y-3">
            {claims.map((claim) => (
              <ExpenseClaimCard key={claim.id} claim={claim} lang={lang} currency={user.company.currency} allow={claimAllow} returnTo="/approvals#expenses" />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
