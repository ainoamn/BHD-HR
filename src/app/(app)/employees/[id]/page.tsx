import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { LeaveRangeForm } from "@/components/leave-range-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { AttendanceEditForm, DeleteButton, DocumentEditForm } from "@/components/row-forms";
import { can, requirePermission } from "@/lib/auth";
import {
  ATTENDANCE_LABEL,
  BALANCE_KEYS,
  BALANCE_LABEL,
  DOC_LABEL,
  EXTRA_DOC_TYPES,
  GENDER_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  localizeTerm,
  monthName,
} from "@/lib/constants";
import { describeExpiry, worstExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { computeLeaveBalances, groupAttendance, leaveWarningText, leaveWarnings } from "@/lib/leave";
import { prisma } from "@/lib/prisma";
import { packageGross } from "@/lib/salary";
import { cn, daysLabel, formatDate, money, text } from "@/lib/utils";
import { deleteAttendance, markAttendance, updateAttendance } from "@/server/attendance-actions";
import { addDocument, deleteDocument, updateDocument } from "@/server/document-actions";
import { deleteEmployee } from "@/server/employee-actions";
import { addLeaveCredit } from "@/server/leave-actions";
import { createSalary } from "@/server/salary-actions";

function Info({ label, value, wide, dir }: { label: string; value: React.ReactNode; wide?: boolean; dir?: "ltr" }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-slate-50 px-3 py-2.5", wide && "sm:col-span-2")}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900" dir={dir}>
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

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
    },
  });
  if (!employee) notFound();
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
  };
  const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits);
  const periods = groupAttendance(employee.attendance);
  const warnDays = user.company.leaveWarningDays;
  const warnings = leaveWarnings(balances, warnDays);
  const warnedKeys = new Set(warnings.map((item) => item.key));
  const balanceMap = {
    [employee.id]: {
      annual: balances.annual.remaining,
      sick: balances.sick.remaining,
      compensatory: balances.compensatory.remaining,
      other: balances.other.remaining,
    },
  };
  const tabAllowed: Record<string, boolean> = { info: true, docs: allow.docs, attendance: allow.attendance, salaries: allow.salaries };
  const tab = tabAllowed[sp.tab || ""] ? sp.tab! : "info";
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const currency = user.company.currency;
  const gross = packageGross(employee);
  const primaryDocs = [
    { label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry },
    { label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry },
    { label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry },
  ];
  const docsWorst = worstExpiry(
    [...primaryDocs.map((doc) => doc.expiry), ...employee.documents.map((doc) => doc.expiryDate)],
    limits,
    lang,
  );
  const lastSalary = employee.salaries[0];
  const tabs = [
    { id: "info", label: t("البيانات", "Details"), count: null },
    { id: "docs", label: t("الوثائق", "Documents"), count: primaryDocs.filter((doc) => doc.number || doc.expiry).length + employee.documents.length },
    { id: "attendance", label: t("الحضور والإجازات", "Attendance & leave"), count: periods.length },
    { id: "salaries", label: t("الرواتب", "Salaries"), count: employee.salaries.length },
  ].filter((item) => tabAllowed[item.id]);
  const employer = employee.employer;
  const employerName = employer ? (lang === "en" && employer.nameEn ? employer.nameEn : employer.name) : null;
  const displayName = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const otherName = lang === "en" ? employee.fullName : employee.nameEn;
  const secondName = otherName && otherName.trim().toLowerCase() !== displayName.trim().toLowerCase() ? otherName : null;
  const jobTitle = localizeTerm(employee.jobTitle, lang);
  const base = `/employees/${employee.id}`;

  const periodActions = (period: (typeof periods)[number]) =>
    allow.attEdit || allow.attDelete ? (
      <div className="flex flex-wrap items-start justify-end gap-3">
        {allow.attEdit ? (
          <AttendanceEditForm
            action={updateAttendance}
            id={period.deleteId}
            returnTo={`${base}?tab=attendance`}
            type={period.row.type}
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
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/employees" className="inline-flex text-sm font-semibold text-teal-800">
        {lang === "en" ? "←" : "→"} {t("كل الموظفين", "All employees")}
      </Link>

      <Card className="p-0 sm:p-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-800 text-2xl font-bold text-white sm:h-16 sm:w-16">
              {displayName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{displayName}</h1>
                <ToneBadge tone={STATUS_TONE[employee.status] || "slate"}>{pick(STATUS_LABEL[employee.status], lang, employee.status)}</ToneBadge>
              </div>
              {secondName ? (
                <p className="mt-0.5 break-words text-sm text-slate-500" dir={lang === "en" ? "rtl" : "ltr"}>
                  {secondName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
            {allow.edit ? (
              <Link href={`${base}/edit`} className={primaryBtn}>
                {t("تعديل البيانات", "Edit")}
              </Link>
            ) : null}
            {allow.salaries ? (
              <Link href={`${base}?tab=salaries#statement`} className={secondaryBtn}>
                {t("كشف الرواتب", "Statement")}
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
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 text-xs sm:px-5">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{employee.employeeNumber}</span>
          {jobTitle ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{jobTitle}</span> : null}
          {employee.department ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{employee.department}</span> : null}
          {employerName ? (
            <Link href={`/employers/${employer!.id}`} className="rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-800 ring-1 ring-teal-100">
              {t("الكفيل:", "Sponsor:")} {employerName}
            </Link>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{t("بدون كفيل", "No sponsor")}</span>
          )}
          {employee.phone ? (
            <a href={`tel:${employee.phone}`} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700" dir="ltr">
              {employee.phone}
            </a>
          ) : null}
          {employee.email ? (
            <a href={`mailto:${employee.email}`} className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1 text-slate-700" dir="ltr">
              {employee.email}
            </a>
          ) : null}
        </div>
      </Card>

      {allow.attendance && warnings.length ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800" role="alert">
          <p className="font-bold">{t("تنبيه رصيد الإجازات", "Leave balance alert")}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
            {warnings.map((item) => (
              <li key={item.key}>{leaveWarningText(item, pick(BALANCE_LABEL[item.key], lang), lang)}</li>
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

      <Flash error={sp.error} message={sp.message} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {allow.salaries ? (
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{t("إجمالي الراتب", "Gross salary")}</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900">{money(gross, currency)}</p>
          </div>
        ) : null}
        {allow.attendance ? (
          <div className={cn("min-w-0 rounded-2xl border p-4 shadow-sm", warnedKeys.has("annual") ? "border-red-200 bg-red-50" : "border-slate-200 bg-white")}>
            <p className={cn("text-xs", warnedKeys.has("annual") ? "text-red-700" : "text-slate-500")}>{t("رصيد السنوية", "Annual leave left")}</p>
            <p className={cn("mt-1 text-lg font-bold", warnedKeys.has("annual") ? "text-red-700" : "text-slate-900")}>
              {daysLabel(balances.annual.remaining)} <span className="text-sm font-normal text-slate-500">{t("يوم", "days")}</span>
            </p>
          </div>
        ) : null}
        {allow.docs ? (
          <Link href={`${base}?tab=docs`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-200">
            <p className="text-xs text-slate-500">{t("أقرب انتهاء وثيقة", "Nearest document expiry")}</p>
            <div className="mt-1.5">
              <ToneBadge tone={docsWorst.tone}>{docsWorst.label}</ToneBadge>
            </div>
          </Link>
        ) : null}
        {allow.salaries ? (
        <Link href={`${base}?tab=salaries`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-200">
          <p className="text-xs text-slate-500">{t("آخر راتب", "Last salary")}</p>
          {lastSalary ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">
                {monthName(lastSalary.month, lang)} {lastSalary.year}
              </span>
              <ToneBadge tone={lastSalary.paid ? "green" : "amber"}>{lastSalary.paid ? t("مصروف", "Paid") : t("غير مصروف", "Unpaid")}</ToneBadge>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-500">{t("لا يوجد بعد", "None yet")}</p>
          )}
        </Link>
        ) : null}
      </div>

      <nav className="no-print">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:inline-flex">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={`${base}?tab=${item.id}`}
              className={cn(
                "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold sm:px-4",
                item.id === tab ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {item.label}
              {item.count ? (
                <span className={cn("rounded-full px-1.5 text-xs", item.id === tab ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{item.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {tab === "info" ? (
            <>
              <Card>
                <SectionTitle>{t("البيانات الشخصية", "Personal details")}</SectionTitle>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <Info label={t("الاسم الكامل", "Full name")} value={employee.fullName} />
                  <Info label={t("الاسم بالإنجليزية", "Name in English")} value={text(employee.nameEn)} dir="ltr" />
                  <Info label={t("الجنسية", "Nationality")} value={text(localizeTerm(employee.nationality, lang))} />
                  <Info label={t("الجنس", "Gender")} value={employee.gender ? pick(GENDER_LABEL[employee.gender], lang, employee.gender) : "—"} />
                  <Info label={t("تاريخ الميلاد", "Date of birth")} value={formatDate(employee.dateOfBirth)} />
                  <Info label={t("الهاتف", "Phone")} value={text(employee.phone)} dir="ltr" />
                  <Info label={t("البريد الإلكتروني", "Email")} value={text(employee.email)} dir="ltr" />
                  <Info label={t("العنوان", "Address")} value={text(employee.address)} wide />
                </dl>
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
                  <Info label={t("القسم", "Department")} value={text(employee.department)} />
                  <Info label={t("الحالة", "Status")} value={pick(STATUS_LABEL[employee.status], lang, employee.status)} />
                  <Info label={t("تاريخ الالتحاق", "Joining date")} value={formatDate(employee.joiningDate)} />
                  <Info label={t("نهاية العقد", "Contract end")} value={formatDate(employee.contractEnd)} />
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
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{employee.notes}</p>
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
                          {document.notes ? <p className="mt-1 text-xs text-slate-500">{document.notes}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-start justify-between gap-3 sm:justify-end">
                          <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
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
                        <p className="font-semibold">{pick(ATTENDANCE_LABEL[period.row.type], lang, period.row.type)}</p>
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
                            <td>{pick(ATTENDANCE_LABEL[period.row.type], lang, period.row.type)}</td>
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
                            <td className="whitespace-nowrap">{money(packageGross(salary), currency)}</td>
                            <td className="whitespace-nowrap">{money(salary.absenceDeduction + salary.otherDeduction, currency)}</td>
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
        </div>

        <aside className="min-w-0 space-y-4">
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
            <p className="mt-3 text-xs leading-5 text-slate-500">{t("راتب كل شهر يُحفظ وحده عند إنشاء المسير.", "Each month's salary is saved separately when payroll is generated.")}</p>
          </Card>
          ) : null}

          {allow.attendance ? (
          <Card>
            <SectionTitle>{t("أرصدة الإجازة", "Leave balances")}</SectionTitle>
            <div className="space-y-3">
              {BALANCE_KEYS.map((key) => {
                const figure = balances[key];
                const total = figure.entitlement + figure.added;
                const percent = total > 0 ? Math.max(0, Math.min(100, (figure.remaining / total) * 100)) : 0;
                const warned = warnedKeys.has(key);
                return (
                  <div key={key} className={cn(warned && "rounded-xl bg-red-50 p-2 ring-1 ring-red-200")}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className={cn("font-medium", warned ? "text-red-800" : "text-slate-800")}>{pick(BALANCE_LABEL[key], lang)}</span>
                      <span className={cn("whitespace-nowrap font-bold", warned ? "text-red-700" : "text-slate-900")}>
                        {daysLabel(figure.remaining)}
                        <span className="text-xs font-normal text-slate-500"> / {daysLabel(total)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full", warned ? "bg-red-500" : "bg-teal-600")} style={{ width: `${figure.remaining < 0 ? 100 : percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t(
                        `مستحق ${daysLabel(figure.entitlement)} + إضافي ${daysLabel(figure.added)} − مستخدم ${daysLabel(figure.used)}`,
                        `Entitled ${daysLabel(figure.entitlement)} + extra ${daysLabel(figure.added)} − used ${daysLabel(figure.used)}`,
                      )}
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
                <select className={`${fieldClass} w-full`} name="balanceKey" defaultValue="compensatory">
                  {BALANCE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {pick(BALANCE_LABEL[key], lang)}
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
