import { monthNames } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { fieldClass, secondaryBtn } from "./ui";

export async function PeriodFilter({
  year,
  month,
  employers,
  employerId,
}: {
  year: number;
  month: number;
  employers?: { id: string; name: string; nameEn: string | null }[];
  employerId?: string;
}) {
  const { lang, t } = await getI18n();
  const years = Array.from(new Set([year - 2, year - 1, year, year + 1, new Date().getFullYear()])).sort();
  return (
    <form method="get" className="no-print grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      {employers ? (
        <select name="employerId" defaultValue={employerId || ""} className={`${fieldClass} col-span-2 w-full sm:w-auto sm:min-w-44`}>
          <option value="">{t("كل أصحاب العمل", "All employers")}</option>
          {employers.map((employer) => (
            <option key={employer.id} value={employer.id}>
              {lang === "en" && employer.nameEn ? employer.nameEn : employer.name}
            </option>
          ))}
          <option value="none">{t("بدون صاحب عمل", "No employer")}</option>
        </select>
      ) : null}
      <select name="month" defaultValue={month} className={`${fieldClass} w-full sm:w-auto sm:min-w-32`}>
        {monthNames(lang).map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select name="year" defaultValue={year} className={`${fieldClass} w-full sm:w-auto sm:min-w-28`}>
        {years.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <button className={`${secondaryBtn} col-span-2 sm:col-span-1`} type="submit">
        {t("عرض", "Show")}
      </button>
    </form>
  );
}
