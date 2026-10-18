"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Building2, CircleAlert, CircleCheck, FileText, Loader2, Save, Sparkles, Trash2, UserCheck } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { GAP_LABEL } from "@/lib/employee-gaps";
import { nationalityOptions } from "@/lib/nationalities";
import { readLabourFile, saveLabourFile, type LabourSaveResult, type LabourWorkerRead } from "@/server/labour-file-actions";

type Worker = LabourWorkerRead & { update: boolean; skip: boolean };
type Item = {
  key: string;
  file: File;
  status: "waiting" | "reading" | "read" | "error" | "saving" | "saved";
  title?: string;
  formKindLabel?: string;
  summary?: { omani: number; expat: number; unknown: number; total: number };
  workers: Worker[];
  error?: string;
  result?: LabourSaveResult;
};

const FIELDS: { key: string; type?: "date" | "nationality" | "gender" | "kind" | "number" }[] = [
  { key: "fullName" },
  { key: "nameEn" },
  { key: "nationality", type: "nationality" },
  { key: "gender", type: "gender" },
  { key: "dateOfBirth", type: "date" },
  { key: "phone" },
  { key: "idNumber" },
  { key: "idExpiry", type: "date" },
  { key: "passportNumber" },
  { key: "passportExpiry", type: "date" },
  { key: "residenceNumber" },
  { key: "residenceExpiry", type: "date" },
  { key: "visaNumber" },
  { key: "visaExpiry", type: "date" },
  { key: "workPermitNumber" },
  { key: "workPermitExpiry", type: "date" },
  { key: "jobTitle" },
  { key: "jobTitleEn" },
  { key: "arrivalDate", type: "date" },
  { key: "joiningDate", type: "date" },
  { key: "contractEnd", type: "date" },
  { key: "basicSalary", type: "number" },
  { key: "housingAllowance", type: "number" },
  { key: "transportAllowance", type: "number" },
  { key: "address" },
  { key: "employerName" },
  { key: "employerNameEn" },
  { key: "employerIdNumber" },
  { key: "employerKind", type: "kind" },
];

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/**
 * Ministry of Labour worker files (PDF or photo) → AI reads every worker on each file → the user checks and edits
 * the values → save. Nothing is stored before "Save"; then the missing details of each employee are listed.
 */
export function LabourFileImport({ labels, canUpdate, canAddSponsor }: { labels: Record<string, string>; canUpdate: boolean; canAddSponsor: boolean }) {
  const { lang, t } = useLang();
  const [items, setItems] = useState<Item[]>([]);
  const counter = useRef(0);
  const nationalities = useMemo(() => nationalityOptions(lang), [lang]);

  const patch = (key: string, change: Partial<Item> | ((item: Item) => Partial<Item>)) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...(typeof change === "function" ? change(item) : change) } : item)));

  async function read(item: Item) {
    patch(item.key, { status: "reading", error: undefined });
    const form = new FormData();
    form.append("file", item.file);
    try {
      const result = await readLabourFile(form);
      if (result.error || !result.workers) patch(item.key, { status: "error", error: result.error });
      else
        patch(item.key, {
          status: "read",
          title: result.title,
          formKindLabel: result.formKindLabel,
          summary: result.summary,
          workers: result.workers.map((worker) => ({ ...worker, update: false, skip: false })),
        });
    } catch {
      patch(item.key, { status: "error", error: t("انقطع الاتصال. أعد المحاولة.", "Connection lost. Try again.") });
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added = [...files].slice(0, 20).map<Item>((file) => ({ key: `f${(counter.current += 1)}`, file, status: "waiting", workers: [] }));
    setItems((list) => [...list, ...added]);
    let next = 0;
    const run = async () => {
      while (next < added.length) await read(added[next++]);
    };
    await Promise.all([run(), run()]);
  }

  async function save(item: Item) {
    const done = new Set(item.result?.saved?.map((entry) => entry.index));
    const chosen = item.workers.map((worker, index) => ({ worker, index })).filter(({ worker, index }) => !worker.skip && !done.has(index));
    if (!chosen.length) return;
    patch(item.key, { status: "saving" });
    const form = new FormData();
    form.append("file", item.file);
    form.append("title", item.title ?? "");
    form.append("workers", JSON.stringify(chosen.map(({ worker }) => ({ values: worker.values, update: worker.update }))));
    try {
      const result = await saveLabourFile(form);
      if (result.error) {
        patch(item.key, { status: "read", error: result.error });
        return;
      }
      const map = (index: number) => chosen[index].index;
      const saved = [...(item.result?.saved ?? []), ...(result.saved ?? []).map((entry) => ({ ...entry, index: map(entry.index) }))];
      const failed = Object.fromEntries(Object.entries(result.failed ?? {}).map(([index, message]) => [map(Number(index)), message]));
      const complete = item.workers.every((worker, index) => worker.skip || saved.some((entry) => entry.index === index));
      patch(item.key, { status: complete ? "saved" : "read", result: { saved, failed }, error: undefined });
    } catch {
      patch(item.key, { status: "read", error: t("انقطع الاتصال. أعد المحاولة.", "Connection lost. Try again.") });
    }
  }

  async function saveAll() {
    for (const item of items) if (item.status === "read") await save(item);
  }

  const setValue = (item: Item, index: number, key: string, value: string) =>
    patch(item.key, (current) => ({
      workers: current.workers.map((worker, position) => (position === index ? { ...worker, values: { ...worker.values, [key]: value } } : worker)),
    }));
  const setFlag = (item: Item, index: number, flag: "update" | "skip", value: boolean) =>
    patch(item.key, (current) => ({ workers: current.workers.map((worker, position) => (position === index ? { ...worker, [flag]: value } : worker)) }));

  const pending = (item: Item) => item.workers.filter((worker, index) => !worker.skip && !item.result?.saved?.some((entry) => entry.index === index)).length;
  const ready = items.filter((item) => item.status === "read").length;
  const busy = items.some((item) => item.status === "reading" || item.status === "waiting" || item.status === "saving");

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/60 px-4 py-8 text-center transition hover:border-teal-500">
        <FileText size={28} className="text-teal-700" />
        <span className="text-sm font-semibold text-slate-800">
          {t("اختر مستندات بوابة وزارة العمل (PDF أو صور) — عدة ملفات دفعة واحدة", "Choose Ministry of Labour portal documents (PDF or images) — several files at once")}
        </span>
        <span className="text-xs text-slate-500">
          {t(
            "تسجيل بيانات العامل، تصريح مزاولة العمل، بطاقة العمل، قائمة عمال، عقد، تجديد — عمانيون ووافدون · حتى 4 ميغابايت و20 ملفاً",
            "Registering worker details, work permit, labour card, worker list, contract, renewal — Omanis and expatriates · up to 4 MB and 20 files",
          )}
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {ready > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => void saveAll()}>
            <Save size={16} />
            {t(`حفظ الكل (${ready} ملفات)`, `Save all (${ready} files)`)}
          </button>
        </div>
      ) : null}

      {items.map((item) => (
        <section key={item.key} className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-surface p-4">
          <header className="flex flex-wrap items-center gap-2">
            <FileText size={18} className="shrink-0 text-teal-700" />
            <span className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-800">
              {item.file.name}
              {item.formKindLabel ? <span className="ms-2 rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">{item.formKindLabel}</span> : null}
              {item.title ? <span className="ms-2 font-normal text-slate-500">— {item.title}</span> : null}
            </span>
            {item.status === "waiting" || item.status === "reading" ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-teal-700">
                <Loader2 size={14} className="animate-spin" />
                {item.status === "waiting" ? t("في الانتظار", "Waiting") : t("الذكاء الاصطناعي يقرأ الملف...", "AI is reading the file...")}
              </span>
            ) : null}
            {item.status === "saving" ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-teal-700">
                <Loader2 size={14} className="animate-spin" />
                {t("جارٍ الحفظ...", "Saving...")}
              </span>
            ) : null}
            {item.status !== "reading" && item.status !== "saving" ? (
              <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-700" aria-label={t("إزالة", "Remove")} onClick={() => setItems((list) => list.filter((entry) => entry.key !== item.key))}>
                <Trash2 size={16} />
              </button>
            ) : null}
          </header>

          {item.error ? (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
              <CircleAlert size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{item.error}</span>
              {item.status === "error" ? (
                <button type="button" className="shrink-0 font-semibold underline" onClick={() => void read(item)}>
                  {t("إعادة المحاولة", "Retry")}
                </button>
              ) : null}
            </p>
          ) : null}

          {item.summary && item.status === "read" ? (
            <p className="text-xs text-slate-600">
              {t(`${item.summary.total} عامل`, `${item.summary.total} worker(s)`)}
              {item.summary.omani ? ` · ${t(`${item.summary.omani} عماني`, `${item.summary.omani} Omani`)}` : ""}
              {item.summary.expat ? ` · ${t(`${item.summary.expat} وافد`, `${item.summary.expat} expatriate(s)`)}` : ""}
              {item.summary.unknown ? ` · ${t(`${item.summary.unknown} بلا جنسية`, `${item.summary.unknown} without nationality`)}` : ""}
            </p>
          ) : null}

          {item.result?.saved?.some((entry) => entry.gaps.length) ? (
            <Link href="/employees/complete" className="text-sm font-semibold text-amber-900 underline">
              {t("أكمل البيانات الناقصة لكل من أُضيف دفعة واحدة", "Complete missing details for everyone added in this batch")}
            </Link>
          ) : null}

          {item.workers.map((worker, index) => {
            const saved = item.result?.saved?.find((entry) => entry.index === index);
            const failed = item.result?.failed?.[index];
            if (saved) {
              return (
                <div key={index} className="space-y-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm ring-1 ring-inset ring-emerald-200">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-emerald-800">
                    <CircleCheck size={16} />
                    {saved.created
                      ? t(`أُضيف: ${saved.name}`, `Added: ${saved.name}`)
                      : saved.attached
                        ? t(`أُرفق الملف بملف: ${saved.name}`, `File attached to: ${saved.name}`)
                        : t(`حُدّثت بيانات: ${saved.name}`, `Updated: ${saved.name}`)}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-emerald-800">
                    <FileText size={14} className="shrink-0" />
                    {t("حُفظ الملف في مستندات الموظف باسم «مرفق بيانات وزارة العمل».", "The file is kept in the employee's documents as “Ministry of Labour data attachment”.")}
                    <Link href={`/employees/${saved.id}?tab=docs`} className="font-semibold underline">
                      {t("عرض المستندات", "View documents")}
                    </Link>
                  </p>
                  {saved.gaps.length ? (
                    <div className="space-y-2">
                      <p className="text-amber-800">
                        {t("بيانات ناقصة: ", "Missing: ")}
                        {saved.gaps.map((gap) => GAP_LABEL[gap][lang]).join("، ")}
                      </p>
                      <Link href={`/employees/${saved.id}/edit?complete=1`} className={secondaryBtn}>
                        {t("أكمل البيانات", "Complete details")}
                      </Link>
                    </div>
                  ) : (
                    <p className="text-emerald-800">{t("الملف مكتمل.", "The file is complete.")}</p>
                  )}
                </div>
              );
            }
            if (item.status === "saved") return null;
            return (
              <div key={index} className={`min-w-0 space-y-3 rounded-xl p-3 ring-1 ring-inset ${worker.skip ? "opacity-60 ring-slate-200" : worker.existing ? "bg-amber-50 ring-amber-200" : "ring-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Sparkles size={15} className="text-teal-700" />
                  <span className="font-semibold text-slate-800">
                    {item.workers.length > 1 ? t(`العامل ${index + 1}`, `Worker ${index + 1}`) : t("بيانات العامل المقروءة", "Worker data read")}
                  </span>
                  <span className="text-xs text-slate-500">{t("راجعها وعدّل ما يلزم قبل الحفظ", "Check and edit before saving")}</span>
                  <label className="ms-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={worker.skip} onChange={(event) => setFlag(item, index, "skip", event.target.checked)} className="size-4 accent-teal-700" />
                    {t("لا تحفظ هذا العامل", "Don't save this worker")}
                  </label>
                </div>

                {worker.existing ? (
                  <div className="space-y-1.5 text-sm text-amber-900">
                    <p className="flex items-start gap-2">
                      <UserCheck size={16} className="mt-0.5 shrink-0" />
                      <span>
                        {t("هذا الموظف موجود سابقاً: ", "This employee is already on record: ")}
                        <Link href={`/employees/${worker.existing.id}`} target="_blank" className="font-semibold underline">
                          {worker.existing.fullName} ({worker.existing.employeeNumber})
                        </Link>
                      </span>
                    </p>
                    <p className="text-xs">
                      {t(
                        "عند الحفظ يُرفق الملف بملفه باسم «مرفق بيانات وزارة العمل» دون تغيير بياناته.",
                        "On save the file is attached to their record as “Ministry of Labour data attachment” without changing their data.",
                      )}
                    </p>
                    {canUpdate ? (
                      <label className="flex items-start gap-2 font-medium">
                        <input type="checkbox" checked={worker.update} onChange={(event) => setFlag(item, index, "update", event.target.checked)} className="mt-1 size-4 accent-teal-700" />
                        {t("حدّث بياناته أيضاً بما قُرئ من الملف", "Also update their data with what was read")}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {worker.values.employerName || worker.values.employerNameEn || worker.values.employerIdNumber ? (
                  <p className="flex items-start gap-2 text-xs text-slate-600">
                    <Building2 size={14} className="mt-0.5 shrink-0 text-teal-700" />
                    {worker.sponsor
                      ? t(`الكفيل مسجل لديك: ${worker.sponsor.name} — سيُربط به الموظف.`, `Sponsor on record: ${worker.sponsor.name} — the employee will be linked.`)
                      : canAddSponsor
                        ? t("الكفيل غير مسجل — سيُفتح كفيل جديد ببياناته تلقائياً عند الحفظ.", "Sponsor not on record — a new sponsor will be opened with these details on save.")
                        : t("الكفيل غير مسجل ولا تملك صلاحية إضافة الكفلاء؛ سيُحفظ الموظف بلا كفيل.", "Sponsor not on record and you can't add sponsors; the employee is saved without one.")}
                  </p>
                ) : null}

                {worker.errors.length ? (
                  <ul className="space-y-0.5 text-xs text-red-700">
                    {worker.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
                {failed ? <p className="text-xs font-medium text-red-700">{failed}</p> : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map((field) => {
                    const value = worker.values[field.key] ?? "";
                    const change = (next: string) => setValue(item, index, field.key, next);
                    const empty = !value && ["fullName", "idNumber", "nationality", "dateOfBirth"].includes(field.key);
                    return (
                      <label key={field.key} className="block min-w-0 space-y-1">
                        <span className={`block text-xs font-medium ${empty ? "text-amber-700" : "text-slate-600"}`}>{labels[field.key] ?? field.key}</span>
                        {field.type === "nationality" ? (
                          <select value={value} onChange={(event) => change(event.target.value)} className={`${fieldClass} w-full`}>
                            <option value="">—</option>
                            {nationalities.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "gender" ? (
                          <select value={value} onChange={(event) => change(event.target.value)} className={`${fieldClass} w-full`}>
                            <option value="">—</option>
                            <option value="MALE">{t("ذكر", "Male")}</option>
                            <option value="FEMALE">{t("أنثى", "Female")}</option>
                          </select>
                        ) : field.type === "kind" ? (
                          <select value={value} onChange={(event) => change(event.target.value)} className={`${fieldClass} w-full`}>
                            <option value="">—</option>
                            <option value="COMPANY">{t("شركة / مؤسسة", "Company")}</option>
                            <option value="PERSON">{t("فرد", "Individual")}</option>
                          </select>
                        ) : (
                          <input
                            type={field.type === "date" ? "date" : "text"}
                            inputMode={field.type === "number" ? "decimal" : undefined}
                            dir={field.type || /Number|En$|phone/.test(field.key) ? "ltr" : undefined}
                            value={value}
                            onChange={(event) => change(event.target.value)}
                            className={`${fieldClass} w-full`}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {item.status === "read" && item.workers.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primaryBtn} disabled={!pending(item)} onClick={() => void save(item)}>
                <Save size={16} />
                {item.workers.length > 1 ? t(`حفظ ${pending(item)} موظفين`, `Save ${pending(item)} employees`) : t("حفظ الموظف", "Save employee")}
              </button>
              <span className="text-xs text-slate-500">{t("يُحفظ الملف نفسه في مستندات كل موظف باسم «مرفق بيانات وزارة العمل».", "The file itself is kept in each employee's documents as “Ministry of Labour data attachment”.")}</span>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
