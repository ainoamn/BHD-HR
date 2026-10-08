import Link from "next/link";
import { getI18n } from "@/lib/lang";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{t("الصفحة غير موجودة", "Page not found")}</h1>
      <Link href="/" className="mt-4 inline-block font-semibold text-teal-800">
        {t("العودة للرئيسية", "Back to home")}
      </Link>
    </div>
  );
}
