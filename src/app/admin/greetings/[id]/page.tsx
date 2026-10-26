import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PartyPopper, RefreshCw, Send, Timer } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction, primaryBtn, secondaryBtn } from "@/components/ui";
import { channelReady } from "@/lib/delivery";
import { GREETING_STATUS, describeAudience, readAudience, resolveGreetingRecipients } from "@/lib/greetings";
import { getI18n } from "@/lib/lang";
import { NATIONALITIES } from "@/lib/nationalities";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { cancelGreeting, redesignGreeting, scheduleGreeting, sendGreetingNow, updateGreetingMeta } from "@/server/greeting-actions";

export const maxDuration = 60;

/** Show stored UTC instant as Asia/Muscat for datetime-local. */
function toLocalInput(date: Date) {
  const muscat = new Date(date.getTime() + 4 * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${muscat.getUTCFullYear()}-${pad(muscat.getUTCMonth() + 1)}-${pad(muscat.getUTCDate())}T${pad(muscat.getUTCHours())}:${pad(muscat.getUTCMinutes())}`;
}

export default async function AdminGreetingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const greeting = await prisma.platformGreeting.findUnique({
    where: { id },
    include: {
      currentVersion: true,
      versions: { orderBy: { createdAt: "desc" }, select: { id: true, token: true, createdAt: true, reviseNote: true, mime: true } },
    },
  });
  if (!greeting) notFound();

  const audience = readAudience(greeting.audience);
  const [companies, recipients] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" }, take: 200 }),
    resolveGreetingRecipients(audience),
  ]);
  const status = GREETING_STATUS[greeting.status] || GREETING_STATUS.DRAFT;
  const tone: Record<string, string> = { DRAFT: "slate", READY: "teal", SCHEDULED: "amber", SENT: "green", FAILED: "red", CANCELLED: "slate" };
  const emailOk = channelReady("EMAIL");
  const locked = greeting.status === "SENT" || greeting.status === "CANCELLED";
  const img = greeting.currentVersion ? `/api/greetings/img/${greeting.currentVersion.token}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/greetings" className={`${linkAction} inline-flex items-center gap-1`}>
          <ArrowRight size={16} className="rtl:rotate-180" />
          {t("المناسبات", "Occasions")}
        </Link>
        <ToneBadge tone={tone[greeting.status] || "slate"}>{lang === "en" ? status.en : status.ar}</ToneBadge>
      </div>
      <PageHeader
        icon={PartyPopper}
        title={greeting.title}
        description={t(
          `${describeAudience(audience, t)} · ${recipients.length} مستلم محتمل · ${formatDateTime(greeting.scheduledFor)}`,
          `${describeAudience(audience, t)} · ${recipients.length} potential recipients · ${formatDateTime(greeting.scheduledFor)}`,
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle>{t("معاينة البطاقة", "Card preview")}</SectionTitle>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={greeting.title} className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain" />
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t("لا تصميم بعد. اطلب التوليد من الأسفل.", "No design yet. Generate from below.")}</p>
            )}
            {greeting.currentVersion ? (
              <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 ring-1 ring-inset ring-slate-200">
                <p className="font-bold text-slate-900">{greeting.subjectAr}</p>
                <p className="whitespace-pre-line">{greeting.bodyAr}</p>
                <p className="border-t border-slate-200 pt-2 font-semibold text-slate-800" dir="ltr">
                  {greeting.subjectEn}
                </p>
                <p className="whitespace-pre-line" dir="ltr">
                  {greeting.bodyEn}
                </p>
              </div>
            ) : null}
          </Card>

          {!locked ? (
            <Card>
              <SectionTitle hint={t("كل إعادة تصميم تولّد صورة جديدة وتُبقي القديمة في السجل.", "Each redesign creates a new image and keeps the old one in history.")}>
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={18} />
                  {t("طلب تغيير التصميم", "Request a design change")}
                </span>
              </SectionTitle>
              <form action={redesignGreeting} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={greeting.id} />
                <Field label={t("ماذا تريد تغييره؟", "What should change?")}>
                  <textarea
                    name="reviseNote"
                    rows={3}
                    maxLength={500}
                    className={`${fieldClass} w-full`}
                    placeholder={t("اجعل الألوان أغمق، أضف زخومات عمانية، قلّل النص على الصورة…", "Darker colours, more Omani motifs, less text on the image…")}
                  />
                </Field>
                <SubmitButton className={secondaryBtn}>{t("إعادة التصميم بالذكاء الاصطناعي", "AI redesign")}</SubmitButton>
              </form>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>{t("سجل التصاميم", "Design history")}</SectionTitle>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {greeting.versions.map((version) => (
                <li key={version.id} className="rounded-xl ring-1 ring-inset ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/greetings/img/${version.token}`} alt="" className="h-36 w-full rounded-t-xl object-cover bg-slate-50" />
                  <div className="p-2 text-xs text-slate-500">
                    {formatDateTime(version.createdAt)}
                    {version.id === greeting.currentVersionId ? ` · ${t("الحالي", "Current")}` : ""}
                    {version.reviseNote ? <span className="mt-1 block text-slate-700">{version.reviseNote}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <SectionTitle>{t("الإرسال", "Sending")}</SectionTitle>
            <p className="mt-2 text-sm text-slate-600">
              {t(`المستلمون المتوقعون: ${recipients.length}`, `Expected recipients: ${recipients.length}`)}
              {!emailOk ? ` · ${t("البريد غير مفعّل", "Email off")}` : ""}
            </p>
            {greeting.sentCount ? (
              <p className="mt-1 text-xs text-slate-500">
                {t(`أُرسل سابقاً إلى ${greeting.sentCount}`, `Previously sent to ${greeting.sentCount}`)}
                {greeting.sentAt ? ` · ${formatDateTime(greeting.sentAt)}` : ""}
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              <form action={sendGreetingNow}>
                <input type="hidden" name="id" value={greeting.id} />
                <input type="hidden" name="test" value="1" />
                <SubmitButton className={`${secondaryBtn} w-full`} disabled={!greeting.currentVersion || !emailOk}>
                  <Send size={16} className="me-1 inline" />
                  {t("إرسال تجريبي لبريدي", "Send test to my email")}
                </SubmitButton>
              </form>
              {!locked ? (
                <>
                  <form action={scheduleGreeting}>
                    <input type="hidden" name="id" value={greeting.id} />
                    <SubmitButton className={`${primaryBtn} w-full`} disabled={!greeting.currentVersion || !emailOk}>
                      <Timer size={16} className="me-1 inline" />
                      {t("جدولة الإرسال التلقائي", "Schedule automatic send")}
                    </SubmitButton>
                  </form>
                  <form action={sendGreetingNow}>
                    <input type="hidden" name="id" value={greeting.id} />
                    <SubmitButton
                      className={`${secondaryBtn} w-full`}
                      disabled={!greeting.currentVersion || !emailOk}
                      confirm={t(`إرسال الآن إلى نحو ${recipients.length} مستلم؟`, `Send now to about ${recipients.length} recipients?`)}
                    >
                      {t("إرسال الآن للجميع", "Send now to everyone")}
                    </SubmitButton>
                  </form>
                  <form action={cancelGreeting}>
                    <input type="hidden" name="id" value={greeting.id} />
                    <SubmitButton className={`${secondaryBtn} w-full`} confirm={t("إلغاء هذه المناسبة؟", "Cancel this occasion?")}>
                      {t("إلغاء", "Cancel")}
                    </SubmitButton>
                  </form>
                </>
              ) : null}
            </div>
          </Card>

          {!locked ? (
            <Card>
              <SectionTitle>{t("تعديل المناسبة والجمهور", "Edit occasion & audience")}</SectionTitle>
              <form action={updateGreetingMeta} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={greeting.id} />
                <Field label={t("اسم المناسبة", "Occasion name")}>
                  <input name="title" required maxLength={120} defaultValue={greeting.title} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("المعنى", "Meaning")}>
                  <textarea name="meaning" required rows={3} maxLength={1000} defaultValue={greeting.meaning} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("وصف التصميم", "Design brief")}>
                  <textarea name="brief" required rows={3} maxLength={2000} defaultValue={greeting.brief} className={`${fieldClass} w-full`} />
                </Field>
                <Field label={t("موعد الإرسال", "Send time")}>
                  <input type="datetime-local" name="scheduledFor" required defaultValue={toLocalInput(greeting.scheduledFor)} className={`${fieldClass} w-full`} dir="ltr" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="aud_all" value="1" defaultChecked={Boolean(audience.all)} />
                  {t("الكل", "Everyone")}
                </label>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aud_gender" value="MALE" defaultChecked={audience.genders?.includes("MALE")} />
                    {t("الرجال", "Men")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aud_gender" value="FEMALE" defaultChecked={audience.genders?.includes("FEMALE")} />
                    {t("النساء", "Women")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aud_omanis" value="1" defaultChecked={audience.omanis} />
                    {t("العمانيون", "Omanis")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aud_expats" value="1" defaultChecked={audience.expats} />
                    {t("الوافدون", "Expatriates")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aud_youth" value="1" defaultChecked={Boolean(audience.youthMaxAge)} />
                    {t("الشباب (حتى 35)", "Youth (≤ 35)")}
                  </label>
                </div>
                <Field label={t("جنسيات", "Nationalities")}>
                  <select name="aud_nationality" multiple size={5} className={`${fieldClass} w-full`} defaultValue={audience.nationalities || []}>
                    {NATIONALITIES.map((row) => (
                      <option key={row.code} value={row.code}>
                        {lang === "en" ? row.en : row.ar}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("منشآت", "Companies")}>
                  <select name="aud_company" multiple size={4} className={`${fieldClass} w-full`} defaultValue={audience.companyIds || []}>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {lang === "en" && company.nameEn ? company.nameEn : company.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton className={secondaryBtn}>{t("حفظ التعديلات", "Save changes")}</SubmitButton>
              </form>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
