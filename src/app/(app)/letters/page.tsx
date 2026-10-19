import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Archive, CheckCircle2, Clock3, Plus, ScrollText, Search, TriangleAlert } from "lucide-react";
import { ColumnHead } from "@/components/column-head";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { Card, EmptyState, PageHeader, SectionTitle, Stat, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { columnHiddenFields, compareNumber, compareText, includesText, readSort } from "@/lib/column-tools";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { DRAFT_STATUS, issueDueLetterDrafts, readDraftContent } from "@/lib/letter-drafts";
import { LETTER_KIND, LETTER_KINDS, WARNING_KINDS, isLetterKind, letterState, type LetterKind } from "@/lib/letters";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";

const COLUMNS = ["ref", "kind", "subject", "name", "date", "status"];

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    employeeId?: string;
    q?: string;
    state?: string;
    view?: string;
    sort?: string;
    dir?: string;
    fref?: string;
    fkind?: string;
    fsubject?: string;
    fname?: string;
    fdate?: string;
    fstatus?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("letters.view");
  const { lang, t } = await getI18n();
  await issueDueLetterDrafts(await requestOrigin(), user.companyId);
  const draftsView = sp.view === "drafts";
  const kind = sp.kind === "warnings" ? "warnings" : isLetterKind(sp.kind || "") ? sp.kind! : "";
  const state = ["unconfirmed", "pending", "cancelled"].includes(sp.state || "") ? sp.state! : "";
  const q = (sp.q || "").trim().slice(0, 100);
  const yearStart = new Date(Date.UTC(new Date().getFullYear(), 0, 1));

  const where: Prisma.LetterWhereInput = { companyId: user.companyId };
  const and: Prisma.LetterWhereInput[] = [];
  if (kind === "warnings") and.push({ kind: { in: WARNING_KINDS } });
  else if (kind) and.push({ kind });
  if (sp.employeeId) and.push({ employeeId: sp.employeeId });
  if (q) and.push({ OR: [{ refNo: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { employee: { fullName: { contains: q, mode: "insensitive" } } }] });
  if (state === "unconfirmed") and.push({ acknowledgedAt: null, cancelledAt: null });
  if (state === "pending") and.push({ cancelledAt: null, deliveries: { some: { status: "PENDING" } } });
  if (state === "cancelled") and.push({ cancelledAt: { not: null } });
  if (and.length) where.AND = and;

  const [letters, employees, yearCount, warningsYear, unconfirmed, pendingCopies, drafts] = await Promise.all([
    prisma.letter.findMany({
      where: draftsView ? { id: "" } : where,
      include: { employee: { select: { id: true, fullName: true, nameEn: true, employeeNumber: true } }, deliveries: { select: { status: true } } },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.employee.findMany({ where: { companyId: user.companyId }, select: { id: true, fullName: true, nameEn: true }, orderBy: { fullName: "asc" } }),
    prisma.letter.count({ where: { companyId: user.companyId, issuedAt: { gte: yearStart }, cancelledAt: null } }),
    prisma.letter.count({ where: { companyId: user.companyId, issuedAt: { gte: yearStart }, cancelledAt: null, kind: { in: WARNING_KINDS } } }),
    prisma.letter.count({ where: { companyId: user.companyId, acknowledgedAt: null, cancelledAt: null } }),
    prisma.letterDelivery.count({ where: { status: "PENDING", letter: { companyId: user.companyId, cancelledAt: null } } }),
    prisma.letterDraft.findMany({
      where: { companyId: user.companyId, OR: [{ status: { not: "ISSUED" } }, { issuedAt: { gte: new Date(Date.now() - 30 * 86400000) } }] },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    }),
  ]);
  const openDrafts = drafts.filter((draft) => draft.status !== "ISSUED").length;
  const draftNames = draftsView
    ? new Map(
        (await prisma.employee.findMany({ where: { companyId: user.companyId, id: { in: [...new Set(drafts.flatMap((draft) => draft.employeeIds))] } }, select: { id: true, fullName: true, nameEn: true } })).map((employee) => [
          employee.id,
          employee,
        ]),
      )
    : new Map();
  const nameOf = (employee: { fullName: string; nameEn: string | null }) => (lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName);
  const filtered = Boolean(kind || sp.employeeId || q || state);
  const locale = lang === "en" ? "en" : "ar";
  const rows = letters
    .map((letter) => ({
      letter,
      kindLabel: pick((LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL).label, lang),
      statusLabel: pick(letterState(letter).label, lang),
      name: nameOf(letter.employee),
    }))
    .filter(
      (row) =>
        includesText(row.letter.refNo, sp.fref) &&
        includesText(row.kindLabel, sp.fkind) &&
        includesText(row.letter.subject, sp.fsubject) &&
        includesText(`${row.name} ${row.letter.employee.employeeNumber}`, sp.fname) &&
        includesText(`${formatDate(row.letter.issuedAt)} ${row.letter.issuedAt.toISOString().slice(0, 10)}`, sp.fdate) &&
        includesText(row.statusLabel, sp.fstatus),
    );
  const { sort, dir: sortDir } = readSort(sp, COLUMNS, "date");
  // No sort chosen: newest letters first.
  const dir = sp.sort ? sortDir : "desc";
  rows.sort((a, b) => {
    if (sort === "ref") return compareText(a.letter.refNo, b.letter.refNo, dir, locale);
    if (sort === "kind") return compareText(a.kindLabel, b.kindLabel, dir, locale);
    if (sort === "subject") return compareText(a.letter.subject, b.letter.subject, dir, locale);
    if (sort === "name") return compareText(a.name, b.name, dir, locale);
    if (sort === "status") return compareText(a.statusLabel, b.statusLabel, dir, locale);
    return compareNumber(a.letter.issuedAt.getTime(), b.letter.issuedAt.getTime(), dir);
  });

  return (
    <div className="page-wide">
      <PageHeader
        icon={ScrollText}
        title={t("الإنذارات والخطابات", "Warnings & letters")}
        description={t(
          "إنذارات وخطابات رسمية للموظفين مع تأكيد الاستلام.",
          "Official warnings and letters to employees, with receipt confirmation.",
        )}
      >
        <Link href={draftsView ? "/letters" : "/letters?view=drafts"} className={secondaryBtn}>
          {draftsView ? <ScrollText size={17} /> : <Archive size={17} />}
          {draftsView ? t("كل الخطابات", "All letters") : t(`المسودات والمجدولة (${openDrafts})`, `Drafts & scheduled (${openDrafts})`)}
        </Link>
        {can(user, "letters.create") ? (
          <Link href="/letters/new" className={primaryBtn}>
            <Plus size={17} />
            {t("خطاب جديد", "New letter")}
          </Link>
        ) : null}
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={ScrollText} tone="teal" label={t("خطابات هذا العام", "Letters this year")} value={String(yearCount)} />
        <Stat icon={TriangleAlert} tone="red" label={t("إنذارات هذا العام", "Warnings this year")} value={String(warningsYear)} href="/letters?kind=warnings" />
        <Stat icon={CheckCircle2} tone="amber" label={t("بانتظار تأكيد الاستلام", "Awaiting confirmation")} value={String(unconfirmed)} href="/letters?state=unconfirmed" />
        <Stat
          icon={Clock3}
          tone="navy"
          label={t("نسخ بانتظار تفعيل الإرسال", "Copies waiting to send")}
          value={String(pendingCopies)}
          hint={t("تُرسل تلقائياً بعد تفعيل البريد وواتساب", "Sent once email and WhatsApp are activated")}
          href="/letters?state=pending"
        />
      </div>

      {draftsView ? (
        <Card id="drafts" className="scroll-mt-20">
          <SectionTitle
            hint={t(
              "خطابات حُفظت دون إصدار أو جُدولت ليوم لاحق؛ لا تأخذ رقماً ولا توقيعاً حتى تصدر. المجدولة تصدر صباح يومها تلقائياً. الصادرة تبقى هنا 30 يوماً.",
              "Letters saved without issuing or scheduled for a later day; they get no number or signature until issued. Scheduled ones issue on the morning of their day. Issued ones stay here for 30 days.",
            )}
          >
            {t("المسودات والمجدولة", "Drafts & scheduled")}
          </SectionTitle>
          {drafts.length === 0 ? (
            <EmptyState
              icon={Archive}
              title={t("لا توجد مسودات", "No drafts")}
              text={t("في «خطاب جديد» اضغط «حفظ في المسودات» أو «معاينة» أو اختر يوماً للجدولة.", "In “New letter”, press “Save to drafts” or “Preview”, or choose a day to schedule.")}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {drafts.map((draft) => {
                const meta = LETTER_KIND[draft.kind as LetterKind] || LETTER_KIND.GENERAL;
                const status = DRAFT_STATUS[draft.status] || DRAFT_STATUS.DRAFT;
                const content = readDraftContent(draft.content);
                const people = draft.employeeIds.map((id) => draftNames.get(id)).filter(Boolean) as { fullName: string; nameEn: string | null }[];
                return (
                  <li key={draft.id}>
                    <Link href={`/letters/drafts/${draft.id}`} className="-mx-2 flex flex-col gap-2 rounded-xl px-2 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <ToneBadge tone={meta.tone}>{pick(meta.label, lang)}</ToneBadge>
                        <p className="mt-1 truncate font-semibold text-slate-900">{content.subject || pick(meta.label, lang)}</p>
                        <p className="truncate text-sm text-slate-500">
                          {people.slice(0, 3).map(nameOf).join("، ")}
                          {people.length > 3 ? t(` و${people.length - 3} آخرين`, ` and ${people.length - 3} more`) : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                        <span className="tabular text-slate-500">
                          {draft.status === "SCHEDULED" && draft.scheduledFor
                            ? `${t("يصدر", "Issues")} ${formatDate(draft.scheduledFor)}`
                            : draft.issuedAt
                              ? `${t("صدر", "Issued")} ${formatDate(draft.issuedAt)}`
                              : formatDate(draft.updatedAt)}
                        </span>
                        <ToneBadge tone={status.tone}>{lang === "en" ? status.en : status.ar}</ToneBadge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
      <Card>
        <GetForm className="mb-4 grid grid-cols-2 items-end gap-2 border-b border-slate-100 pb-4 sm:flex sm:flex-wrap">
          <label className="col-span-2 min-w-0 space-y-1.5 text-xs font-medium text-slate-500 sm:w-56">
            {t("بحث", "Search")}
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input name="q" defaultValue={q} placeholder={t("الرقم أو الموضوع أو الاسم", "Number, subject or name")} className={`${fieldClass} block w-full ps-9`} />
            </span>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("النوع", "Type")}
            <select name="kind" defaultValue={kind} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("الكل", "All")}</option>
              <option value="warnings">{t("كل الإنذارات", "All warnings")}</option>
              {LETTER_KINDS.map((value) => (
                <option key={value} value={value}>
                  {pick(LETTER_KIND[value].label, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الموظف", "Employee")}
            <select name="employeeId" defaultValue={sp.employeeId || ""} className={`${fieldClass} block w-full sm:w-48`}>
              <option value="">{t("الكل", "All")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {nameOf(employee)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-slate-500">
            {t("الحالة", "Status")}
            <select name="state" defaultValue={state} className={`${fieldClass} block w-full sm:w-auto`}>
              <option value="">{t("الكل", "All")}</option>
              <option value="unconfirmed">{t("لم يؤكَّد استلامها", "Not confirmed")}</option>
              <option value="pending">{t("نسخ بانتظار الإرسال", "Copies waiting")}</option>
              <option value="cancelled">{t("الملغاة", "Cancelled")}</option>
            </select>
          </label>
          <div className="flex gap-2">
            {columnHiddenFields(sp, COLUMNS).map((field) => (
              <input key={field.name} type="hidden" name={field.name} value={field.value} />
            ))}
            <button className={secondaryBtn}>{t("تطبيق", "Apply")}</button>
            {filtered ? (
              <Link href="/letters" className="self-center text-sm font-semibold text-slate-500 hover:text-teal-800">
                {t("مسح", "Clear")}
              </Link>
            ) : null}
          </div>
        </GetForm>

        {letters.length === 0 ? (
          filtered ? (
            <p className="py-10 text-center text-sm text-slate-500">{t("لا توجد خطابات تطابق البحث.", "No letters match the filters.")}</p>
          ) : (
            <EmptyState icon={ScrollText} title={t("لا توجد خطابات بعد", "No letters yet")} text={t("أصدر أول خطاب أو إنذار لموظف، وسيظهر هنا مع حالة استلامه.", "Issue the first letter or warning, and it will appear here with its receipt status.")} />
          )
        ) : (
          <>
            <div className="table-shell">
              <table className="table-stack table-tools min-w-full text-sm">
                <thead>
                  <tr>
                    <ColumnHead column="ref" label={t("الرقم المرجعي", "Reference")} />
                    <ColumnHead column="kind" label={t("النوع", "Type")} />
                    <ColumnHead column="subject" label={t("الموضوع", "Subject")} />
                    <ColumnHead column="name" label={t("الموظف", "Employee")} />
                    <ColumnHead column="date" label={t("التاريخ", "Date")} />
                    <ColumnHead column="status" label={t("الحالة", "Status")} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ letter, kindLabel, statusLabel, name }) => {
                    const meta = LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL;
                    const status = letterState(letter);
                    return (
                      <tr key={letter.id}>
                        <td className="px-4 py-3 whitespace-nowrap" data-label={t("الرقم المرجعي", "Reference")}>
                          <Link href={`/letters/${letter.id}`} className="tabular text-xs font-semibold text-slate-500 hover:text-teal-700" dir="ltr">
                            {letter.refNo}
                          </Link>
                        </td>
                        <td className="px-4 py-3" data-label={t("النوع", "Type")}>
                          <ToneBadge tone={meta.tone}>{kindLabel}</ToneBadge>
                        </td>
                        <td className="cell-title px-4 py-3">
                          <Link href={`/letters/${letter.id}`} className={`font-semibold text-slate-900 hover:text-teal-700 ${letter.cancelledAt ? "line-through opacity-60" : ""}`}>
                            {letter.subject}
                          </Link>
                        </td>
                        <td className="px-4 py-3" data-label={t("الموظف", "Employee")}>
                          <Link href={`/letters/${letter.id}`} className="text-slate-800 hover:text-teal-700">
                            {name}
                          </Link>
                          <div className="tabular text-xs text-slate-500">{letter.employee.employeeNumber}</div>
                        </td>
                        <td className="tabular px-4 py-3 whitespace-nowrap text-slate-500" data-label={t("التاريخ", "Date")}>
                          {formatDate(letter.issuedAt)}
                        </td>
                        <td className="px-4 py-3" data-label={t("الحالة", "Status")}>
                          <ToneBadge tone={status.tone}>{statusLabel}</ToneBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{t("لا توجد خطابات تطابق البحث.", "No letters match the filters.")}</p> : null}
          </>
        )}
      </Card>
      )}
    </div>
  );
}
