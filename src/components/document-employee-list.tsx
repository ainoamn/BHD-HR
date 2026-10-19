"use client";

import Link from "next/link";
import { ChevronDown, Paperclip, Printer } from "lucide-react";
import { DeleteButton, DocumentEditForm } from "@/components/row-forms";
import { ToneBadge, linkAction, secondaryBtn } from "@/components/ui";
import type { DocView } from "@/lib/documents";
import type { ExpiryInfo } from "@/lib/expiry";
import { formatDate, text } from "@/lib/utils";
import { deleteDocument, updateDocument } from "@/server/document-actions";

export type DocumentEmployeeGroup = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  labels: string[];
  worst: ExpiryInfo;
  rows: (DocView & { status: ExpiryInfo })[];
};

/** One row per employee: name + count / names, with expand for every document and a print link. */
export function DocumentEmployeeList({
  groups,
  returnTo,
  allow,
  canEditEmployee,
  t,
  printBase,
}: {
  groups: DocumentEmployeeGroup[];
  returnTo: string;
  allow: { edit: boolean; remove: boolean };
  canEditEmployee: boolean;
  t: (ar: string, en: string) => string;
  printBase: string;
}) {
  const showActions = allow.edit || allow.remove || canEditEmployee;
  if (!groups.length) {
    return (
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <p className="text-sm text-slate-500">{t("لا توجد مستندات في هذا العرض.", "No documents in this view.")}</p>
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-2xl border border-slate-200/90 bg-surface shadow-card">
      {groups.map((group) => {
        const printHref = `${printBase}${printBase.includes("?") ? "&" : "?"}employeeId=${group.employeeId}&download=1`;
        const names =
          group.labels.length > 4
            ? `${group.labels.slice(0, 4).join("، ")} +${group.labels.length - 4}`
            : group.labels.join("، ");
        return (
          <li key={group.employeeId} className="border-t border-slate-100 first:border-t-0">
            <details className="group/row">
              <summary className="flex list-none flex-wrap items-center gap-3 px-4 py-3.5 marker:content-none sm:flex-nowrap">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/employees/${group.employeeId}?tab=docs`}
                    className="font-semibold text-slate-900 hover:text-teal-700"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {group.employeeName}
                  </Link>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    <span className="tabular">{group.employeeNumber}</span>
                    {" · "}
                    {t(`${group.rows.length} مستند`, `${group.rows.length} document(s)`)}
                    {names ? ` — ${names}` : ""}
                  </span>
                </span>
                <ToneBadge tone={group.worst.tone}>{group.worst.label}</ToneBadge>
                <Link href={printHref} className={`${secondaryBtn} px-3 py-2`} onClick={(event) => event.stopPropagation()}>
                  <Printer size={15} />
                  {t("طباعة", "Print")}
                </Link>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open/row:rotate-180" />
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-2 sm:px-3">
                <div className="overflow-x-auto">
                  <table className="table-stack min-w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-start">{t("المستند", "Document")}</th>
                        <th className="px-3 py-2 text-start">{t("الرقم", "Number")}</th>
                        <th className="px-3 py-2 text-start">{t("الانتهاء", "Expiry")}</th>
                        <th className="px-3 py-2 text-start">{t("الحالة", "Status")}</th>
                        {showActions ? <th className="px-3 py-2 text-end">{t("إجراءات", "Actions")}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.key} className="bg-surface">
                          <td className="px-3 py-2.5" data-label={t("المستند", "Document")}>
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
                          <td className="tabular px-3 py-2.5" data-label={t("الرقم", "Number")}>
                            <span dir="ltr">{text(row.number)}</span>
                          </td>
                          <td className="tabular whitespace-nowrap px-3 py-2.5" data-label={t("الانتهاء", "Expiry")}>
                            {formatDate(row.expiry)}
                          </td>
                          <td className="px-3 py-2.5" data-label={t("الحالة", "Status")}>
                            <ToneBadge tone={row.status.tone}>{row.status.label}</ToneBadge>
                          </td>
                          {showActions ? (
                            <td className="cell-actions px-3 py-2.5">
                              {row.document ? (
                                <div className="flex flex-wrap items-start gap-3 sm:justify-end">
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
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
