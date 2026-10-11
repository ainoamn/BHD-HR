import Link from "next/link";
import { Compass, House } from "lucide-react";
import { primaryBtn } from "@/components/ui";
import { getI18n } from "@/lib/lang";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-20">
      <div className="max-w-md animate-fade-up text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
          <Compass size={30} strokeWidth={1.7} />
        </span>
        <p className="tabular mt-6 text-sm font-semibold tracking-widest text-gold-600">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("الصفحة غير موجودة", "Page not found")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {t("ربما نُقلت الصفحة أو حُذفت، أو أن الرابط غير صحيح.", "The page may have moved or been removed, or the link is wrong.")}
        </p>
        <Link href="/" className={`${primaryBtn} mt-7`}>
          <House size={16} />
          {t("العودة للرئيسية", "Back to home")}
        </Link>
      </div>
    </div>
  );
}
