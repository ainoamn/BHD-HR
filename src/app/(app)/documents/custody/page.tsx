import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Clock3, FileCheck2, FolderLock, UserRound } from "lucide-react";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { DeleteButton } from "@/components/row-forms";
import { SearchSelect } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, PageHeader, Stat, ToneBadge, fieldClass, linkAction, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { CUSTODY_DIRECTION, HELD_DOC_LABEL, HELD_DOC_TYPES, HELD_STATUS_LABEL, HELD_STATUS_TONE, heldDocLabel, overdueWhere } from "@/lib/custody";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDate, todayInputValue } from "@/lib/utils";
import { deleteHeldDocument, handOverOriginals, receiveOriginals, updateHeldDocument } from "@/server/custody-actions";

const VIEWS = ["held", "out", "overdue", "forms"] as const;
const NEW_ROWS = 4;

export default async function CustodyPage({ searchParams }: { searchParams: Promise<{ view?: string; employee?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("documents.view");
  const { lang, t } = await getI18n();
  const view = (VIEWS as readonly string[]).includes(sp.view || "") ? (sp.view as (typeof VIEWS)[number]) : "held";
  const allow = { create: can(user, "documents.create"), edit: can(user, "documents.edit"), remove: can(user, "documents.delete") };
  const companyId = user.companyId;
  const now = new Date();

  const [employees, counts, overdueCount, pendingAck, chosen] = await Promise.all([
    prisma.employee.findMany({ where: { companyId, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, nameEn: true, employeeNumber: true }, orderBy: { fullName: "asc" } }),
    prisma.heldDocument.groupBy({ by: ["status"], where: { companyId }, _count: true }),
    prisma.heldDocument.count({ where: overdueWhere(companyId, now) }),
    prisma.custodyForm.count({ where: { companyId, direction: "OUT", acknowledgedAt: null } }),
    sp.employee
      ? prisma.employee.findFirst({
          where: { id: sp.employee, companyId },
          select: {
            id: true,
            fullName: true,
            nameEn: true,
            employeeNumber: true,
            heldDocuments: { orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: { _count: { select: { items: true } } } },
          },
        })
      : null,
  ]);
  const count = (status: string) => counts.find((item) => item.status === status)?._count || 0;
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const employeeFilter = chosen ? { employeeId: chosen.id } : {};
  const query = (next: Record<string, string>) => {
    const params = new URLSearchParams({ view, ...(chosen ? { employee: chosen.id } : {}), ...next });
    return `/documents/custody?${params.toString()}`;
  };
  const returnTo = query({});

  const [documents, forms] = await Promise.all([
    view === "forms"
      ? []
      : prisma.heldDocument.findMany({
          where: view === "overdue" ? { ...overdueWhere(companyId, now), ...employeeFilter } : { companyId, status: view === "out" ? "OUT" : "HELD", ...employeeFilter },
          include: {
            employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true, status: true } },
            items: { orderBy: { form: { createdAt: "desc" } }, take: 1, include: { form: { select: { id: true, refNo: true, createdAt: true, direction: true, handedByName: true, receivedByName: true, acknowledgedAt: true } } } },
          },
          orderBy: view === "held" ? [{ employee: { fullName: "asc" } }, { createdAt: "asc" }] : [{ dueBack: "asc" }, { updatedAt: "desc" }],
          take: 400,
        }),
    view === "forms"
      ? prisma.custodyForm.findMany({
          where: { companyId, ...employeeFilter },
          include: { employee: { select: { id: true, fullName: true, nameEn: true } }, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
  ]);

  const tabs = [
    { id: "held", label: t("محفوظة لدى المنشأة", "Held by the company"), count: count("HELD") },
    { id: "out", label: t("مع الموظفين", "With employees"), count: count("OUT") },
    { id: "overdue", label: t("متأخرة الإعادة", "Overdue"), count: overdueCount },
    { id: "forms", label: t("سجل الاستمارات", "Forms log"), count: null },
  ];
  const held = chosen?.heldDocuments.filter((doc) => doc.status === "HELD") || [];
  const out = chosen?.heldDocuments.filter((doc) => doc.status === "OUT") || [];

  return (
    <div className="page-wide">
      <PageHeader
        icon={FolderLock}
        title={t("المستندات الأصلية في العهدة", "Original documents in custody")}
        description={t(
          "جوازات الموظفين وبطاقاتهم وشهاداتهم الأصلية المحفوظة لدى المنشأة: استمارات استلام وتسليم مرقّمة، وإقرار الموظف إلكترونياً، ومن استلم ومن أعاد ومن تأخر.",
          "Employees' original passports, cards and certificates kept by the company: numbered receipt and handover forms, the employee's online acknowledgement, and who took, returned or is late returning them.",
        )}
      >
        <Link href="/documents" className={secondaryBtn}>
          {t("المستندات وتواريخ الانتهاء", "Documents & expiry")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat icon={FolderLock} label={t("محفوظة لدى المنشأة", "Held by the company")} value={String(count("HELD"))} />
        <Stat icon={UserRound} tone="navy" label={t("مع الموظفين", "With employees")} value={String(count("OUT"))} />
        <Stat icon={Clock3} tone="gold" label={t("متأخرة الإعادة", "Overdue")} value={String(overdueCount)} />
        <Stat icon={FileCheck2} label={t("تسليم بانتظار إقرار الموظف", "Handovers awaiting acknowledgement")} value={String(pendingAck)} />
      </div>

      <Card className="mb-5">
        <GetForm className="grid items-end gap-2 sm:flex">
          <input type="hidden" name="view" value={view} />
          <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الموظف", "Employee")}
            <SearchSelect
              name="employee"
              defaultValue={chosen?.id || ""}
              emptyLabel={t("كل الموظفين", "All employees")}
              options={employees.map((employee) => ({ value: employee.id, label: nameOf(employee), hint: employee.employeeNumber }))}
            />
          </label>
          <button type="submit" className={secondaryBtn}>
            {t("فتح عهدة الموظف", "Open employee's custody")}
          </button>
        </GetForm>
        {!chosen ? (
          <p className="mt-3 text-sm text-slate-500">{t("اختر موظفاً لاستلام مستنداته الأصلية أو تسليمها له أو تسجيل إعادتها.", "Choose an employee to receive their originals, hand them over, or record their return.")}</p>
        ) : null}
      </Card>

      {chosen ? (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          {allow.create ? (
            <details className="group min-w-0 rounded-2xl border border-slate-200/90 bg-surface shadow-card" open={!chosen.heldDocuments.length}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="flex items-center gap-3 font-bold text-slate-900">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                    <ArrowDownToLine size={18} />
                  </span>
                  {t(`استلام أصول من ${nameOf(chosen)}`, `Receive originals from ${nameOf(chosen)}`)}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              <form action={receiveOriginals} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-5">
                <input type="hidden" name="employeeId" value={chosen.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                {out.length ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-semibold text-slate-700">{t("مستندات يعيدها الآن", "Documents being returned now")}</legend>
                    {out.map((doc) => (
                      <label key={doc.id} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm">
                        <input type="checkbox" name="returnIds" value={doc.id} className="mt-1 size-4 accent-teal-700" />
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-900">{pick(heldDocLabel(doc), lang)}</span>
                          {doc.documentNo ? <span className="block text-xs text-slate-500" dir="ltr">{doc.documentNo}</span> : null}
                          {doc.dueBack ? (
                            <span className={`block text-xs ${doc.dueBack < now ? "font-semibold text-red-700" : "text-slate-500"}`}>
                              {t(`موعد الإعادة ${formatDate(doc.dueBack)}`, `Due back ${formatDate(doc.dueBack)}`)}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-semibold text-slate-700">{t("مستندات أصلية جديدة", "New original documents")}</legend>
                  {Array.from({ length: NEW_ROWS }, (_, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-3">
                      <select name="type" defaultValue={index === 0 && !out.length ? "PASSPORT" : ""} aria-label={t("نوع المستند", "Document type")} className={`${fieldClass} w-full min-w-0`}>
                        <option value="">{t("— بلا —", "— none —")}</option>
                        {HELD_DOC_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {pick(HELD_DOC_LABEL[type], lang)}
                          </option>
                        ))}
                      </select>
                      <input name="title" maxLength={120} aria-label={t("الاسم (اختياري)", "Name (optional)")} placeholder={t("الاسم (اختياري)", "Name (optional)")} className={`${fieldClass} w-full min-w-0`} />
                      <input name="documentNo" maxLength={60} dir="ltr" aria-label={t("رقم المستند", "Document number")} placeholder={t("رقم المستند", "Document number")} className={`${fieldClass} w-full min-w-0`} />
                    </div>
                  ))}
                </fieldset>
                <Field label={t("ملاحظة على الاستمارة (اختياري)", "Note on the form (optional)")}>
                  <input name="purpose" maxLength={300} className={`${fieldClass} w-full`} placeholder={t("مثال: للحفظ طوال مدة العقد", "e.g. kept for the contract term")} />
                </Field>
                <SubmitButton className="w-full sm:w-auto">{t("إصدار استمارة الاستلام", "Issue receipt form")}</SubmitButton>
              </form>
            </details>
          ) : null}

          {allow.edit ? (
            <details className="group min-w-0 rounded-2xl border border-slate-200/90 bg-surface shadow-card" open={held.length > 0}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="flex items-center gap-3 font-bold text-slate-900">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
                    <ArrowUpFromLine size={18} />
                  </span>
                  {t(`تسليم أصول إلى ${nameOf(chosen)}`, `Hand originals to ${nameOf(chosen)}`)}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition duration-200 group-open:rotate-180" />
              </summary>
              {held.length ? (
                <form action={handOverOriginals} className="grid gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-5">
                  <input type="hidden" name="employeeId" value={chosen.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-semibold text-slate-700">{t("المستندات المحفوظة لدى المنشأة", "Documents held by the company")}</legend>
                    {held.map((doc) => (
                      <label key={doc.id} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm">
                        <input type="checkbox" name="documentIds" value={doc.id} className="mt-1 size-4 accent-teal-700" />
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-900">{pick(heldDocLabel(doc), lang)}</span>
                          {doc.documentNo ? <span className="block text-xs text-slate-500" dir="ltr">{doc.documentNo}</span> : null}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <Field label={t("الغرض", "Purpose")}>
                    <input name="purpose" maxLength={300} className={`${fieldClass} w-full`} placeholder={t("مثال: تجديد الإقامة، سفر", "e.g. residence renewal, travel")} />
                  </Field>
                  <Field
                    label={t("موعد الإعادة", "Due back")}
                    hint={t("اتركه فارغاً إذا سُلّمت نهائياً (مثل انتهاء الخدمة).", "Leave empty if handed over for good (e.g. leaving the company).")}
                  >
                    <input name="dueBack" type="date" min={todayInputValue()} className={`${fieldClass} w-full`} />
                  </Field>
                  <SubmitButton className="w-full sm:w-auto">{t("إصدار استمارة التسليم", "Issue handover form")}</SubmitButton>
                </form>
              ) : (
                <p className="border-t border-slate-100 px-4 py-5 text-sm text-slate-500 sm:px-5">{t("لا توجد مستندات أصلية محفوظة لهذا الموظف.", "No originals of this employee are held.")}</p>
              )}
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 overflow-x-auto pb-1">
        <nav className="segmented" aria-label={t("تصفية العهدة", "Filter custody")}>
          {tabs.map((item) => (
            <Link key={item.id} href={query({ view: item.id })} aria-current={item.id === view ? "page" : undefined}>
              {item.label}
              {item.count ? <span className="tabular ms-1.5 text-xs opacity-70">{item.count}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {view === "forms" ? (
        forms.length ? (
          <div className="table-shell">
            <table className="table-stack w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-3 py-2 text-start font-medium">{t("الاستمارة", "Form")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("المُسلِّم", "Handed by")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("المُستلِم", "Received by")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("الإقرار", "Acknowledgement")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td className="cell-title px-3 py-2.5" data-label={t("الاستمارة", "Form")}>
                      <Link href={`/documents/custody/${form.id}`} className="font-semibold text-slate-900 hover:text-teal-700">
                        <bdi dir="ltr">{form.refNo}</bdi>
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {pick(CUSTODY_DIRECTION[form.direction]?.short, lang, form.direction)} · {t(`${form._count.items} مستند`, `${form._count.items} document(s)`)} · {formatDate(form.createdAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الموظف", "Employee")}>
                      <Link href={query({ employee: form.employee.id, view: "forms" })} className="text-slate-800 hover:text-teal-700">
                        {nameOf(form.employee)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5" data-label={t("المُسلِّم", "Handed by")}>
                      {form.handedByName}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("المُستلِم", "Received by")}>
                      {form.receivedByName}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الإقرار", "Acknowledgement")}>
                      {form.acknowledgedAt ? (
                        <ToneBadge tone="green">{t(`أقرّ ${formatDate(form.acknowledgedAt)}`, `Acknowledged ${formatDate(form.acknowledgedAt)}`)}</ToneBadge>
                      ) : (
                        <ToneBadge tone="amber">{t("بانتظار إقرار الموظف", "Awaiting the employee")}</ToneBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={FileCheck2} title={t("لا توجد استمارات", "No forms")} text={t("تظهر هنا كل استمارة استلام أو تسليم مستندات أصلية.", "Every receipt or handover form of original documents appears here.")} />
        )
      ) : documents.length ? (
        <div className="table-shell">
          <table className="table-stack w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-3 py-2 text-start font-medium">{t("المستند", "Document")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("الموظف", "Employee")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("الحالة", "Status")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("آخر حركة", "Last movement")}</th>
                {allow.edit || allow.remove ? <th className="px-3 py-2 text-end font-medium">{t("إجراءات", "Actions")}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => {
                const last = doc.items[0]?.form;
                const late = doc.status === "OUT" && doc.dueBack && doc.dueBack < now;
                return (
                  <tr key={doc.id}>
                    <td className="cell-title px-3 py-2.5" data-label={t("المستند", "Document")}>
                      <span className="font-semibold text-slate-900">{pick(heldDocLabel(doc), lang)}</span>
                      {doc.documentNo ? (
                        <span className="block text-xs text-slate-500" dir="ltr">
                          {doc.documentNo}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الموظف", "Employee")}>
                      <Link href={query({ employee: doc.employee.id })} className={doc.employee.status === "TERMINATED" ? "font-semibold text-red-700 hover:underline" : "text-slate-800 hover:text-teal-700"}>
                        {nameOf(doc.employee)}
                      </Link>
                      <span className="tabular block text-xs text-slate-500">{doc.employee.employeeNumber}</span>
                    </td>
                    <td className="px-3 py-2.5" data-label={t("الحالة", "Status")}>
                      <ToneBadge tone={late ? "red" : HELD_STATUS_TONE[doc.status] || "slate"}>{pick(HELD_STATUS_LABEL[doc.status], lang, doc.status)}</ToneBadge>
                      {doc.status === "OUT" ? (
                        <span className={`block pt-1 text-xs ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>
                          {doc.dueBack ? t(`موعد الإعادة ${formatDate(doc.dueBack)}`, `Due back ${formatDate(doc.dueBack)}`) : t("سُلّم نهائياً", "Handed over for good")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5" data-label={t("آخر حركة", "Last movement")}>
                      {last ? (
                        <>
                          <Link href={`/documents/custody/${last.id}`} className={linkAction}>
                            <bdi dir="ltr">{last.refNo}</bdi>
                          </Link>
                          <span className="block text-xs text-slate-500">
                            {t(`سلّمه ${last.handedByName} · استلمه ${last.receivedByName}`, `Handed by ${last.handedByName} · received by ${last.receivedByName}`)}
                          </span>
                          <span className="block text-xs text-slate-500">{formatDate(last.createdAt)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {allow.edit || allow.remove ? (
                      <td className="cell-actions px-3 py-2.5">
                        <div className="flex flex-wrap items-start gap-4 sm:justify-end">
                          {allow.edit ? (
                            <details className="min-w-0">
                              <summary className={`${linkAction} cursor-pointer list-none`}>{t("تعديل", "Edit")}</summary>
                              <form action={updateHeldDocument} className="mt-2 grid min-w-56 gap-2">
                                <input type="hidden" name="id" value={doc.id} />
                                <input type="hidden" name="returnTo" value={returnTo} />
                                <select name="type" defaultValue={doc.type} aria-label={t("نوع المستند", "Document type")} className={`${fieldClass} w-full`}>
                                  {HELD_DOC_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {pick(HELD_DOC_LABEL[type], lang)}
                                    </option>
                                  ))}
                                </select>
                                <input name="title" defaultValue={doc.title || ""} maxLength={120} placeholder={t("الاسم (اختياري)", "Name (optional)")} className={`${fieldClass} w-full`} />
                                <input name="documentNo" defaultValue={doc.documentNo || ""} maxLength={60} dir="ltr" placeholder={t("رقم المستند", "Document number")} className={`${fieldClass} w-full`} />
                                <input name="notes" defaultValue={doc.notes || ""} maxLength={500} placeholder={t("ملاحظة", "Note")} className={`${fieldClass} w-full`} />
                                <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
                              </form>
                            </details>
                          ) : null}
                          {allow.remove && doc.status === "HELD" ? (
                            <DeleteButton
                              action={deleteHeldDocument}
                              fields={{ id: doc.id, returnTo }}
                              confirm={t("حذف هذا المستند المسجّل خطأً؟ لا يُحذف مستند له حركات تسليم.", "Delete this mistaken entry? Documents with handovers can't be deleted.")}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={FolderLock}
          title={view === "overdue" ? t("لا توجد مستندات متأخرة", "Nothing overdue") : t("لا توجد مستندات في هذا العرض", "No documents in this view")}
          text={t("اختر موظفاً أعلاه وأصدر استمارة استلام لتسجيل مستنداته الأصلية المحفوظة لدى المنشأة.", "Choose an employee above and issue a receipt form to record the originals the company keeps.")}
        />
      )}

      {chosen ? (
        <p className="mt-4 text-sm">
          <Link href={`/documents/custody?view=${view}`} className={linkAction}>
            {t("عرض كل الموظفين", "Show all employees")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
