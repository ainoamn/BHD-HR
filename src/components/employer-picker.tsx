"use client";

import { useState } from "react";
import { EMPLOYER_KIND, NEW_EMPLOYER } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { useLang } from "./lang-provider";
import { Field, fieldClass } from "./ui";

export function EmployerPicker({
  employers,
  defaultId,
}: {
  employers: { id: string; name: string; nameEn: string | null }[];
  defaultId?: string | null;
}) {
  const { lang, t } = useLang();
  const [value, setValue] = useState(defaultId || (employers.length ? employers[0].id : NEW_EMPLOYER));

  return (
    <div className="space-y-4">
      <Field
        label={t("الكفيل / صاحب العمل", "Sponsor / employer")}
        hint={t("يُختار من دفتر العناوين، أو أضف كفيلًا جديدًا فيُحفظ في الدفتر ويُربط بالموظف.", "Pick from the address book, or add a new sponsor; it is saved to the book and linked.")}
      >
        <select className={`${fieldClass} w-full`} name="employerId" value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">{t("بدون كفيل", "No sponsor")}</option>
          {employers.map((employer) => (
            <option key={employer.id} value={employer.id}>
              {lang === "en" && employer.nameEn ? employer.nameEn : employer.name}
            </option>
          ))}
          <option value={NEW_EMPLOYER}>{t("+ كفيل جديد", "+ New sponsor")}</option>
        </select>
      </Field>
      {value === NEW_EMPLOYER ? (
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
          <Field label={t("اسم الكفيل بالعربية", "Sponsor name (Arabic)")}>
            <input className={`${fieldClass} w-full`} name="newEmployerName" required />
          </Field>
          <Field label={t("الاسم بالإنجليزية", "Name (English)")}>
            <input className={`${fieldClass} w-full`} name="newEmployerNameEn" dir="ltr" />
          </Field>
          <Field label={t("النوع", "Type")}>
            <select className={`${fieldClass} w-full`} name="newEmployerKind" defaultValue="COMPANY">
              {Object.entries(EMPLOYER_KIND).map(([id, label]) => (
                <option key={id} value={id}>
                  {pick(label, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("السجل التجاري / الرقم المدني", "CR / civil ID")}>
            <input className={`${fieldClass} w-full`} name="newEmployerIdNumber" />
          </Field>
          <Field label={t("الهاتف", "Phone")}>
            <input className={`${fieldClass} w-full`} name="newEmployerPhone" />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
