import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Archive, CheckCircle2, Clock3, Plus, ScrollText, Search, TriangleAlert } from "lucide-react";
import { Flash } from "@/components/flash";
import { GetForm } from "@/components/get-form";
import { Card, EmptyState, PageHeader, SectionTitle, Stat, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { DRAFT_STATUS, issueDueLetterDrafts, readDraftContent } from "@/lib/letter-drafts";
import { LETTER_KIND, LETTER_KINDS, WARNING_KINDS, isLetterKind, letterState, type LetterKind } from "@/lib/letters";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; employeeId?: string; q?: string; state?: string; view?: string; error?: string; message?: string }>;
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

  return (
    <div className="page-wide">
      <PageHeader
        icon={ScrollText}
        title={t("الإنذارات والخطابات", "Warnings & letters")}
        description={t(
          "لفت النظر والإنذارات المتدرجة وخطابات الشكر والخطابات العامة من الإدارة للموظفين، بترويسة رسمية ورقم مرجعي، مع نسخة تصل الموظف بالبريد وواتساب ويؤكد استلامها.",
          "Notices, escalating warnings, appreciation and general letters from management, on official letterhead with a reference number, plus a copy the employee receives by email and WhatsApp and confirms.",
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
          <ul className="divide-y divide-slate-100">
            {letters.map((letter) => {
              const meta = LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL;
              const status = letterState(letter);
              return (
                <li key={letter.id}>
                  <Link href={`/letters/${letter.id}`} className="-mx-2 flex flex-col gap-2 rounded-xl px-2 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone={meta.tone}>{pick(meta.label, lang)}</ToneBadge>
                        <span className="tabular text-xs font-semibold text-slate-500" dir="ltr">
                          {letter.refNo}
                        </span>
                      </div>
                      <p className={`mt-1 truncate font-semibold text-slate-900 ${letter.cancelledAt ? "line-through opacity-60" : ""}`}>{letter.subject}</p>
                      <p className="truncate text-sm text-slate-500">
                        {nameOf(letter.employee)} · {letter.employee.employeeNumber}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <span className="tabular text-slate-500">{formatDate(letter.issuedAt)}</span>
                      <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      )}
    </div>
  );
}
