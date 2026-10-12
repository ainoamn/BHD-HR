import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, Mail, MessageCircle, Printer, RotateCcw } from "lucide-react";
import { Flash } from "@/components/flash";
import { LetterSheet } from "@/components/letter-sheet";
import { DeleteButton } from "@/components/row-forms";
import { headerFor } from "@/components/salary-docs";
import { ShareLetter } from "@/components/share-letter";
import { SubmitButton } from "@/components/submit-button";
import { Card, SectionTitle, ToneBadge, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { channelReady, type Channel } from "@/lib/delivery";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { LETTER_KIND, letterMessage, letterState, letterUrl, type LetterKind } from "@/lib/letters";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDateTime } from "@/lib/utils";
import { cancelLetter, deleteLetter, queueLetterCopy } from "@/server/letter-actions";

const DELIVERY_STATE: Record<string, { ar: string; en: string; tone: string }> = {
  PENDING: { ar: "بانتظار تفعيل القناة", en: "Waiting for the channel", tone: "amber" },
  SENT: { ar: "أُرسلت", en: "Sent", tone: "green" },
  FAILED: { ar: "تعذر الإرسال", en: "Failed", tone: "red" },
};

export default async function LetterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("letters.view");
  const { lang, t } = await getI18n();
  const letter = await prisma.letter.findFirst({
    where: { id, companyId: user.companyId },
    include: { employee: { include: { employer: true } }, deliveries: { orderBy: { createdAt: "asc" } } },
  });
  if (!letter) notFound();
  const allow = { edit: can(user, "letters.edit"), remove: can(user, "letters.delete") };
  const employee = letter.employee;
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);
  const url = letterUrl(await requestOrigin(), letter.token);
  const kind = LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL;
  const message = letterMessage({ kind: letter.kind, refNo: letter.refNo, issuedAt: letter.issuedAt, employeeName: employee.fullName, employeeNameEn: employee.nameEn, companyName: header.name, url });
  const status = letterState(letter);
  const phone = normalizePhone(employee.phone);
  const nameOf = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;
  const channelLabel = (channel: string) => (channel === "EMAIL" ? t("البريد الإلكتروني", "Email") : t("واتساب", "WhatsApp"));

  return (
    <div className="page-wide space-y-5">
      <Link href="/letters" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {t("كل الخطابات", "All letters")}
      </Link>
      <Flash error={sp.error} message={sp.message} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <LetterSheet letter={letter} header={header} />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={kind.tone}>{pick(kind.label, lang)}</ToneBadge>
              <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
            </div>
            <p className="tabular mt-2 text-sm font-semibold text-slate-500" dir="ltr">
              {letter.refNo}
            </p>
            <Link href={`/employees/${employee.id}?tab=letters`} className="mt-1 block font-bold text-slate-900 hover:text-teal-800">
              {nameOf}
            </Link>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t("أصدره", "Issued by")}</dt>
                <dd className="text-end">{letter.createdByName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t("فتحه الموظف", "Opened by employee")}</dt>
                <dd className="tabular text-end">{letter.viewedAt ? formatDateTime(letter.viewedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t("أكد الاستلام", "Receipt confirmed")}</dt>
                <dd className="tabular text-end">{letter.acknowledgedAt ? formatDateTime(letter.acknowledgedAt) : "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
              <Link href={`/letters/${letter.id}/print`} target="_blank" className={`${secondaryBtn} col-span-2`}>
                <Printer size={16} />
                {t("طباعة / حفظ PDF", "Print / Save PDF")}
              </Link>
              {allow.edit ? (
                <form action={cancelLetter} className="contents">
                  <input type="hidden" name="id" value={letter.id} />
                  <SubmitButton
                    variant={letter.cancelledAt ? "secondary" : "danger"}
                    className="w-full"
                    confirm={letter.cancelledAt ? undefined : t("إلغاء هذا الخطاب؟ يبقى في السجل مع علامة «ملغى».", "Cancel this letter? It stays on record marked “Cancelled”.")}
                  >
                    {letter.cancelledAt ? <RotateCcw size={16} /> : <Ban size={16} />}
                    {letter.cancelledAt ? t("إعادة التفعيل", "Restore") : t("إلغاء الخطاب", "Cancel letter")}
                  </SubmitButton>
                </form>
              ) : null}
              {allow.remove ? (
                <div className="flex items-center justify-center">
                  <DeleteButton
                    action={deleteLetter}
                    fields={{ id: letter.id, returnTo: "/letters" }}
                    confirm={t("حذف الخطاب نهائياً من السجل؟ يُفضّل الإلغاء بدلاً من الحذف.", "Delete the letter permanently? Cancelling is usually better.")}
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionTitle hint={t("نسخة الموظف تفتح الخطاب وتتيح له تأكيد الاستلام.", "The employee copy opens the letter and lets them confirm receipt.")}>{t("إرسال النسخة للموظف", "Send the employee a copy")}</SectionTitle>
            <ul className="mb-4 space-y-2">
              {letter.deliveries.map((delivery) => {
                const state = DELIVERY_STATE[delivery.status] || DELIVERY_STATE.PENDING;
                return (
                  <li key={delivery.id} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                        {delivery.channel === "EMAIL" ? <Mail size={15} className="text-navy-500" /> : <MessageCircle size={15} className="text-emerald-600" />}
                        {channelLabel(delivery.channel)}
                      </span>
                      <ToneBadge tone={state.tone}>{lang === "en" ? state.en : state.ar}</ToneBadge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500" dir="ltr">
                      {delivery.channel === "WHATSAPP" ? formatPhone(delivery.target) : delivery.target}
                      {delivery.sentAt ? ` · ${formatDateTime(delivery.sentAt)}` : ""}
                    </p>
                    {delivery.error ? <p className="mt-1 break-words text-xs text-red-600">{delivery.error}</p> : null}
                  </li>
                );
              })}
              {letter.deliveries.length === 0 ? <li className="text-sm text-slate-500">{t("لم تُطلب نسخ تلقائية لهذا الخطاب.", "No automatic copies were requested.")}</li> : null}
            </ul>
            {allow.edit && !letter.cancelledAt ? (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(["EMAIL", "WHATSAPP"] as Channel[]).map((channel) => (
                  <form key={channel} action={queueLetterCopy}>
                    <input type="hidden" name="id" value={letter.id} />
                    <input type="hidden" name="channel" value={channel} />
                    <SubmitButton variant="secondary" className="w-full" pendingLabel={t("جارٍ...", "Working...")}>
                      + {channelLabel(channel)}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            ) : null}
            {!channelReady("EMAIL") || !channelReady("WHATSAPP") ? (
              <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-inset ring-amber-200">
                {t(
                  "الإرسال التلقائي غير مفعّل بعد؛ النسخ محفوظة وتُرسل فور التفعيل. حتى ذلك الحين شارك الخطاب يدوياً:",
                  "Automatic sending isn't active yet; copies are kept and go out once it is. Until then, share the letter manually:",
                )}
              </p>
            ) : null}
            {letter.cancelledAt ? null : <ShareLetter url={url} message={message} subject={`${kind.label.ar} / ${kind.label.en} — ${letter.refNo}`} phone={phone} email={employee.email} />}
          </Card>
        </aside>
      </div>
    </div>
  );
}
