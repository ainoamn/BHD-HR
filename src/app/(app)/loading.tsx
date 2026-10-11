import { getI18n } from "@/lib/lang";

const block = "animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
      <span className="sr-only">{t("جارٍ التحميل...", "Loading...")}</span>
      <div className="mb-8 flex items-center gap-3.5">
        <div className={`${block} hidden size-12 sm:block`} />
        <div className="space-y-2.5">
          <div className={`${block} h-7 w-48 rounded-xl`} />
          <div className={`${block} h-4 w-72 max-w-[70vw] rounded-lg`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${block} h-28`} />
        ))}
      </div>
      <div className={`${block} mt-5 h-72`} />
    </div>
  );
}
