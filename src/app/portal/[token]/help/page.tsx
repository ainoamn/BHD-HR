import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { HelpHome } from "@/components/help/help-views";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalHelpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const { lang, t } = await getI18n();
  const base = `/portal/${token}`;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 text-white">
        <div className="higher-horizon pointer-events-none absolute -bottom-12 end-0 h-48 w-80 bg-[length:100%] opacity-[0.1]" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-5">
          <Link href={base} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 transition hover:text-white">
            <Back size={16} />
            {t("رجوع إلى صفحتي", "Back to my page")}
          </Link>
          <h1 className="mt-3 text-xl font-bold">{t("شرح استخدام صفحتي", "How to use my page")}</h1>
          <p className="mt-1 text-sm leading-6 text-white/75">
            {t(
              "فيديوهات وخطوات وصور تشرح كل ما تستطيع فعله من صفحتك: الإجازات والطلبات والقسائم والسيرة الذاتية، ومساعد ذكي يجيب عن سؤالك.",
              "Videos, steps and screenshots for everything on your page: leave, requests, payslips and your CV, plus an AI assistant for your questions.",
            )}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <HelpHome audience="employee" lang={lang} basePath={`${base}/help`} token={token} />
      </main>
    </div>
  );
}
