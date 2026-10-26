import { Hash, ShieldAlert } from "lucide-react";
import { employeeNumberPrefix, formatEmployeeNumber, type EmployeeNumberSort } from "@/lib/employee-number";
import { rebuildEmployerNumbers, updateEmployerCode } from "@/server/employer-actions";
import { SubmitButton } from "./submit-button";
import { Field, SectionTitle, fieldClass } from "./ui";

export function EmployerNumbersPanel({
  employerId,
  employeeCode,
  numberRebuilds,
  employeeCount,
  nextPreview,
  canEdit,
  t,
}: {
  employerId: string;
  employeeCode: string | null;
  numberRebuilds: number;
  employeeCount: number;
  nextPreview: string;
  canEdit: boolean;
  t: (ar: string, en: string) => string;
}) {
  const prefix = employeeNumberPrefix(employeeCode);
  const needsPassword = numberRebuilds > 0;
  if (!canEdit) {
    return (
      <div className="space-y-2 text-sm text-slate-600">
        <p>
          {t("رمز الأرقام:", "Number code:")}{" "}
          <span className="tabular font-bold text-slate-900" dir="ltr">
            {prefix}
          </span>
          {" · "}
          {t("المثال التالي:", "Next example:")}{" "}
          <span className="tabular font-semibold" dir="ltr">
            {nextPreview}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle hint={t("يظهر الرمز في رقم كل موظف (مثل SFH-0001).", "The code appears in every employee number (e.g. SFH-0001).")}>
        <span className="inline-flex items-center gap-2">
          <Hash size={18} className="text-teal-700" />
          {t("أرقام الموظفين", "Employee numbers")}
        </span>
      </SectionTitle>

      <form action={updateEmployerCode} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="id" value={employerId} />
        <Field
          label={t("رمز الشركة في الرقم الوظيفي", "Company code in the employee number")}
          hint={t("حرفان إلى 8 أحرف لاتينية أو أرقام. إن تُرك فارغاً يُستخدم EMP.", "2–8 Latin letters or digits. Leave empty to use EMP.")}
        >
          <input
            className={`${fieldClass} w-full font-semibold tracking-wide`}
            name="employeeCode"
            dir="ltr"
            maxLength={8}
            defaultValue={employeeCode || ""}
            placeholder="SFH"
            autoComplete="off"
          />
        </Field>
        <SubmitButton variant="secondary">{t("حفظ الرمز", "Save code")}</SubmitButton>
      </form>

      <p className="text-sm text-slate-600">
        {t("الموظف الجديد سيأخذ الرقم:", "New employees will get:")}{" "}
        <span className="tabular font-bold text-slate-900" dir="ltr">
          {nextPreview}
        </span>
        {employeeCount ? (
          <span className="block text-xs text-slate-500">{t(`${employeeCount} موظف مسجّل حالياً.`, `${employeeCount} employee(s) on file.`)}</span>
        ) : null}
      </p>

      <div className="space-y-3 rounded-2xl bg-amber-50/70 px-4 py-3 ring-1 ring-inset ring-amber-200/80">
        <div className="flex items-start gap-2">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-800" />
          <div className="min-w-0 text-sm text-amber-950">
            <p className="font-bold">{t("إعادة بناء الأرقام المتسلسلة", "Rebuild sequential numbers")}</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/90">
              {needsPassword
                ? t(
                    "سبق إعادة الترقيم مرة. لإعادة الترتيب مجدداً أدخل كلمة مرور حسابك حتى لا تتغيّر هوية الموظفين بالخطأ.",
                    "Numbers were rebuilt before. Enter your account password to rebuild again so employee identities are not changed by mistake.",
                  )
                : t(
                    "مرة واحدة مجاناً: رتّب الأرقام حسب الأقدمية أو الوظيفة أو الاسم، ثم يُثبَّت التسلسل. بعد ذلك يلزم كلمة المرور.",
                    "Once for free: order numbers by seniority, job title, or name, then the series is locked. After that a password is required.",
                  )}
            </p>
          </div>
        </div>

        {employeeCount === 0 ? (
          <p className="text-xs text-amber-900/80">{t("لا يوجد موظفون لإعادة ترقيمهم بعد.", "No employees to renumber yet.")}</p>
        ) : (
          <form action={rebuildEmployerNumbers} className="space-y-3">
            <input type="hidden" name="id" value={employerId} />
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-amber-950">{t("ترتيب البناء", "Build order")}</legend>
              {(
                [
                  ["seniority", t("حسب الأقدمية (تاريخ الالتحاق)", "By seniority (joining date)")],
                  ["job", t("حسب المسمى الوظيفي ثم الأقدمية", "By job title, then seniority")],
                  ["name", t("حسب الاسم أبجدياً", "By name (alphabetical)")],
                ] as [EmployeeNumberSort, string][]
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-amber-950">
                  <input type="radio" name="sort" value={value} defaultChecked={value === "seniority"} className="accent-amber-800" />
                  {label}
                </label>
              ))}
            </fieldset>
            {needsPassword ? (
              <Field label={t("كلمة مرور حسابك", "Your account password")}>
                <input className={`${fieldClass} w-full`} type="password" name="password" required autoComplete="current-password" dir="ltr" />
              </Field>
            ) : null}
            <p className="text-xs text-amber-900/80" dir="ltr">
              {t("مثال بعد البناء:", "Example after rebuild:")} {formatEmployeeNumber(employeeCode, 1)}
              {employeeCount > 1 ? ` … ${formatEmployeeNumber(employeeCode, Math.min(employeeCount, 3))}` : ""}
            </p>
            <SubmitButton
              variant="secondary"
              confirm={
                needsPassword
                  ? t("إعادة ترقيم كل موظفي هذا الكفيل؟ الأرقام الحالية ستتغير.", "Renumber all employees of this sponsor? Current numbers will change.")
                  : t(
                      "بناء الأرقام لأول مرة حسب الترتيب المختار؟ يمكنك إعادة الترتيب لاحقاً بكلمة المرور فقط.",
                      "Build numbers for the first time in the chosen order? Later rebuilds will require your password.",
                    )
              }
            >
              {needsPassword ? t("إعادة الترقيم بكلمة المرور", "Rebuild with password") : t("بناء الأرقام لأول مرة", "Build numbers (first time)")}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
