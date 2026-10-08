import Link from "next/link";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, fieldClass } from "@/components/ui";
import { ROLES, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { updateSettings, updateUserRole } from "@/server/settings-actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t } = await getI18n();
  const company = user.company;
  const users = await prisma.user.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } });
  const roleLabel = (role: string) =>
    role === "ADMIN" ? t("مسؤول (كل الصلاحيات)", "Admin (full access)") : role === "VIEWER" ? t("عرض فقط", "View only") : t("بانتظار التفعيل", "Pending");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("الإعدادات", "Settings")}
        description={t(
          "اسم النظام وشعاره الافتراضي. اسم وشعار كل صاحب عمل يُعدّل من دفتر العناوين ويظهر في قسيمة الراتب والإيصال.",
          "Default system name and logo. Each employer's own name and logo is edited in the Address book and shown on payslips and receipts.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />
      <Card className="mb-4 bg-teal-50 text-sm text-teal-950">
        {t("لتغيير اسم أو شعار شركة أو شخص معيّن تُصرف باسمه الرواتب، افتح", "To change the name or logo of a specific company or person paying salaries, open")}{" "}
        <Link href="/employers" className="font-bold underline">
          {t("دفتر العناوين", "Address book")}
        </Link>
        .
      </Card>
      <form action={updateSettings} className="space-y-4">
        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-bold md:col-span-2">{t("النظام / المنشأة الافتراضية", "System / default company")}</h2>
          <Field label={t("الاسم بالعربية", "Name (Arabic)")}>
            <input className={`${fieldClass} w-full`} name="name" defaultValue={company.name} required />
          </Field>
          <Field label={t("الاسم بالإنجليزية", "Name (English)")}>
            <input className={`${fieldClass} w-full`} name="nameEn" dir="ltr" defaultValue={company.nameEn || ""} />
          </Field>
          <Field label={t("السجل التجاري", "CR number")}>
            <input className={`${fieldClass} w-full`} name="crNumber" defaultValue={company.crNumber || ""} />
          </Field>
          <Field label={t("الهاتف", "Phone")}>
            <input className={`${fieldClass} w-full`} name="phone" defaultValue={company.phone || ""} />
          </Field>
          <Field label={t("البريد", "Email")}>
            <input className={`${fieldClass} w-full`} name="email" dir="ltr" defaultValue={company.email || ""} />
          </Field>
          <Field label={t("العملة", "Currency")}>
            <input className={`${fieldClass} w-full`} name="currency" defaultValue={company.currency} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t("العنوان", "Address")}>
              <input className={`${fieldClass} w-full`} name="address" defaultValue={company.address || ""} />
            </Field>
          </div>
          <Field label={t("الشعار", "Logo")} hint={t("PNG أو JPG.", "PNG or JPG.")}>
            <input className={`${fieldClass} w-full`} type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
          </Field>
          {company.logoUrl ? (
            <div className="flex items-end gap-3">
              <img src={company.logoUrl} alt="" className="h-16 w-16 rounded-lg border object-contain" />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="removeLogo" value="1" />
                {t("حذف الشعار", "Remove logo")}
              </label>
            </div>
          ) : null}
        </Card>
        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-bold md:col-span-2">{t("الرواتب والتنبيهات", "Payroll & alerts")}</h2>
          <Field label={t("أيام حساب الراتب", "Salary days")} hint={t("عادة 30. قيمة اليوم = إجمالي الراتب ÷ هذا الرقم.", "Usually 30. Daily rate = gross ÷ this number.")}>
            <input className={`${fieldClass} w-full`} type="number" min="1" max="31" name="salaryDays" defaultValue={company.salaryDays} />
          </Field>
          <Field label={t("تنبيه عاجل خلال (يوم)", "Urgent alert within (days)")}>
            <input className={`${fieldClass} w-full`} type="number" min="1" name="alertUrgentDays" defaultValue={company.alertUrgentDays} />
          </Field>
          <Field label={t("تنبيه تحذير خلال (يوم)", "Warning within (days)")}>
            <input className={`${fieldClass} w-full`} type="number" min="1" name="alertWarningDays" defaultValue={company.alertWarningDays} />
          </Field>
          <Field label={t("تنبيه مبكر خلال (يوم)", "Early notice within (days)")}>
            <input className={`${fieldClass} w-full`} type="number" min="1" name="alertEarlyDays" defaultValue={company.alertEarlyDays} />
          </Field>
          <Field
            label={t("يوم استحقاق الرواتب", "Salary pay day")}
            hint={t("يظهر في التقويم كل شهر. اختر 0 لآخر يوم في الشهر.", "Shown on the calendar every month. Use 0 for the last day of the month.")}
          >
            <input className={`${fieldClass} w-full`} type="number" min="0" max="31" name="payDay" defaultValue={company.payDay} />
          </Field>
          <Field
            label={t("تنبيه نفاد الإجازة عند بقاء (يوم)", "Leave alert when days left ≤")}
            hint={t("يظهر تنبيه أحمر عندما يقترب رصيد الموظف من النفاد أو يتجاوزه.", "A red alert appears when an employee's balance is nearly or fully used.")}
          >
            <input className={`${fieldClass} w-full`} type="number" min="0" max="60" name="leaveWarningDays" defaultValue={company.leaveWarningDays} />
          </Field>
        </Card>
        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-bold md:col-span-2">{t("المستخدم", "User")}</h2>
          <Field label={t("الاسم", "Name")}>
            <input className={`${fieldClass} w-full`} name="userName" defaultValue={user.name} />
          </Field>
          {user.bhdSub ? (
            <Field label={t("البريد", "Email")} hint={t("مرتبط بحساب BHD الموحّد.", "Linked to your unified BHD account.")}>
              <input className={`${fieldClass} w-full`} dir="ltr" value={user.email} readOnly />
            </Field>
          ) : (
            <Field
              label={t("البريد", "Email")}
              hint={t("اجعله نفس بريد حسابك في BHD ليُربط تلقائياً عند الدخول الموحّد.", "Use the same email as your BHD account so unified sign-in links it automatically.")}
            >
              <input className={`${fieldClass} w-full`} type="email" dir="ltr" name="userEmail" defaultValue={user.email} required />
            </Field>
          )}
          {user.password ? (
            <>
              <Field label={t("كلمة المرور الحالية", "Current password")}>
                <input className={`${fieldClass} w-full`} type="password" name="currentPassword" autoComplete="current-password" />
              </Field>
              <Field label={t("كلمة المرور الجديدة", "New password")}>
                <input className={`${fieldClass} w-full`} type="password" name="newPassword" autoComplete="new-password" />
              </Field>
            </>
          ) : null}
        </Card>
        <SubmitButton>{t("حفظ الإعدادات", "Save settings")}</SubmitButton>
      </form>
      {user.role === "ADMIN" ? (
        <Card className="mt-6">
          <h2 className="font-bold">{t("المستخدمون", "Users")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t(
              "من يدخل بحساب BHD لأول مرة يظهر هنا «بانتظار التفعيل» ولا يرى أي بيانات حتى تمنحه صلاحية.",
              "Anyone signing in with a BHD account for the first time appears here as “Pending” and sees nothing until you grant access.",
            )}
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {users.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {member.name}
                    {member.id === user.id ? <span className="ms-2 text-xs font-normal text-slate-500">{t("(أنت)", "(you)")}</span> : null}
                  </p>
                  <p className="truncate text-sm text-slate-500" dir="ltr">
                    {member.email}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${member.bhdSub ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                      {member.bhdSub ? t("مرتبط بحساب BHD", "BHD account linked") : t("دخول محلي فقط", "Local sign-in only")}
                    </span>
                    {member.role === "PENDING" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{t("بانتظار التفعيل", "Pending")}</span> : null}
                  </p>
                </div>
                {member.id === user.id ? (
                  <span className="text-sm text-slate-500">{roleLabel(member.role)}</span>
                ) : (
                  <form action={updateUserRole} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={member.id} />
                    <select name="role" defaultValue={member.role} className={fieldClass} aria-label={t("الصلاحية", "Role")}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
