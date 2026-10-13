import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { CvEditor } from "@/components/cv-editor";
import { Flash } from "@/components/flash";
import { emptyCv, hasCvContent, readCv } from "@/lib/cv";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalCvPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; error?: string; message?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { lang: uiLang, t } = await getI18n();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const cvLang = sp.lang === "en" || sp.lang === "ar" ? sp.lang : uiLang;
  const cv = readCv(employee.cv);
  const base = `/portal/${token}`;
  const Back = uiLang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-5 sm:px-6 lg:px-8">
          <Link href={`${base}#cv`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 transition hover:text-white">
            <Back size={16} />
            {t("رجوع إلى صفحتي", "Back to my page")}
          </Link>
          <h1 className="mt-3 text-xl font-bold">{t("سيرتي الذاتية", "My CV")}</h1>
          <p className="mt-1 text-sm leading-6 text-white/75">
            {t(
              "املأ بياناتك بأسلوبك، ودع الذكاء الاصطناعي يصوغها بشكل احترافي. يمكنك كتابة نسخة عربية وأخرى إنجليزية ثم طباعتها مع ملفك الكامل.",
              "Fill in your details your way and let AI polish them. Keep an Arabic and an English version, then print them with your full profile.",
            )}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <Flash error={sp.error} message={sp.message} />
        <CvEditor
          key={cvLang}
          initial={cv[cvLang] || emptyCv()}
          cvLang={cvLang}
          saved={{ ar: hasCvContent(cv.ar), en: hasCvContent(cv.en) }}
          owner={{ token }}
          hasPhoto={Boolean(employee.photoUrl)}
          editHref={`${base}/cv`}
          printHref={`${base}/profile`}
          back={`${base}/cv?lang=${cvLang}`}
        />
      </main>
    </div>
  );
}
