import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { Card, fieldClass } from "@/components/ui";
import { getI18n } from "@/lib/lang";
import { findPortalEmployee } from "@/lib/portal";
import { DEVICE_DAYS, deviceChallenge, deviceTrusted } from "@/lib/portal-device";
import { verifyPortalDevice } from "@/server/portal-device-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Shown instead of the portal on a browser that has not opened this link before. Only the company name is shown. */
export default async function PortalVerifyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { t } = await getI18n();
  const employee = await findPortalEmployee(token);
  if (!employee) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
        <Card className="text-center">
          <ShieldOff size={32} className="mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t("الرابط غير صالح", "This link is not valid")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("اطلب رابطك الحالي من الموارد البشرية.", "Ask HR for your current link.")}</p>
        </Card>
      </main>
    );
  }
  if (await deviceTrusted(employee)) redirect(`/portal/${token}`);
  const challenge = deviceChallenge(employee)!;
  const what = challenge.kind === "ID" ? t("رقم بطاقتك الشخصية", "your ID card number") : t("رقم جواز سفرك", "your passport number");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <Card className="space-y-5">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
            <ShieldCheck size={28} />
          </span>
          <p className="mt-3 text-sm font-semibold text-teal-800">{employee.company.name}</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{t("تأكيد أنك صاحب الرابط", "Confirm this link is yours")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              `هذا أول فتح لبوابتك على هذا الجهاز. اكتب آخر 4 خانات من ${what}. سيتذكر الجهاز ${DEVICE_DAYS} يوماً.`,
              `This is the first time your portal opens on this device. Type the last 4 characters of ${what}. The device is remembered for ${DEVICE_DAYS} days.`,
            )}
          </p>
        </div>
        <Flash error={sp.error} />
        <form action={verifyPortalDevice} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input
            name="answer"
            required
            minLength={4}
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            inputMode={challenge.kind === "ID" ? "numeric" : "text"}
            aria-label={t("آخر 4 خانات", "Last 4 characters")}
            placeholder="••••"
            className={`${fieldClass} w-full text-center font-mono text-2xl tracking-[0.5em]`}
          />
          <SubmitButton className="w-full" pendingLabel={t("جارٍ التحقق...", "Checking...")}>
            {t("متابعة", "Continue")}
          </SubmitButton>
        </form>
        <p className="text-center text-xs leading-5 text-slate-500">
          {t("لا تتذكر الرقم أو لا يعمل؟ تواصل مع الموارد البشرية.", "Can't remember it, or it does not work? Contact HR.")}
        </p>
      </Card>
    </main>
  );
}
