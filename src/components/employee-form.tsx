import type { Employee } from "@prisma/client";
import Link from "next/link";
import { GENDER_LABEL, STATUS_LABEL, jobs, nationalities } from "@/lib/constants";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { toDateInput } from "@/lib/utils";
import { EmployerPicker } from "./employer-picker";
import { SalaryFields } from "./salary-fields";
import { SubmitButton } from "./submit-button";
import { Card, Field, fieldClass, secondaryBtn } from "./ui";

export async function EmployeeForm({
  action,
  employee,
  currency,
  employers,
  defaultEmployerId,
  showSalary = true,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employee?: Employee;
  currency: string;
  employers: { id: string; name: string; nameEn: string | null }[];
  defaultEmployerId?: string | null;
  /** Without `salaries.edit` the salary block is hidden and the server keeps the saved amounts. */
  showSalary?: boolean;
}) {
  const { lang, t } = await getI18n();
  return (
    <form action={action} className="space-y-5">
      {employee ? <input type="hidden" name="id" value={employee.id} /> : null}
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("الكفيل وصاحب العمل", "Sponsor & employer")}</h2>
        </div>
        <EmployerPicker employers={employers} defaultId={employee ? employee.employerId : defaultEmployerId} />
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("البيانات الشخصية", "Personal details")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {employee
              ? `${t("الرقم الوظيفي:", "Employee no.:")} ${employee.employeeNumber}`
              : t("سيُنشأ الرقم الوظيفي تلقائياً عند الحفظ.", "The employee number is generated on save.")}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("الاسم الكامل", "Full name")}>
            <input className={`${fieldClass} w-full`} name="fullName" defaultValue={employee?.fullName || ""} required />
          </Field>
          <Field label={t("الاسم بالإنجليزية", "Name in English")}>
            <input className={`${fieldClass} w-full`} name="nameEn" dir="ltr" defaultValue={employee?.nameEn || ""} />
          </Field>
          <Field label={t("الجنسية", "Nationality")}>
            <input className={`${fieldClass} w-full`} name="nationality" list="nationalities" defaultValue={employee?.nationality || ""} />
            <datalist id="nationalities">
              {nationalities(lang).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>
          <Field label={t("الجنس", "Gender")}>
            <select className={`${fieldClass} w-full`} name="gender" defaultValue={employee?.gender || ""}>
              <option value="">{t("غير محدد", "Not set")}</option>
              {Object.entries(GENDER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {pick(label, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("تاريخ الميلاد", "Date of birth")}>
            <input className={`${fieldClass} w-full`} type="date" name="dateOfBirth" defaultValue={toDateInput(employee?.dateOfBirth)} />
          </Field>
          <Field label={t("رقم الهاتف", "Phone")}>
            <input className={`${fieldClass} w-full`} type="tel" name="phone" dir="ltr" defaultValue={employee?.phone || ""} />
          </Field>
          <Field label={t("البريد الإلكتروني", "Email")}>
            <input className={`${fieldClass} w-full`} type="email" name="email" dir="ltr" defaultValue={employee?.email || ""} />
          </Field>
          <Field label={t("العنوان", "Address")}>
            <input className={`${fieldClass} w-full`} name="address" defaultValue={employee?.address || ""} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("البطاقة والجواز والإقامة", "ID, passport & residence")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("تواريخ الانتهاء هنا هي مصدر التنبيهات.", "Expiry dates here drive the alerts.")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("رقم البطاقة الشخصية", "ID number")}>
            <input className={`${fieldClass} w-full`} name="idNumber" defaultValue={employee?.idNumber || ""} />
          </Field>
          <Field label={t("انتهاء البطاقة", "ID expiry")}>
            <input className={`${fieldClass} w-full`} type="date" name="idExpiry" defaultValue={toDateInput(employee?.idExpiry)} />
          </Field>
          <Field label={t("رقم الجواز", "Passport number")}>
            <input className={`${fieldClass} w-full`} name="passportNumber" defaultValue={employee?.passportNumber || ""} />
          </Field>
          <Field label={t("انتهاء الجواز", "Passport expiry")}>
            <input className={`${fieldClass} w-full`} type="date" name="passportExpiry" defaultValue={toDateInput(employee?.passportExpiry)} />
          </Field>
          <Field label={t("رقم الإقامة", "Residence number")}>
            <input className={`${fieldClass} w-full`} name="residenceNumber" defaultValue={employee?.residenceNumber || ""} />
          </Field>
          <Field label={t("انتهاء الإقامة", "Residence expiry")}>
            <input className={`${fieldClass} w-full`} type="date" name="residenceExpiry" defaultValue={toDateInput(employee?.residenceExpiry)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">{t("الوظيفة", "Job")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("المسمى الوظيفي", "Job title")}>
            <input className={`${fieldClass} w-full`} name="jobTitle" list="jobs" defaultValue={employee?.jobTitle || ""} />
            <datalist id="jobs">
              {jobs(lang).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>
          <Field label={t("القسم", "Department")}>
            <input className={`${fieldClass} w-full`} name="department" defaultValue={employee?.department || ""} />
          </Field>
          <Field label={t("تاريخ الالتحاق", "Joining date")}>
            <input className={`${fieldClass} w-full`} type="date" name="joiningDate" defaultValue={toDateInput(employee?.joiningDate)} />
          </Field>
          <Field label={t("نهاية العقد", "Contract end")}>
            <input className={`${fieldClass} w-full`} type="date" name="contractEnd" defaultValue={toDateInput(employee?.contractEnd)} />
          </Field>
          <Field label={t("الحالة", "Status")}>
            <select className={`${fieldClass} w-full`} name="status" defaultValue={employee?.status || "ACTIVE"}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {pick(label, lang)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("أرصدة الإجازة", "Leave entitlements")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {t("المتبقي = المستحق + الأيام الإضافية − الإجازات المسجّلة من هذا النوع.", "Remaining = entitlement + extra days − leave taken of that type.")}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("إجازة سنوية مستحقة", "Annual leave")} hint={t("بالأيام في السنة", "Days per year")}>
            <input className={`${fieldClass} w-full`} type="number" min="0" step="0.5" name="annualLeaveDays" defaultValue={employee?.annualLeaveDays ?? 30} />
          </Field>
          <Field label={t("إجازة مرضية مستحقة", "Sick leave")} hint={t("بالأيام", "Days")}>
            <input className={`${fieldClass} w-full`} type="number" min="0" step="0.5" name="sickLeaveDays" defaultValue={employee?.sickLeaveDays ?? 0} />
          </Field>
          <Field label={t("إجازات أخرى مستحقة", "Other leave")} hint={t("بالأيام", "Days")}>
            <input className={`${fieldClass} w-full`} type="number" min="0" step="0.5" name="otherLeaveDays" defaultValue={employee?.otherLeaveDays ?? 0} />
          </Field>
        </div>
      </Card>

      {showSalary ? (
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">{t("الراتب الشهري", "Monthly salary")}</h2>
          <SalaryFields
            currency={currency}
            defaults={{
              basicSalary: employee?.basicSalary || 0,
              housingAllowance: employee?.housingAllowance || 0,
              transportAllowance: employee?.transportAllowance || 0,
              otherAllowance: employee?.otherAllowance || 0,
            }}
          />
        </Card>
      ) : null}

      <Card>
        <Field label={t("ملاحظات", "Notes")}>
          <textarea className={`${fieldClass} min-h-24 w-full`} name="notes" defaultValue={employee?.notes || ""} />
        </Field>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{t("حفظ الموظف", "Save employee")}</SubmitButton>
        <Link href={employee ? `/employees/${employee.id}` : "/employees"} className={secondaryBtn}>
          {t("رجوع", "Back")}
        </Link>
      </div>
    </form>
  );
}
