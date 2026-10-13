import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Paperclip } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, InfoItem, SectionTitle, ToneBadge, linkAction } from "@/components/ui";
import { canTeam } from "@/lib/auth";
import { DOC_LABEL, monthName, termText } from "@/lib/constants";
import { describeExpiry } from "@/lib/expiry";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { attendanceChoices, attendanceLabel, computeLeaveBalances, groupAttendance, leaveName, remainingByKey } from "@/lib/leave";
import { SCORE_LABEL, overallBand, overallTone } from "@/lib/performance";
import { LEAVE_REQUEST_LABEL, LEAVE_REQUEST_TONE } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/team";
import { daysLabel, formatDate, money } from "@/lib/utils";
import { markAttendance } from "@/server/attendance-actions";
import { reopenLeaveRequest } from "@/server/request-actions";

export const dynamic = "force-dynamic";

export default async function TeamMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, scope } = await requireTeam();
  if (!scope.includes(id)) notFound();
  const { lang, t } = await getI18n();
  const allow = {
    attendance: canTeam(user, "team.attendance.view"),
    record: canTeam(user, "team.attendance.create"),
    docs: canTeam(user, "team.documents.view"),
    salaries: canTeam(user, "team.salaries.view"),
    reviews: canTeam(user, "team.performance.view"),
    approve: canTeam(user, "team.leave.approve"),
  };
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      manager: { select: { fullName: true, nameEn: true } },
      employer: { select: { name: true, nameEn: true } },
      attendance: allow.attendance ? { orderBy: { date: "desc" } } : false,
      leaveCredits: allow.attendance ? { select: { balanceKey: true, days: true } } : false,
      leaveRequests: allow.attendance ? { orderBy: { createdAt: "desc" }, take: 8 } : false,
      documents: allow.docs ? { where: { OR: [{ submittedAt: null }, { reviewedAt: { not: null } }] }, orderBy: { createdAt: "desc" } } : false,
      salaries: allow.salaries ? { orderBy: [{ year: "desc" }, { month: "desc" }], take: 12, select: { id: true, year: true, month: true, netSalary: true, paid: true, paidAt: true } } : false,
    },
  });
  if (!employee) notFound();
  const reviews = allow.reviews
    ? await prisma.performanceReview.findMany({
        where: { employeeId: employee.id, companyId: user.companyId, status: "DONE" },
        orderBy: { completedAt: "desc" },
        take: 6,
        select: { id: true, overall: true, completedAt: true, strengths: true, improvements: true, cycle: { select: { name: true } } },
      })
    : [];
  const company = user.company;
  const leaveTypes = await getLeaveTypes(user.companyId);
  const limits = { urgent: company.alertUrgentDays, warning: company.alertWarningDays, early: company.alertEarlyDays };
  const balances = allow.attendance ? computeLeaveBalances(employee, employee.attendance ?? [], employee.leaveCredits ?? [], leaveTypes).filter((item) => item.applies || item.remaining !== 0) : [];
  const periods = allow.attendance ? groupAttendance(employee.attendance ?? []).slice(0, 12) : [];
  const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const job = termText(employee.jobTitle, employee.jobTitleEn, lang);
  const department = termText(employee.department, employee.departmentEn, lang);
  const Back = lang === "en" ? ArrowLeft : ArrowRight;
  const primaryDocs = [
    { label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry, fileUrl: employee.idFileUrl },
    { label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry, fileUrl: employee.passportFileUrl },
    { label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry, fileUrl: employee.residenceFileUrl },
  ].filter((doc) => doc.number || doc.expiry || doc.fileUrl);
  const requestLabel = (choice: string) =>
    attendanceLabel({ type: choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: choice === "UNPAID_LEAVE" ? null : choice.slice(6) }, leaveTypes, lang);

  return (
    <div className="space-y-5">
      <Link href="/team" className={linkAction}>
        <Back size={15} />
        {user.role === "EMPLOYER" ? t("كل العمّال", "All workers") : t("كل الفريق", "Whole team")}
      </Link>
      <Flash error={sp.error} message={sp.message} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EmployeeAvatar name={name} photo={employee.photoUrl} eager className="size-14 rounded-2xl bg-teal-700 text-2xl text-white" />
            <div className="min-w-0">
              <h2 className="break-words text-xl font-bold text-slate-900">{name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                <span className="tabular">{employee.employeeNumber}</span>
                {job ? ` · ${job}` : ""}
                {department ? ` · ${department}` : ""}
              </p>
            </div>
          </div>
          {employee.status !== "ACTIVE" ? <ToneBadge tone="amber">{employee.status === "ON_LEAVE" ? t("في إجازة", "On leave") : employee.status}</ToneBadge> : null}
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label={t("الهاتف", "Phone")} value={employee.phone ? <a href={`tel:${employee.phone.replace(/\s/g, "")}`} className="hover:text-teal-700">{employee.phone}</a> : "—"} dir="ltr" />
          <InfoItem label={t("البريد", "Email")} value={employee.email || "—"} dir="ltr" />
          <InfoItem label={t("تاريخ الالتحاق", "Joined")} value={formatDate(employee.joiningDate)} />
          <InfoItem
            label={user.role === "EMPLOYER" ? t("المدير المباشر", "Direct manager") : t("الكفيل", "Sponsor")}
            value={
              user.role === "EMPLOYER"
                ? employee.manager
                  ? lang === "en" && employee.manager.nameEn
                    ? employee.manager.nameEn
                    : employee.manager.fullName
                  : "—"
                : employee.employer
                  ? lang === "en" && employee.employer.nameEn
                    ? employee.employer.nameEn
                    : employee.employer.name
                  : "—"
            }
          />
        </dl>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {allow.attendance ? (
          <Card id="attendance">
            <SectionTitle>{t("أرصدة الإجازة", "Leave balances")}</SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2">
              {balances.map((figure) => (
                <li key={figure.key} className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-inset ring-slate-100">
                  <span className="font-medium text-slate-800">{leaveName(figure, lang)}</span>
                  <span className={`tabular whitespace-nowrap font-bold ${figure.remaining < 0 ? "text-red-700" : "text-slate-900"}`}>
                    {daysLabel(figure.remaining)}
                    <span className="text-xs font-normal text-slate-500"> / {daysLabel(figure.entitlement + figure.added)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <h3 className="mb-2 mt-5 text-sm font-bold text-slate-900">{t("آخر الغياب والإجازات", "Recent absences and leave")}</h3>
            {periods.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {periods.map((period) => (
                  <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-slate-700">
                      {formatDate(period.start)}
                      {+new Date(period.start) !== +new Date(period.end) ? ` — ${formatDate(period.end)}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <ToneBadge tone="slate">{attendanceLabel(period.row, leaveTypes, lang)}</ToneBadge>
                      <span className="tabular text-xs text-slate-500">
                        {daysLabel(period.days)} {t("يوم", "d")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("لا سجلات غياب أو إجازة.", "No absences or leave recorded.")}</p>
            )}
            {employee.leaveRequests?.length ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-bold text-slate-900">{t("طلبات الإجازة", "Leave requests")}</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {employee.leaveRequests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-slate-700">
                        {requestLabel(request.choice)} · {formatDate(request.fromDate)} — {formatDate(request.toDate)}
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        <ToneBadge tone={LEAVE_REQUEST_TONE[request.status] || "slate"}>{pick(LEAVE_REQUEST_LABEL[request.status], lang, request.status)}</ToneBadge>
                        {allow.approve && ["APPROVED", "REJECTED", "REVOKED"].includes(request.status) ? (
                          <form action={reopenLeaveRequest}>
                            <input type="hidden" name="id" value={request.id} />
                            <input type="hidden" name="returnTo" value={`/team/${employee.id}`} />
                            <SubmitButton
                              variant="link"
                              pendingLabel={t("جارٍ التراجع...", "Undoing...")}
                              confirm={
                                request.status === "APPROVED"
                                  ? t("التراجع عن الموافقة؟ ستُحذف أيام هذه الإجازة من الحضور وتعود إلى الرصيد، ويعود الطلب بانتظار القرار.", "Undo the approval? Its days are removed from attendance and returned to the balance, and the request waits for a decision again.")
                                  : t("إعادة هذا الطلب إلى الانتظار لاتخاذ قرار جديد؟", "Return this request to waiting for a new decision?")
                              }
                            >
                              {t("التراجع عن القرار", "Undo decision")}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        ) : null}

        {allow.docs ? (
          <Card id="documents">
            <SectionTitle>{t("الوثائق", "Documents")}</SectionTitle>
            {primaryDocs.length + (employee.documents?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">{t("لا وثائق مسجلة.", "No documents recorded.")}</p> : null}
            <ul className="divide-y divide-slate-100">
              {[
                ...primaryDocs,
                ...(employee.documents ?? []).map((doc) => ({ label: pick(DOC_LABEL[doc.type], lang, doc.type), number: doc.documentNo, expiry: doc.expiryDate, fileUrl: doc.fileUrl })),
              ].map((doc, index) => {
                const status = describeExpiry(doc.expiry, limits, lang);
                return (
                  <li key={`${doc.label}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{doc.label}</p>
                      <p className="text-xs text-slate-500">
                        <span dir="ltr">{doc.number || "—"}</span> · {formatDate(doc.expiry)}
                        {doc.fileUrl ? (
                          <>
                            {" · "}
                            <a href={doc.fileUrl} target="_blank" className="inline-flex items-center gap-1 font-semibold text-teal-800 underline">
                              <Paperclip size={12} />
                              {t("الملف", "File")}
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {allow.salaries ? (
          <Card id="salaries">
            <SectionTitle>{t("الرواتب", "Salaries")}</SectionTitle>
            {employee.salaries?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {employee.salaries.map((salary) => (
                  <li key={salary.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-slate-700">
                      {monthName(salary.month, lang)} {salary.year}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-bold text-slate-900">{money(salary.netSalary, company.currency)}</span>
                      <ToneBadge tone={salary.paid ? "green" : "amber"}>{salary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Not paid")}</ToneBadge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("لا رواتب مسجلة بعد.", "No salaries recorded yet.")}</p>
            )}
          </Card>
        ) : null}

        {allow.reviews ? (
          <Card id="reviews">
            <SectionTitle>{t("تقييمات الأداء", "Performance reviews")}</SectionTitle>
            {reviews.length ? (
              <ul className="space-y-3 text-sm">
                {reviews.map((review) => {
                  const band = overallBand(review.overall);
                  return (
                    <li key={review.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{review.cycle.name}</span>
                        {review.overall !== null ? (
                          <ToneBadge tone={overallTone(review.overall)}>
                            <span className="tabular">{review.overall} / 5</span>
                            {band ? ` · ${pick(SCORE_LABEL[band], lang)}` : ""}
                          </ToneBadge>
                        ) : null}
                      </div>
                      {review.strengths ? <p className="mt-1.5 text-slate-600">{review.strengths}</p> : null}
                      {review.improvements ? <p className="mt-1 text-slate-500">{review.improvements}</p> : null}
                      <p className="mt-1 text-xs text-slate-400">{formatDate(review.completedAt)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("لا تقييمات مكتملة.", "No completed reviews.")}</p>
            )}
          </Card>
        ) : null}
      </div>

      {allow.record ? (
        <Card id="record">
          <SectionTitle>{t("تسجيل غياب أو إجازة", "Record an absence or leave")}</SectionTitle>
          <LeaveRangeForm
            action={markAttendance}
            employees={[{ id: employee.id, fullName: name }]}
            balances={{ [employee.id]: remainingByKey(computeLeaveBalances(employee, employee.attendance ?? [], employee.leaveCredits ?? [], leaveTypes)) }}
            choices={attendanceChoices(leaveTypes, lang)}
            returnTo={`/team/${employee.id}#attendance`}
            warnDays={company.leaveWarningDays}
          />
        </Card>
      ) : null}
    </div>
  );
}
