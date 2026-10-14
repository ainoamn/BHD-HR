import type { Metadata } from "next";
import { PauseCircle } from "lucide-react";
import { getI18n } from "@/lib/lang";

export const metadata: Metadata = { robots: { index: false } };

/** Where an employee portal link lands while the company's subscription is closed. */
export default async function PausedPage() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand-50 px-5">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/90 bg-surface p-8 text-center shadow-raised">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70">
          <PauseCircle size={26} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{t("الخدمة متوقفة مؤقتاً", "The service is paused")}</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          {t(
            "بوابة الموظفين لمنشأتك متوقفة حالياً. بياناتك محفوظة كما هي، وتعود البوابة فور تجديد المنشأة لاشتراكها. تواصل مع الموارد البشرية في منشأتك.",
            "Your company's employee portal is paused. Your data is kept, and the portal returns as soon as the company renews. Contact your HR team.",
          )}
        </p>
      </div>
    </main>
  );
}
