import { ShieldCheck } from "lucide-react";
import { fieldClass } from "@/components/ui";
import { OMAN_BANKS } from "@/lib/banks";
import { pick, type Lang } from "@/lib/i18n";
import { nationalityOptions } from "@/lib/nationalities";
import { SELF_FIELD_LABEL, type SelfField } from "@/lib/self-data";
import { todayInputValue } from "@/lib/utils";

/**
 * Inputs for file fields the employee fills in themselves (names `self_<field>`), with the declaration that they are
 * correct and the employee's responsibility (`selfConfirm`). Read on the server by readSelfInput.
 */
export function SelfDataFields({ fields, lang, t, required, intro }: { fields: readonly SelfField[]; lang: Lang; t: (ar: string, en: string) => string; required: boolean; intro?: string }) {
  if (!fields.length) return null;
  const today = todayInputValue();
  const input = `${fieldClass} w-full`;
  const control = (field: SelfField) => {
    const name = `self_${field}`;
    switch (field) {
      case "nationality":
        return (
          <select className={input} name={name} required={required} defaultValue="">
            <option value="" disabled>
              {t("اختر…", "Choose…")}
            </option>
            {nationalityOptions(lang).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "gender":
        return (
          <select className={input} name={name} required={required} defaultValue="">
            <option value="" disabled>
              {t("اختر…", "Choose…")}
            </option>
            <option value="MALE">{t("ذكر", "Male")}</option>
            <option value="FEMALE">{t("أنثى", "Female")}</option>
          </select>
        );
      case "bankBic":
        return (
          <select className={input} name={name} required={required} defaultValue="">
            <option value="" disabled>
              {t("اختر البنك…", "Choose the bank…")}
            </option>
            {OMAN_BANKS.map((bank) => (
              <option key={bank.bic} value={bank.bic}>
                {bank[lang]}
              </option>
            ))}
          </select>
        );
      case "dateOfBirth":
        return <input className={input} type="date" name={name} max={today} required={required} dir="ltr" />;
      case "idExpiry":
      case "passportExpiry":
        return <input className={input} type="date" name={name} min={today} required={required} dir="ltr" />;
      case "phone":
        return <input className={input} type="tel" name={name} inputMode="tel" placeholder="+968 9123 4567" maxLength={30} required={required} dir="ltr" />;
      case "address":
        return <input className={input} name={name} maxLength={300} placeholder={t("المدينة، المنطقة، الشارع / رقم المبنى", "City, area, street / building")} required={required} />;
      case "bankAccount":
        return <input className={input} name={name} inputMode="numeric" autoComplete="off" maxLength={34} required={required} dir="ltr" />;
      default:
        return <input className={`${input} uppercase`} name={name} maxLength={20} autoComplete="off" required={required} dir="ltr" />;
    }
  };

  return (
    <div className="min-w-0 space-y-3 rounded-2xl bg-amber-50/70 p-3 ring-1 ring-inset ring-amber-200 @md:p-4">
      <p className="text-sm leading-6 font-semibold text-amber-900">
        {intro || t("هذه البيانات غير موجودة في ملفك. أدخلها لتُحفظ في ملفك.", "These details are missing from your file. Enter them to save them to your file.")}
      </p>
      <div className="grid gap-3 @md:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className={`block min-w-0 space-y-1.5 ${field === "address" ? "@md:col-span-2" : ""}`}>
            <span className="text-sm font-medium text-slate-700">{pick(SELF_FIELD_LABEL[field], lang)}</span>
            {control(field)}
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2.5 rounded-xl bg-surface p-3 text-sm leading-6 text-slate-800 ring-1 ring-inset ring-amber-200">
        <input type="checkbox" name="selfConfirm" value="1" required className="mt-1 size-4 shrink-0 accent-teal-700" />
        <span className="min-w-0">
          <ShieldCheck size={15} className="me-1 inline align-[-2px] text-amber-700" />
          {t(
            "أقرّ بأن البيانات التي أدخلتها صحيحة وكاملة وتخصّني، وأتحمّل المسؤولية كاملة عن صحتها وعن أي خطاب أو مستند يصدر بناءً عليها.",
            "I declare that the details I entered are correct, complete and my own, and I take full responsibility for them and for any letter or document issued based on them.",
          )}
        </span>
      </label>
      <p className="text-xs leading-5 text-slate-500">
        {t("تُحفظ في ملفك مع تاريخ إقرارك، وتظهر للموارد البشرية على أنها مُدخلة منك. لتغييرها لاحقاً أرسل طلب تصحيح.", "They are saved to your file with the date of your declaration and shown to HR as entered by you. To change them later, send a correction request.")}
      </p>
    </div>
  );
}
