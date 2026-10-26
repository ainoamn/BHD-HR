import Link from "next/link";
import { PartyPopper, Plus } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, SectionTitle, ToneBadge, fieldClass, linkAction, primaryBtn } from "@/components/ui";
import { NATIONALITIES } from "@/lib/nationalities";
import { channelReady } from "@/lib/delivery";
import { GREETING_STATUS, describeAudience, readAudience } from "@/lib/greetings";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { createGreeting } from "@/server/greeting-actions";

export const maxDuration = 60;

export default async function AdminGreetingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const [rows, companies] = await Promise.all([
    prisma.platformGreeting.findMany({
      orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { currentVersion: { select: { token: true, createdAt: true } }, _count: { select: { versions: true } } },
    }),
    prisma.company.findMany({ select: { id: true, name: true, nameEn: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  const emailOk = channelReady("EMAIL");
  const tone: Record<string, string> = { DRAFT: "slate", READY: "teal", SCHEDULED: "amber", SENT: "green", FAILED: "red", CANCELLED: "slate" };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={PartyPopper}
        title={t("التهاني والإشعارات المجدولة", "Greetings & scheduled notices")}
        description={t(
          "صف المناسبة والتاريخ والجمهور؛ الذكاء الاصطناعي يصمم البطاقة والصورة، وتُرسل في الموعد مع الاحتفاظ بكل نسخة سابقة.",
          "Describe the occasion, date and audience; AI designs the card and image, sends on schedule, and keeps every previous version.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      {!emailOk ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="text-sm text-amber-950">
            {t("البريد غير مفعّل بعد (RESEND_API_KEY / MAIL_FROM). يمكنك التصميم والمعاينة الآن، والإرسال بعد تفعيل البريد.", "Email is not configured yet (RESEND_API_KEY / MAIL_FROM). You can design and preview now; send after email is enabled.")}
          </p>
        </Card>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle hint={t("بعد الحفظ يُصمَّم أول بطاقة تلقائياً (قد يستغرق نصف دقيقة).", "After save, the first card is designed automatically (may take ~30s).")}>
            <span className="inline-flex items-center gap-2">
              <Plus size={18} />
              {t("مناسبة جديدة", "New occasion")}
            </span>
          </SectionTitle>
          <form action={createGreeting} className="mt-4 space-y-3">
            <Field label={t("اسم المناسبة", "Occasion name")}>
              <input name="title" required maxLength={120} className={`${fieldClass} w-full`} placeholder={t("العيد الوطني العماني", "Oman National Day")} />
            </Field>
            <Field label={t("ماذا تعني هذه المناسبة؟", "What does this occasion mean?")}>
              <textarea name="meaning" required rows={3} maxLength={1000} className={`${fieldClass} w-full`} placeholder={t("احتفال باليوم الوطني وذكرى توحيد البلاد…", "Celebrating National Day and the country’s unity…")} />
            </Field>
            <Field label={t("وصف التصميم / الرسالة للذكاء الاصطناعي", "Design brief for AI")}>
              <textarea
                name="brief"
                required
                rows={4}
                maxLength={2000}
                className={`${fieldClass} w-full`}
                placeholder={t("بطاقة فاخرة بألوان العلم العماني، دفء واحترام، بدون وجوه حقيقية…", "Elegant card with Omani flag colours, warm and respectful, no real faces…")}
              />
            </Field>
            <Field label={t("تاريخ ووقت الإرسال (مسقط)", "Send date & time (Muscat)")}>
              <input type="datetime-local" name="scheduledFor" required className={`${fieldClass} w-full`} dir="ltr" />
            </Field>

            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <p className="mb-2 text-sm font-bold text-slate-800">{t("الفئة المستهدفة", "Target audience")}</p>
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="aud_all" value="1" defaultChecked />
                {t("الكل", "Everyone")}
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="aud_gender" value="MALE" />
                  {t("الرجال", "Men")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="aud_gender" value="FEMALE" />
                  {t("النساء", "Women")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="aud_omanis" value="1" />
                  {t("العمانيون", "Omanis")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="aud_expats" value="1" />
                  {t("الوافدون", "Expatriates")}
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="aud_youth" value="1" />
                  {t("الشباب (حتى 35 سنة)", "Youth (up to 35)")}
                </label>
              </div>
              <Field label={t("جنسيات محددة (اختياري)", "Specific nationalities (optional)")}>
                <select name="aud_nationality" multiple size={6} className={`${fieldClass} w-full`}>
                  {NATIONALITIES.map((row) => (
                    <option key={row.code} value={row.code}>
                      {lang === "en" ? row.en : row.ar} ({row.code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("منشآت محددة (اختياري)", "Specific companies (optional)")}>
                <select name="aud_company" multiple size={5} className={`${fieldClass} w-full`}>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {lang === "en" && company.nameEn ? company.nameEn : company.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <SubmitButton className={primaryBtn}>{t("حفظ وتصميم البطاقة بالذكاء الاصطناعي", "Save & AI-design the card")}</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>{t("المناسبات", "Occasions")}</SectionTitle>
          {rows.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {rows.map((row) => {
                const status = GREETING_STATUS[row.status] || GREETING_STATUS.DRAFT;
                return (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/greetings/${row.id}`} className="font-semibold text-slate-900 hover:text-teal-800">
                        {row.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(row.scheduledFor)} · {describeAudience(readAudience(row.audience), t)} · {t(`${row._count.versions} تصميم`, `${row._count.versions} design(s)`)}
                      </p>
                    </div>
                    <ToneBadge tone={tone[row.status] || "slate"}>{lang === "en" ? status.en : status.ar}</ToneBadge>
                    <Link href={`/admin/greetings/${row.id}`} className={linkAction}>
                      {t("فتح", "Open")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t("لا مناسبات بعد. أنشئ الأولى من النموذج.", "No occasions yet. Create the first from the form.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
