import Link from "next/link";
import { ChevronDown, FilePlus2, Files, FolderLock, Printer } from "lucide-react";
import { DocumentEmployeeList, type DocumentEmployeeGroup } from "@/components/document-employee-list";
import { DocumentScan } from "@/components/document-scan";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, Toolbar, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { readAlertDocTypes, tracksAlertDoc } from "@/lib/alert-docs";
import { can, requirePermission } from "@/lib/auth";
import { DOC_LABEL, EXTRA_DOC_TYPES } from "@/lib/constants";
import { collectDocuments } from "@/lib/documents";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort, withColumnParams } from "@/lib/column-tools";
import { describeExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { addDocument } from "@/server/document-actions";

const VIEW_IDS = ["all", "expired", "warning", "early"];
const COLUMNS = ["name", "doc", "no", "expiry", "status"];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    employerId?: string;
    employeeId?: string;
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
  const alertDocs = readAlertDocTypes(user.company.alertDocTypes);
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
    if (sp.employeeId) params.set("employeeId", sp.employeeId);
    return withColumnParams(`?${params}`, sp, COLUMNS);
  };
  const returnTo = `/documents${baseQuery(view)}`;
  const allow = { create: can(user, "documents.create"), edit: can(user, "documents.edit"), remove: can(user, "documents.delete") };
  const canEditEmployee = can(user, "employees.edit");
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
  const employeeId = employees.some((item) => item.id === sp.employeeId) ? sp.employeeId || "" : "";
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
      if (employeeId && row.employeeId !== employeeId) return false;
      if (view !== "all" && !tracksAlertDoc(alertDocs, row.type)) return false;
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
    if (!sp.sort) return a.status.days - b.status.days;
    if (sort === "name") return compareText(a.employeeName, b.employeeName, dir, locale);
    if (sort === "doc") return compareText(a.label, b.label, dir, locale);
    if (sort === "no") return compareText(a.number || "", b.number || "", dir, locale);
    if (sort === "status") return compareText(a.status.label, b.status.label, dir, locale);
    return compareNumber(a.expiry ? a.expiry.getTime() : Number.MAX_SAFE_INTEGER, b.expiry ? b.expiry.getTime() : Number.MAX_SAFE_INTEGER, dir);
  });

  const grouped = new Map<string, DocumentEmployeeGroup>();
  for (const row of rows) {
    const existing = grouped.get(row.employeeId);
    if (existing) {
      existing.rows.push(row);
      existing.labels.push(row.label);
      if (row.status.days < existing.worst.days) existing.worst = row.status;
    } else {
      grouped.set(row.employeeId, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeeNumber: row.employeeNumber,
        labels: [row.label],
        worst: row.status,
        rows: [row],
      });
    }
  }
  const groups = [...grouped.values()];
  if (!sp.sort || sort === "name") {
    groups.sort((a, b) => compareText(a.employeeName, b.employeeName, dir, locale));
  } else {
    groups.sort((a, b) => a.worst.days - b.worst.days);
  }

  const printParams = new URLSearchParams();
  if (view !== "all") printParams.set("view", view);
  if (employerId) printParams.set("employerId", employerId);
  const printQuery = printParams.toString();
  const printBase = printQuery ? `/documents/print?${printQuery}` : "/documents/print";
  const printAllHref = `${printBase}${printBase.includes("?") ? "&" : "?"}download=1`;
  const clearEmployeeHref = (() => {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (employerId) params.set("employerId", employerId);
    const withCols = withColumnParams(params.toString() ? `?${params}` : "", sp, COLUMNS);
    return `/documents${withCols}`;
  })();

  return (
    <div className="page-wide">
      <PageHeader
        icon={Files}
        title={t("المستندات", "Documents")}
        description={t("البطاقة والجواز والإقامة وبقية الوثائق، مع حالة الانتهاء.", "ID card, passport, residence and other documents, with expiry status.")}
      >
        <Link href={printAllHref} className={secondaryBtn}>
          <Printer size={16} />
          {employerId ? t("طباعة الكفيل", "Print sponsor") : t("طباعة الكل", "Print all")}
        </Link>
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
            <option value="">{t("كل الكفلاء / كل الشركات", "All sponsors / companies")}</option>
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
          {employerId || employeeId ? (
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
              <select className={`${fieldClass} w-full`} name="employeeId" required defaultValue={employeeId || undefined}>
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
      {employeeId ? (
        <p className="mb-3 text-sm text-slate-600">
          {t("عرض موظف واحد —", "One employee —")}{" "}
          <Link href={clearEmployeeHref} className="font-semibold text-teal-800">
            {t("إظهار الجميع", "Show all")}
          </Link>
        </p>
      ) : null}
      <DocumentEmployeeList
        groups={groups}
        returnTo={returnTo}
        allow={allow}
        canEditEmployee={canEditEmployee}
        t={t}
        printBase={printBase}
      />
    </div>
  );
}
