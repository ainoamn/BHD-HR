import Link from "next/link";
import { ChevronDown, FilePlus2, Files, FolderLock, Paperclip } from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { DocumentScan } from "@/components/document-scan";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { DeleteButton, DocumentEditForm } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, ToneBadge, Toolbar, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { DOC_LABEL, EXTRA_DOC_TYPES } from "@/lib/constants";
import { collectDocuments } from "@/lib/documents";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort, withColumnParams } from "@/lib/column-tools";
import { describeExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, text } from "@/lib/utils";
import { addDocument, deleteDocument, updateDocument } from "@/server/document-actions";

const VIEW_IDS = ["all", "expired", "warning", "early"];
const COLUMNS = ["name", "doc", "no", "expiry", "status"];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    employerId?: string;
    sort?: string;
    dir?: string;
    fname?: string;
    fdoc?: string;
    fno?: string;
    fexpiry?: string;
    fstatus?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("documents.view");
  const { lang, t } = await getI18n();
  const views = [
    { id: "all", label: t("الكل", "All") },
    { id: "expired", label: t("منتهية", "Expired") },
    { id: "warning", label: t("خلال فترة التحذير", "Within warning period") },
    { id: "early", label: t("خلال التنبيه المبكر", "Within early notice") },
  ];
  const view = VIEW_IDS.includes(sp.view || "") ? sp.view || "all" : "all";
  const employers = await prisma.employer.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, nameEn: true },
    orderBy: { name: "asc" },
  });
  const employerId = sp.employerId === "none" || employers.some((item) => item.id === sp.employerId) ? sp.employerId || "" : "";
  const employerFilter = employerId === "none" ? { employerId: null } : employerId ? { employerId } : {};
  const baseQuery = (id: string) => {
    const params = new URLSearchParams();
    params.set("view", id);
    if (employerId) params.set("employerId", employerId);
    return withColumnParams(`?${params}`, sp, COLUMNS);
  };
  const returnTo = `/documents${baseQuery(view)}`;
  const allow = { create: can(user, "documents.create"), edit: can(user, "documents.edit"), remove: can(user, "documents.delete") };
  const canEditEmployee = can(user, "employees.edit");
  const showActions = allow.edit || allow.remove || canEditEmployee;
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const [employees, pendingReview] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" }, ...employerFilter },
      include: { documents: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.employeeDocument.count({
      where: {
        submittedAt: { not: null },
        reviewedAt: null,
        employee: { companyId: user.companyId, status: { not: "TERMINATED" } },
      },
    }),
  ]);
  const selectedEmployer = employers.find((item) => item.id === employerId);
  const employerLabel = selectedEmployer
    ? lang === "en" && selectedEmployer.nameEn
      ? selectedEmployer.nameEn
      : selectedEmployer.name
    : employerId === "none"
      ? t("بدون كفيل", "No sponsor")
      : "";
  const rows = collectDocuments(employees, lang)
    .map((row) => ({ ...row, status: describeExpiry(row.expiry, limits, lang) }))
    .filter((row) => {
      if (view === "expired") return row.status.key === "expired" || row.status.key === "today";
      if (view === "warning") return ["expired", "today", "urgent", "warning"].includes(row.status.key);
      if (view === "early") return row.status.key !== "ok" && row.status.key !== "none";
      return true;
    })
    .filter(
      (row) =>
        includesText(row.employeeName, sp.fname) &&
        includesText(row.label, sp.fdoc) &&
        includesText(row.number || "", sp.fno) &&
        includesText(`${formatDate(row.expiry)} ${row.expiry ? row.expiry.toISOString().slice(0, 10) : ""}`, sp.fexpiry) &&
        includesText(row.status.label, sp.fstatus),
    );
  const { sort, dir } = readSort(sp, COLUMNS, "status");
  const locale = lang === "en" ? "en" : "ar";
  rows.sort((a, b) => {
    // No sort chosen: keep the default order, nearest expiry first.
    if (!sp.sort) return a.status.days - b.status.days;
    if (sort === "name") return compareText(a.employeeName, b.employeeName, dir, locale);
    if (sort === "doc") return compareText(a.label, b.label, dir, locale);
    if (sort === "no") return compareText(a.number || "", b.number || "", dir, locale);
    if (sort === "status") return compareText(a.status.label, b.status.label, dir, locale);
    return compareNumber(a.expiry ? a.expiry.getTime() : Number.MAX_SAFE_INTEGER, b.expiry ? b.expiry.getTime() : Number.MAX_SAFE_INTEGER, dir);
  });

  return (
    <div className="page-wide">
      <PageHeader
        icon={Files}
        title={t("المستندات", "Documents")}
        description={t("البطاقة والجواز والإقامة وبقية الوثائق، مع حالة الانتهاء.", "ID card, passport, residence and other documents, with expiry status.")}
      >
        <Link href="/documents/custody" className={secondaryBtn}>
          <FolderLock size={16} />
          {t("العهدة", "Custody")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      {pendingReview ? (
        <Link
          href="/approvals#documents"
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          <span>
            {t(`${pendingReview} مستند أرسله الموظفون من البوابة بانتظار المراجعة`, `${pendingReview} document(s) sent from the employee portal await review`)}
          </span>
          <span className="shrink-0 underline underline-offset-2">{t("مراجعة", "Review")}</span>
        </Link>
      ) : null}
      <Toolbar>
        <GetForm className="flex w-full flex-wrap items-center gap-2">
          {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
          {columnHiddenFields(sp, COLUMNS).map((field) => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <select className={`${fieldClass} min-w-0 flex-1 sm:w-56 sm:flex-none`} name="employerId" defaultValue={employerId} aria-label={t("الكفيل", "Sponsor")}>
            <option value="">{t("كل الكفلاء", "All sponsors")}</option>
            {employers.map((employer) => (
              <option key={employer.id} value={employer.id}>
                {lang === "en" && employer.nameEn ? employer.nameEn : employer.name}
              </option>
            ))}
            <option value="none">{t("بدون كفيل", "No sponsor")}</option>
          </select>
          <button className={primaryBtn} type="submit">
            {t("عرض", "Show")}
          </button>
          {employerId ? (
            <Link href={`/documents${withColumnParams(view !== "all" ? `?view=${view}` : "", sp, COLUMNS)}`} className={`${secondaryBtn} px-3`}>
              {t("مسح", "Clear")}
            </Link>
          ) : null}
        </GetForm>
      </Toolbar>
      {allow.create && employees.length ? (
        <details open={Boolean(sp.error)} className="group mb-5 rounded-2xl border border-slate-200/90 bg-surface shadow-card">
          <summary className="flex list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <span className="flex items-center gap-2.5 font-bold text-slate-900">
              <span className="flex size-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <FilePlus2 size={17} />
              </span>
              {t("إضافة مستند", "Add a document")}
              {employerLabel ? <span className="text-sm font-semibold text-slate-500">· {employerLabel}</span> : null}
            </span>
            <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
          </summary>
          <form action={addDocument} className="grid gap-3 border-t border-slate-100 px-4 py-5 sm:grid-cols-3 sm:px-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="sm:col-span-3">
              <DocumentScan mode="document" />
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{t("الموظف", "Employee")}</span>
              <select className={`${fieldClass} w-full`} name="employeeId" required>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName} — {employee.employeeNumber}
                  </option>
                ))}
              </select>
            </label>
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
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{t("ملاحظة", "Note")}</span>
              <input className={`${fieldClass} w-full`} name="notes" />
            </label>
            <div className="sm:col-span-3">
              <SubmitButton>{t("إضافة مستند", "Add document")}</SubmitButton>
            </div>
          </form>
        </details>
      ) : allow.create && employerId ? (
        <p className="mb-5 rounded-2xl border border-slate-200/90 bg-surface px-4 py-3.5 text-sm text-slate-600 shadow-card">
          {t("لا يوجد موظفون لهذا الكفيل. اختر كفيلاً آخر أو أضف موظفاً.", "No employees for this sponsor. Pick another sponsor or add an employee.")}
        </p>
      ) : null}
      <div className="mb-4 overflow-x-auto pb-1">
        <nav className="segmented" aria-label={t("تصفية المستندات", "Filter documents")}>
          {views.map((item) => (
            <Link key={item.id} href={`/documents${baseQuery(item.id)}`} aria-current={item.id === view ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="table-shell">
        <table className="table-stack table-tools min-w-full text-sm">
          <thead>
            <tr>
              <ColumnHead column="name" label={t("الموظف", "Employee")} />
              <ColumnHead column="doc" label={t("المستند", "Document")} />
              <ColumnHead column="no" label={t("الرقم", "Number")} />
              <ColumnHead column="expiry" label={t("الانتهاء", "Expiry")} />
              <ColumnHead column="status" label={t("الحالة", "Status")} />
              {showActions ? <th className="px-4 py-3 text-end">{t("إجراءات", "Actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="cell-title px-4 py-3">
                  <Link href={`/employees/${row.employeeId}?tab=docs`} className="font-semibold text-slate-900 hover:text-teal-700">
                    {row.employeeName}
                  </Link>
                  <div className="tabular text-xs text-slate-500">{row.employeeNumber}</div>
                </td>
                <td className="px-4 py-3" data-label={t("المستند", "Document")}>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {row.label}
                    {row.fileUrl ? (
                      <a href={row.fileUrl} target="_blank" className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                        <Paperclip size={12} />
                        {t("ملف", "File")}
                      </a>
                    ) : null}
                  </span>
                </td>
                <td className="tabular px-4 py-3" data-label={t("الرقم", "Number")}>
                  <span dir="ltr">{text(row.number)}</span>
                </td>
                <td className="tabular px-4 py-3 whitespace-nowrap" data-label={t("الانتهاء", "Expiry")}>
                  {formatDate(row.expiry)}
                </td>
                <td className="px-4 py-3" data-label={t("الحالة", "Status")}>
                  <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                </td>
                {showActions ? (
                  <td className="cell-actions px-4 py-3">
                    {row.document ? (
                      <div className="flex flex-wrap items-start gap-4 sm:justify-end">
                        {allow.edit ? <DocumentEditForm action={updateDocument} returnTo={returnTo} document={row.document} /> : null}
                        {allow.remove ? (
                          <DeleteButton
                            action={deleteDocument}
                            fields={{ id: row.document.id, returnTo }}
                            confirm={t("حذف هذا المستند وملفه المرفق؟", "Delete this document and its file?")}
                          />
                        ) : null}
                      </div>
                    ) : canEditEmployee ? (
                      <div className="sm:text-end">
                        <Link href={`/employees/${row.employeeId}/edit`} className={linkAction}>
                          {t("تعديل من بيانات الموظف", "Edit in employee record")}
                        </Link>
                      </div>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200">
              <Files size={22} />
            </span>
            <p className="mt-3 text-sm text-slate-500">{t("لا توجد مستندات في هذا العرض.", "No documents in this view.")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
