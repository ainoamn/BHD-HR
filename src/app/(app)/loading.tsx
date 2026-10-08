import { getI18n } from "@/lib/lang";

export default async function Loading() {
  const { t } = await getI18n();
  return <div className="text-sm text-slate-500">{t("جارٍ التحميل...", "Loading...")}</div>;
}
