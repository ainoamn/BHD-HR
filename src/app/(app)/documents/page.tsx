import Link from "next/link";
import { Flash } from "@/components/flash";
import { DeleteButton, DocumentEditForm } from "@/components/row-forms";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, ToneBadge, fieldClass } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { DOC_LABEL, EXTRA_DOC_TYPES } from "@/lib/constants";
import { collectDocuments } from "@/lib/documents";
import { describeExpiry } from "@/lib/expiry";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, text } from "@/lib/utils";
import { addDocument, deleteDocument, updateDocument } from "@/server/document-actions";

const VIEW_IDS = ["all", "expired", "warning", "early"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string; message?: string }> }) {
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
  const returnTo = `/documents?view=${view}`;
  const allow = { create: can(user, "documents.create"), edit: can(user, "documents.edit"), remove: can(user, "documents.delete") };
  const canEditEmployee = can(user, "employees.edit");
  const showActions = allow.edit || allow.remove || canEditEmployee;
  const limits = {
    urgent: user.company.alertUrgentDays,
    warning: user.company.alertWarningDays,
    early: user.company.alertEarlyDays,
  };
  const employees = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" } },
    include: { documents: true },
    orderBy: { fullName: "asc" },
  });
  const rows = collectDocuments(employees, lang)
    .map((row) => ({ ...row, status: describeExpiry(row.expiry, limits, lang) }))
    .filter((row) => {
      if (view === "expired") return row.status.key === "expired" || row.status.key === "today";
      if (view === "warning") return ["expired", "today", "urgent", "warning"].includes(row.status.key);
      if (view === "early") return row.status.key !== "ok" && row.status.key !== "none";
      return true;
    })
    .sort((a, b) => a.status.days - b.status.days);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("المستندات", "Documents")}
        description={t("البطاقة والجواز والإقامة وبقية الوثائق، مع حالة الانتهاء.", "ID card, passport, residence and other documents, with expiry status.")}
      />
      <Flash error={sp.error} message={sp.message} />
      {allow.create && employees.length ? (
        <details className="group mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer list-none font-bold text-teal-800">
            <span className="group-open:hidden">+ </span>
            <span className="hidden group-open:inline">− </span>
            {t("إضافة مستند", "Add a document")}
          </summary>
          <form action={addDocument} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="returnTo" value={returnTo} />
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
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {views.map((item) => (
          <Link
            key={item.id}
            href={`/documents?view=${item.id}`}
            className={item.id === view ? "rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white" : "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="px-4 py-3 text-start">{t("الموظف", "Employee")}</th>
              <th className="px-4 py-3 text-start">{t("المستند", "Document")}</th>
              <th className="px-4 py-3 text-start">{t("الرقم", "Number")}</th>
              <th className="px-4 py-3 text-start">{t("الانتهاء", "Expiry")}</th>
              <th className="px-4 py-3 text-start">{t("الحالة", "Status")}</th>
              {showActions ? <th className="px-4 py-3 text-start">{t("إجراءات", "Actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/employees/${row.employeeId}?tab=docs`} className="font-semibold hover:text-teal-800">
                    {row.employeeName}
                  </Link>
                  <div className="text-xs text-slate-500">{row.employeeNumber}</div>
                </td>
                <td className="px-4 py-3">
                  {row.label}
                  {row.fileUrl ? (
                    <a href={row.fileUrl} target="_blank" className="ms-2 text-xs font-semibold text-teal-800">
                      {t("ملف", "File")}
                    </a>
                  ) : null}
                </td>
                <td className="px-4 py-3">{text(row.number)}</td>
                <td className="px-4 py-3">{formatDate(row.expiry)}</td>
                <td className="px-4 py-3">
                  <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                </td>
                {showActions ? (
                  <td className="px-4 py-3">
                    {row.document ? (
                      <div className="flex flex-wrap items-start gap-3">
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
                      <Link href={`/employees/${row.employeeId}/edit`} className="text-xs font-semibold text-teal-800 hover:underline">
                        {t("تعديل من بيانات الموظف", "Edit in employee record")}
                      </Link>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{t("لا توجد مستندات في هذا العرض.", "No documents in this view.")}</p> : null}
      </div>
    </div>
  );
}
