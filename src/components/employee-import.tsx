"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, FileSpreadsheet, Sparkles, Upload, UserCheck } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { fieldClass } from "@/components/ui";
import { importEmployees, previewEmployeeImport, type ImportPreview } from "@/server/import-actions";

const SHOWN = ["fullName", "nationality", "idNumber", "passportNumber", "jobTitle", "employerName", "joiningDate", "basicSalary"] as const;

/** Upload → check every row → import the rows without problems. Nothing is saved before the second step. */
export function EmployeeImport({ labels, canUpdate }: { labels: Record<string, string>; canUpdate: boolean }) {
  const { t } = useLang();
  const [preview, upload, pending] = useActionState<ImportPreview | null, FormData>(previewEmployeeImport, null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [sponsorId, setSponsorId] = useState("");
  useEffect(() => setSponsorId(""), [preview?.fileName]);
  const valid = useMemo(() => preview?.rows.filter((row) => !row.errors.length) ?? [], [preview]);
  const fresh = valid.filter((row) => !row.existing).length;
  const existing = valid.length - fresh;
  const invalid = (preview?.rows.length ?? 0) - valid.length;
  const count = fresh + (updateExisting ? existing : 0);

  return (
    <div className="space-y-5">
      <form action={upload} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-64 space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">{t("ملف Excel ‏(‎.xlsx) أو CSV", "Excel (.xlsx) or CSV file")}</span>
          <input type="file" name="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className={`${fieldClass} w-full`} />
        </label>
        <SubmitButton pendingLabel={t("جارٍ الفحص...", "Checking...")}>
          <Upload size={16} />
          {t("فحص الملف", "Check file")}
        </SubmitButton>
      </form>

      {preview?.error ? (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {preview.error}
        </p>
      ) : null}

      {preview && !preview.error && !pending ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 break-all font-semibold text-slate-800">
              <FileSpreadsheet size={16} className="shrink-0 text-teal-700" />
              {preview.fileName}
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CircleCheck size={16} />
              {t(`${fresh} موظف جديد`, `${fresh} new`)}
            </span>
            {existing ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <UserCheck size={16} />
                {t(`${existing} موجود مسبقاً`, `${existing} already on record`)}
              </span>
            ) : null}
            {invalid ? (
              <span className="inline-flex items-center gap-1.5 text-red-700">
                <CircleAlert size={16} />
                {t(`${invalid} صف فيه أخطاء ولن يُستورد`, `${invalid} with errors will be skipped`)}
              </span>
            ) : null}
          </div>
          {preview.aiColumns?.length ? (
            <p className="flex items-start gap-1.5 text-xs text-teal-800">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <span>
                {t("أعمدة تعرّف عليها الذكاء الاصطناعي: ", "Columns recognised by AI: ")}
                {preview.aiColumns.map((column) => `${column.header} ← ${labels[column.key] ?? column.key}`).join("، ")}
              </span>
            </p>
          ) : null}
          {preview.ignored.length ? (
            <p className="text-xs text-slate-500">
              {t("أعمدة لم تُعرف وتُركت: ", "Columns not recognised and left out: ")}
              {preview.ignored.join("، ")}
            </p>
          ) : null}
          {preview.tooMany ? <p className="text-xs text-amber-700">{t("الملف فيه أكثر من 500 صف؛ عُرض أول 500 فقط.", "The file has more than 500 rows; only the first 500 are shown.")}</p> : null}

          {existing ? (
            <div className="space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200" role="status">
              <p className="flex items-start gap-2">
                <CircleAlert size={17} className="mt-0.5 shrink-0" />
                {t(
                  `تنبيه: ${existing} من الموظفين في الملف مسجلون مسبقاً (نفس الرقم المدني أو الجواز أو تصريح العمل). لن يُضافوا مرة ثانية.`,
                  `Note: ${existing} employee(s) in the file are already on record (same civil, passport or work permit number). They won't be added twice.`,
                )}
              </p>
              {canUpdate ? (
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} className="mt-1 size-4 accent-teal-700" />
                  {t("تحديث بيانات الموظفين الموجودين بقيم الملف (الخانات الفارغة في الملف لا تمسح شيئاً)", "Update existing employees with the file's values (empty cells in the file erase nothing)")}
                </label>
              ) : null}
            </div>
          ) : null}

          {preview.needsSponsor ? (
            <div className="space-y-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-inset ring-sky-200" role="status">
              <p>
                {t(
                  "ملاحظة: الملف لا يحتوي على اسم كفيل. هل تريد اختيار كفيل لتسجيل بيانات العمال باسمه؟",
                  "Note: this file has no sponsor name. Do you want to choose a sponsor and register the workers under that name?",
                )}
              </p>
              {preview.sponsors?.length ? (
                <label className="block max-w-md space-y-1">
                  <span className="text-xs font-semibold">{t("الكفيل", "Sponsor")}</span>
                  <select value={sponsorId} onChange={(event) => setSponsorId(event.target.value)} className={fieldClass}>
                    <option value="">{t("بدون كفيل — أكمل لاحقاً", "No sponsor — complete later")}</option>
                    {preview.sponsors.map((sponsor) => (
                      <option key={sponsor.id} value={sponsor.id}>
                        {sponsor.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  <Link href="/employers" className="font-semibold underline">
                    {t("لا يوجد كفيل في دفتر العناوين. أضف كفيلاً أولاً.", "There is no sponsor in the address book. Add one first.")}
                  </Link>
                </p>
              )}
            </div>
          ) : null}

          <div className="max-h-[60vh] overflow-auto rounded-xl ring-1 ring-inset ring-slate-200">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{t("السطر", "Line")}</th>
                  {SHOWN.map((key) => (
                    <th key={key} className="px-3 py-2 text-start font-semibold">
                      {labels[key]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-start font-semibold">{t("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((row) => (
                  <tr key={row.line} className={row.errors.length ? "bg-red-50" : row.existing ? "bg-amber-50" : undefined}>
                    <td className="px-3 py-2 text-slate-500" dir="ltr">
                      {row.line}
                    </td>
                    {SHOWN.map((key) => (
                      <td key={key} className="max-w-[14rem] truncate px-3 py-2 text-slate-800">
                        {row.values[key] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {row.errors.length ? (
                        <ul className="space-y-0.5 text-xs text-red-700">
                          {row.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      ) : row.existing ? (
                        <span className="block text-xs text-amber-800">
                          {t("موجود مسبقاً: ", "On record: ")}
                          <Link href={`/employees/${row.existing.id}/edit`} className="font-semibold underline" target="_blank">
                            {row.existing.fullName} ({row.existing.employeeNumber})
                          </Link>
                        </span>
                      ) : (
                        <CircleCheck size={16} className="text-emerald-700" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {count ? (
            <form action={importEmployees}>
              <input type="hidden" name="payload" value={JSON.stringify(valid.filter((row) => updateExisting || !row.existing).map((row) => row.values))} />
              {updateExisting ? <input type="hidden" name="updateExisting" value="on" /> : null}
              {sponsorId ? <input type="hidden" name="sponsorId" value={sponsorId} /> : null}
              <SubmitButton
                pendingLabel={t("جارٍ الحفظ...", "Saving...")}
                confirm={
                  updateExisting && existing
                    ? t(`إضافة ${fresh} موظفاً جديداً وتحديث بيانات ${existing}؟`, `Add ${fresh} new employee(s) and update ${existing}?`)
                    : t(`إضافة ${fresh} موظفاً إلى النظام؟`, `Add ${fresh} employee(s) to the system?`)
                }
              >
                {updateExisting && existing ? t(`حفظ ${count} موظفاً`, `Save ${count} employee(s)`) : t(`استيراد ${fresh} موظفاً`, `Import ${fresh} employee(s)`)}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
