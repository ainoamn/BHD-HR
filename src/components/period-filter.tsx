import { CalendarSearch } from "lucide-react";
import { monthNames } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { GetForm } from "./get-form";
import { fieldClass, primaryBtn } from "./ui";

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
    <GetForm
      className="no-print grid w-full grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-card sm:flex sm:w-auto sm:flex-wrap sm:items-center"
    >
      {employers ? (
        <select
          name="employerId"
          defaultValue={employerId || ""}
          aria-label={t("صاحب العمل", "Employer")}
          className={`${fieldClass} col-span-3 w-full sm:w-auto sm:min-w-44`}
        >
          <option value="">{t("كل أصحاب العمل", "All employers")}</option>
          {employers.map((employer) => (
            <option key={employer.id} value={employer.id}>
              {lang === "en" && employer.nameEn ? employer.nameEn : employer.name}
            </option>
          ))}
          <option value="none">{t("بدون صاحب عمل", "No employer")}</option>
        </select>
      ) : null}
      <select
        name="month"
        defaultValue={month}
        aria-label={t("الشهر", "Month")}
        className={`${fieldClass} w-full sm:w-auto sm:min-w-32`}
      >
        {monthNames(lang).map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        name="year"
        defaultValue={year}
        aria-label={t("السنة", "Year")}
        className={`${fieldClass} w-full sm:w-auto sm:min-w-24`}
      >
        {years.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <button className={`${primaryBtn} px-3.5`} type="submit">
        <CalendarSearch size={16} />
        {t("عرض", "Show")}
      </button>
    </GetForm>
  );
}
