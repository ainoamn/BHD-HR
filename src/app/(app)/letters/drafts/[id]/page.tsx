import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CalendarX2, CircleAlert, Pencil } from "lucide-react";
import { Flash } from "@/components/flash";
import { LetterSheet } from "@/components/letter-sheet";
import { DeleteButton } from "@/components/row-forms";
import { headerFor } from "@/components/salary-docs";
import { SubmitButton } from "@/components/submit-button";
import { Card, SectionTitle, ToneBadge, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { composeLetters, DRAFT_STATUS, muscatToday, OPEN_DRAFT, readDraftContent } from "@/lib/letter-drafts";
import { blanksIn } from "@/lib/letter-library";
import { LETTER_GROUP, LETTER_KIND, type LetterKind } from "@/lib/letters";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, parseDateInput, toDateInput } from "@/lib/utils";
import { deleteLetterDraft, issueLetterDraft, scheduleLetterDraft } from "@/server/letter-actions";

export default async function LetterDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string; error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("letters.view");
  const { lang, t } = await getI18n();
  const draft = await prisma.letterDraft.findFirst({ where: { id, companyId: user.companyId } });
  if (!draft) notFound();
  const content = readDraftContent(draft.content);
  const meta = LETTER_KIND[draft.kind as LetterKind] || LETTER_KIND.GENERAL;
  const status = DRAFT_STATUS[draft.status] || DRAFT_STATUS.DRAFT;
  const open = OPEN_DRAFT.includes(draft.status);
  const allowEdit = open && can(user, "letters.create");
  const composed = open
    ? await composeLetters({ companyId: user.companyId, company: user.company, kind: draft.kind, employeeIds: draft.employeeIds, content, canSalary: can(user, "salaries.view"), allowBlanks: true })
    : null;
  const blanks = open && !meta.auto ? blanksIn(content.subject, content.subjectEn, content.body, content.bodyEn) : [];
  const items = composed && !("error" in composed) ? composed.items : [];
  const shown = items.find((item) => item.employee.id === sp.e) || items[0];
  const [names, letters] = await Promise.all([
    prisma.employee.findMany({ where: { companyId: user.companyId, id: { in: draft.employeeIds } }, select: { id: true, fullName: true, nameEn: true }, orderBy: { fullName: "asc" } }),
    draft.letterIds.length ? prisma.letter.findMany({ where: { id: { in: draft.letterIds }, companyId: user.companyId }, select: { id: true, refNo: true, employee: { select: { fullName: true, nameEn: true } } } }) : [],
  ]);
  const nameOf = (person: { fullName: string; nameEn: string | null }) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);
  const letterDay = draft.scheduledFor || parseDateInput(content.issuedAt) || muscatToday();
  const tomorrow = toDateInput(new Date(muscatToday().getTime() + 86400000));

  return (
    <div className="page-wide space-y-5">
      <Link href="/letters?view=drafts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("المسودات والمجدولة", "Drafts & scheduled")}
      </Link>
      <Flash error={sp.error} message={sp.message} />

      <div id="preview" className="grid scroll-mt-20 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {composed && "error" in composed ? (
            <p className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 ring-1 ring-inset ring-red-200">
              <CircleAlert size={18} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {t("لا يمكن إصدار هذا الخطاب بعد:", "This letter can't be issued yet:")} {composed.error[lang]}
              </span>
            </p>
          ) : null}
          {blanks.length ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 ring-1 ring-inset ring-amber-200">
              <p className="flex items-start gap-2 font-semibold">
                <CircleAlert size={18} className="mt-0.5 shrink-0" />
                {t("لا يصدر الخطاب قبل إكمال الفراغات التي تركها النموذج:", "The letter won't issue until the blanks the template left are filled in:")}
              </p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {blanks.map((blank) => (
                  <span key={blank} className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-amber-200">
                    {blank}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          {shown ? (
            <>
              <p className="text-xs text-slate-500">
                {t(
                  "معاينة كما سيصدر. الرقم المرجعي ورقم التوقيع الإلكتروني ورمز التحقق تُعطى عند الإصدار.",
                  "Preview as it will be issued. The reference, e-signature number and check code are given when it is issued.",
                )}
              </p>
              <LetterSheet
                letter={{
                  kind: draft.kind,
                  refNo: `${LETTER_GROUP[meta.group].code}-····-····`,
                  issuedAt: letterDay,
                  ...shown.text,
                  signatoryName: content.signatoryName || user.company.signatoryName || user.name,
                  signatoryTitle: content.signatoryTitle || user.company.signatoryTitle || null,
                  acknowledgedAt: null,
                  cancelledAt: null,
                  employee: shown.employee,
                }}
                header={headerFor({ employerName: shown.employee.employer?.name, employerNameEn: shown.employee.employer?.nameEn, employer: shown.employee.employer }, user.company)}
              />
            </>
          ) : null}
          {draft.status === "ISSUED" ? (
            <Card>
              <SectionTitle>{t("الخطابات الصادرة من هذه المسودة", "Letters issued from this draft")}</SectionTitle>
              <ul className="divide-y divide-slate-100">
                {letters.map((letter) => (
                  <li key={letter.id}>
                    <Link href={`/letters/${letter.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-teal-800">
                      <span className="min-w-0 truncate font-semibold">{nameOf(letter.employee)}</span>
                      <span className="tabular shrink-0 text-slate-500" dir="ltr">
                        {letter.refNo}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={meta.tone}>{pick(meta.label, lang)}</ToneBadge>
              <ToneBadge tone={status.tone}>{lang === "en" ? status.en : status.ar}</ToneBadge>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              {draft.scheduledFor && draft.status !== "ISSUED" ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">{t("يصدر صباح", "Issues on the morning of")}</dt>
                  <dd className="tabular font-bold text-slate-900">{formatDate(draft.scheduledFor)}</dd>
                </div>
              ) : null}
              {draft.issuedAt ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">{t("صدر في", "Issued at")}</dt>
                  <dd className="tabular text-end">{formatDateTime(draft.issuedAt)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{draft.status === "SCHEDULED" ? t("يوقّعه", "Signed by") : t("كتبه", "Written by")}</dt>
                <dd className="text-end">{draft.createdByName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t("آخر تعديل", "Last edited")}</dt>
                <dd className="tabular text-end">{formatDateTime(draft.updatedAt)}</dd>
              </div>
            </dl>
            {draft.status === "FAILED" && draft.error ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 ring-1 ring-inset ring-red-200">
                {t("لم يصدر في موعده:", "Not issued on its day:")} {draft.error}
              </p>
            ) : null}
            {allowEdit ? (
              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4">
                <form action={issueLetterDraft}>
                  <input type="hidden" name="id" value={draft.id} />
                  <SubmitButton
                    className="w-full"
                    pendingLabel={t("جارٍ الإصدار...", "Issuing...")}
                    confirm={t(`إصدار ${draft.employeeIds.length} خطاب موقّعاً الآن بتاريخ اليوم؟`, `Issue ${draft.employeeIds.length} signed letter(s) now, dated today?`)}
                  >
                    <BadgeCheck size={16} />
                    {t("إصدار الآن موقّعاً", "Issue signed now")}
                  </SubmitButton>
                </form>
                <Link href={`/letters/new?draftId=${draft.id}`} className={secondaryBtn}>
                  <Pencil size={16} />
                  {t("تعديل", "Edit")}
                </Link>
                <div className="flex items-center justify-center pt-1">
                  <DeleteButton action={deleteLetterDraft} fields={{ id: draft.id }} confirm={t("حذف هذه المسودة؟", "Delete this draft?")} />
                </div>
              </div>
            ) : null}
          </Card>

          {allowEdit ? (
            <Card>
              <SectionTitle hint={t("يصدر موقّعاً مؤرَّخاً بذلك اليوم صباحاً تلقائياً، ويُرسل للموظف إن اخترت الإرسال.", "Issued signed and dated that day, automatically in the morning, and sent to the employee if chosen.")}>
                {t("جدولة الإصدار", "Schedule issuing")}
              </SectionTitle>
              <form action={scheduleLetterDraft} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={draft.id} />
                <input
                  className={`${fieldClass} min-w-0 flex-1 basis-40`}
                  type="date"
                  name="scheduleDate"
                  min={tomorrow}
                  defaultValue={toDateInput(draft.scheduledFor)}
                  required
                  aria-label={t("يوم الإصدار", "Issue day")}
                />
                <SubmitButton variant="secondary" pendingLabel={t("جارٍ الحفظ...", "Saving...")}>
                  <CalendarClock size={16} />
                  {draft.status === "SCHEDULED" ? t("تغيير اليوم", "Change day") : t("جدولة", "Schedule")}
                </SubmitButton>
              </form>
              {draft.status === "SCHEDULED" ? (
                <form action={scheduleLetterDraft} className="mt-2">
                  <input type="hidden" name="id" value={draft.id} />
                  <input type="hidden" name="unschedule" value="1" />
                  <SubmitButton variant="link" pendingLabel={t("جارٍ...", "Working...")}>
                    <CalendarX2 size={15} className="inline" /> {t("إلغاء الجدولة وإبقاؤه مسودة", "Unschedule and keep as draft")}
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <SectionTitle hint={items.length > 1 ? t("اضغط اسماً لمعاينة خطابه.", "Press a name to preview their letter.") : undefined}>
              {t(`الموظفون (${names.length})`, `Employees (${names.length})`)}
            </SectionTitle>
            <ul className="space-y-1">
              {names.map((person) => (
                <li key={person.id}>
                  {items.length > 1 ? (
                    <Link
                      href={`/letters/drafts/${draft.id}?e=${person.id}`}
                      scroll={false}
                      className={`block truncate rounded-lg px-2 py-1.5 text-sm ${shown?.employee.id === person.id ? "bg-teal-50 font-bold text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                      {nameOf(person)}
                    </Link>
                  ) : (
                    <span className="block truncate px-2 py-1.5 text-sm text-slate-700">{nameOf(person)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
