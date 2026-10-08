import type { Employer } from "@prisma/client";
import { EMPLOYER_KIND } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass } from "./ui";

export async function EmployerForm({
  action,
  employer,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employer?: Employer;
  submitLabel: string;
}) {
  const { lang, t } = await getI18n();
  const legend = "mb-3 text-sm font-bold text-slate-800";
  return (
    <form action={action} className="space-y-5">
      {employer ? <input type="hidden" name="id" value={employer.id} /> : null}

      <fieldset>
        <legend className={legend}>{t("الاسم والهوية", "Name & identity")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("الاسم بالعربية *", "Name in Arabic *")}>
            <input className={`${fieldClass} w-full`} name="name" defaultValue={employer?.name || ""} required />
          </Field>
          <Field label={t("الاسم بالإنجليزية", "Name in English")} hint={t("يظهر في الجانب الإنجليزي من المطبوعات.", "Shown on the English side of prints.")}>
            <input className={`${fieldClass} w-full`} name="nameEn" dir="ltr" defaultValue={employer?.nameEn || ""} />
          </Field>
          <Field label={t("النوع", "Type")}>
            <select className={`${fieldClass} w-full`} name="kind" defaultValue={employer?.kind || "COMPANY"}>
              {Object.entries(EMPLOYER_KIND).map(([id, label]) => (
                <option key={id} value={id}>
                  {pick(label, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("السجل التجاري أو الرقم المدني", "CR or civil ID number")}>
            <input className={`${fieldClass} w-full`} name="idNumber" dir="ltr" defaultValue={employer?.idNumber || ""} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-t border-slate-100 pt-5">
        <legend className={legend}>{t("بيانات التواصل", "Contact details")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("الهاتف", "Phone")}>
            <input className={`${fieldClass} w-full`} name="phone" type="tel" dir="ltr" defaultValue={employer?.phone || ""} />
          </Field>
          <Field label={t("البريد الإلكتروني", "Email")}>
            <input className={`${fieldClass} w-full`} name="email" type="email" dir="ltr" defaultValue={employer?.email || ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("العنوان", "Address")}>
              <input className={`${fieldClass} w-full`} name="address" defaultValue={employer?.address || ""} />
            </Field>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-t border-slate-100 pt-5">
        <legend className={legend}>{t("الشعار والملاحظات", "Logo & notes")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label={t("الشعار", "Logo")} hint={t("يظهر في قسائم الرواتب والإيصالات والكشوف. PNG أو JPG.", "Shown on payslips, receipts and statements. PNG or JPG.")}>
              <input className={`${fieldClass} w-full`} type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
            </Field>
            {employer?.logoUrl ? (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <img src={employer.logoUrl} alt="" className="h-14 w-14 rounded-lg border bg-white object-contain" />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="removeLogo" value="1" />
                  {t("حذف الشعار الحالي", "Remove current logo")}
                </label>
              </div>
            ) : null}
          </div>
          <Field label={t("ملاحظات", "Notes")}>
            <textarea className={`${fieldClass} min-h-24 w-full`} name="notes" defaultValue={employer?.notes || ""} />
          </Field>
        </div>
      </fieldset>

      <div className="border-t border-slate-100 pt-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
