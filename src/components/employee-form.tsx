import type { Employee, EmployeeAllowance } from "@prisma/client";
import Link from "next/link";
import { GENDER_LABEL, STATUS_LABEL, termText } from "@/lib/constants";
import type { getHrCatalog } from "@/lib/hr-catalog";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { leaveOverrides } from "@/lib/leave";
import { DEFAULT_NATIONALITY, findNationality, nationalityOptions } from "@/lib/nationalities";
import { currentPeriod, daysLabel, toDateInput } from "@/lib/utils";
import { BilingualFields } from "./bilingual-fields";
import { EmployerPicker } from "./employer-picker";
import { SalaryFields } from "./salary-fields";
import { SearchSelect } from "./search-select";
import { SubmitButton } from "./submit-button";
import { Card, Field, fieldClass, secondaryBtn } from "./ui";

type Catalog = Awaited<ReturnType<typeof getHrCatalog>>;

const FILE_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export async function EmployeeForm({
  action,
  employee,
  currency,
  employers,
  catalog,
  allowances = [],
  defaultEmployerId,
  showSalary = true,
  canManageCatalog = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employee?: Employee;
  currency: string;
  employers: { id: string; name: string; nameEn: string | null }[];
  catalog: Catalog;
  allowances?: EmployeeAllowance[];
  defaultEmployerId?: string | null;
  /** Without `salaries.edit` the salary block is hidden and the server keeps the saved amounts and allowances. */
  showSalary?: boolean;
  /** Admins get links to edit the job title, department, leave and allowance lists. */
  canManageCatalog?: boolean;
}) {
  const { lang, t } = await getI18n();
  const now = currentPeriod();
  const defaultStart = `${now.year}-${String(now.month).padStart(2, "0")}`;

  const nationalities = nationalityOptions(lang);
  const storedNationality = employee?.nationality || null;
  const nationalityValue = employee ? findNationality(storedNationality)?.code || storedNationality || "" : DEFAULT_NATIONALITY;
  if (nationalityValue && !nationalities.some((option) => option.value === nationalityValue)) {
    nationalities.push({ value: nationalityValue, label: nationalityValue, hint: "" });
  }
  const other = lang === "en" ? "ar" : "en";
  const catalogOptions = (list: { id: string; nameAr: string; nameEn: string | null }[]) =>
    list
      .map((item) => ({ value: item.id, label: termText(item.nameAr, item.nameEn, lang) || item.nameAr, hint: other === "en" ? item.nameEn : item.nameAr }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  const overrides = leaveOverrides(employee?.leaveDays);
  const manageLink = (tab: string, label: string) =>
    canManageCatalog ? (
      <Link href={`/settings/hr?tab=${tab}`} target="_blank" className="text-xs font-semibold text-teal-800 underline">
        {label}
      </Link>
    ) : null;

  const docRow = (prefix: "id" | "passport" | "residence", numberLabel: string, expiryLabel: string, current: string | null | undefined) => (
    <div className="grid gap-4 rounded-xl border border-slate-100 p-3 md:grid-cols-3">
      <Field label={numberLabel}>
        <input className={`${fieldClass} w-full`} name={`${prefix}Number`} defaultValue={(employee?.[`${prefix}Number`] as string | null) || ""} />
      </Field>
      <Field label={expiryLabel}>
        <input className={`${fieldClass} w-full`} type="date" name={`${prefix}Expiry`} defaultValue={toDateInput(employee?.[`${prefix}Expiry`] as Date | null)} />
      </Field>
      <div className="space-y-1.5">
        <Field label={current ? t("استبدال المرفق", "Replace attachment") : t("المرفق (صورة أو PDF)", "Attachment (image or PDF)")} hint={t("حتى 4 ميغابايت", "Up to 4 MB")}>
          <input className={`${fieldClass} w-full`} type="file" name={`${prefix}File`} accept={FILE_ACCEPT} />
        </Field>
        {current ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a href={current} target="_blank" className="font-semibold text-teal-800 underline">
              {t("عرض المرفق الحالي", "View current file")}
            </a>
            <label className="flex items-center gap-1 text-slate-600">
              <input type="checkbox" name={`${prefix}FileRemove`} value="1" className="accent-red-700" />
              {t("حذف المرفق", "Remove file")}
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );

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
              : t("سيُنشأ الرقم الوظيفي تلقائياً عند الحفظ.", "The employee number is generated on save.")}{" "}
            {t(
              "اكتب الاسم بلغة واحدة فتُكتب الأخرى تلقائياً بالذكاء الاصطناعي، ويمكنك تعديلها.",
              "Type the name in one language and AI fills in the other; you can still edit it.",
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <BilingualFields
            arName="fullName"
            enName="nameEn"
            arLabel={t("الاسم الكامل (عربي)", "Full name (Arabic)")}
            enLabel={t("الاسم بالإنجليزية", "Name in English")}
            arDefault={employee?.fullName}
            enDefault={employee?.nameEn}
            kind="name"
            required
          />
          <Field label={t("الجنسية", "Nationality")}>
            <SearchSelect
              name="nationality"
              options={nationalities}
              defaultValue={nationalityValue}
              emptyLabel={t("غير محدد", "Not set")}
              ariaLabel={t("الجنسية", "Nationality")}
            />
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
          <p className="mt-1 text-xs text-slate-500">
            {t("تواريخ الانتهاء هنا هي مصدر التنبيهات. أرفق نسخة من كل وثيقة بجانب تاريخها.", "Expiry dates here drive the alerts. Attach a copy of each document next to its date.")}
          </p>
        </div>
        <div className="space-y-3">
          {docRow("id", t("رقم البطاقة الشخصية", "ID number"), t("انتهاء البطاقة", "ID expiry"), employee?.idFileUrl)}
          {docRow("passport", t("رقم الجواز", "Passport number"), t("انتهاء الجواز", "Passport expiry"), employee?.passportFileUrl)}
          {docRow("residence", t("رقم الإقامة", "Residence number"), t("انتهاء الإقامة", "Residence expiry"), employee?.residenceFileUrl)}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">{t("الوظيفة", "Job")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">{t("المسمى الوظيفي", "Job title")}</span>
              {manageLink("jobs", t("إضافة / تعديل المسميات", "Add / edit titles"))}
            </div>
            <SearchSelect
              name="jobTitleId"
              options={catalogOptions(catalog.jobTitles)}
              defaultValue={employee?.jobTitleId || ""}
              emptyLabel={t("غير محدد", "Not set")}
              ariaLabel={t("المسمى الوظيفي", "Job title")}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">{t("القسم", "Department")}</span>
              {manageLink("departments", t("إضافة / تعديل الأقسام", "Add / edit departments"))}
            </div>
            <SearchSelect
              name="departmentId"
              options={catalogOptions(catalog.departments)}
              defaultValue={employee?.departmentId || ""}
              emptyLabel={t("غير محدد", "Not set")}
              ariaLabel={t("القسم", "Department")}
            />
          </div>
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t("أرصدة الإجازة", "Leave entitlements")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t(
                "اترك الخانة فارغة ليأخذ الموظف العدد المحدد في الضبط. المتبقي = المستحق + الأيام الإضافية − الإجازات المسجّلة.",
                "Leave a box empty to use the number set in Settings. Remaining = entitlement + extra days − leave taken.",
              )}
            </p>
          </div>
          {manageLink("leave", t("إدارة أنواع الإجازات", "Manage leave types"))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {catalog.leaveTypes.map((type) => (
            <Field
              key={type.key}
              label={termText(type.nameAr, type.nameEn, lang) || type.nameAr}
              hint={
                t(`الافتراضي ${daysLabel(type.days)} يوم`, `Default ${daysLabel(type.days)} day(s)`) +
                (type.allJobs ? "" : t(" — لوظائف محددة فقط", " — selected job titles only"))
              }
            >
              <input
                className={`${fieldClass} w-full`}
                type="number"
                min="0"
                max="366"
                step="0.5"
                name={`leave_${type.key}`}
                placeholder={daysLabel(type.days)}
                defaultValue={overrides[type.key] ?? ""}
              />
            </Field>
          ))}
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
            allowances={{
              types: catalog.allowanceTypes.map(({ id, nameAr, nameEn, calc, base, value, frequency, payMonth }) => ({ id, nameAr, nameEn, calc, base, value, frequency, payMonth })),
              rows: allowances.map((row) => ({
                id: row.id,
                allowanceTypeId: row.allowanceTypeId,
                calc: row.calc,
                base: row.base,
                value: row.value,
                frequency: row.frequency,
                payMonth: row.payMonth,
                start: `${row.startYear}-${String(row.startMonth).padStart(2, "0")}`,
                active: row.active,
              })),
              defaultStart,
              canManageTypes: canManageCatalog,
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
