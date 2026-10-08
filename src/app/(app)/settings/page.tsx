import Link from "next/link";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, fieldClass } from "@/components/ui";
import { ROLES, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { inviteMember, removeMember, updateCompanySettings, updateMemberRole, updateProfile } from "@/server/settings-actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t } = await getI18n();
  const company = user.company;
  const isAdmin = user.role === "ADMIN";
  const members = isAdmin
    ? await prisma.membership.findMany({ where: { companyId: user.companyId }, include: { user: true }, orderBy: { createdAt: "asc" } })
    : [];
  const roleLabel = (role: string) =>
    role === "ADMIN"
      ? t("مسؤول — كل الصلاحيات والأعضاء والإعدادات", "Admin — everything incl. members and settings")
      : role === "MANAGER"
        ? t("مدير — كل عمليات الموظفين والرواتب", "Manager — all HR and payroll operations")
        : t("مستخدم — عرض وطباعة فقط", "User — view and print only");
  const roleShort = (role: string) => (role === "ADMIN" ? t("مسؤول", "Admin") : role === "MANAGER" ? t("مدير", "Manager") : t("مستخدم", "User"));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("الإعدادات", "Settings")}
        description={t(
          "بيانات المنشأة الحالية وأعضاؤها وبياناتك الشخصية. بيانات كل منشأة معزولة؛ لا يراها إلا أعضاؤها.",
          "The current company, its members, and your own details. Each company's data is isolated and visible to its members only.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      {isAdmin ? (
        <form action={updateCompanySettings} className="space-y-4">
          <Card className="bg-teal-50 text-sm text-teal-950">
            {t("لتغيير اسم أو شعار شركة أو شخص معيّن تُصرف باسمه الرواتب، افتح", "To change the name or logo of a specific company or person paying salaries, open")}{" "}
            <Link href="/employers" className="font-bold underline">
              {t("دفتر العناوين", "Address book")}
            </Link>
            .
          </Card>
          <Card className="grid gap-4 md:grid-cols-2">
            <h2 className="font-bold md:col-span-2">{t("المنشأة", "Company")}</h2>
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
          <SubmitButton>{t("حفظ إعدادات المنشأة", "Save company settings")}</SubmitButton>
        </form>
      ) : (
        <Card className="text-sm text-slate-700">
          {t("المنشأة:", "Company:")} <span className="font-bold">{company.name}</span> — {t("صلاحيتك:", "your role:")}{" "}
          <span className="font-bold">{roleShort(user.role)}</span>. {t("إعدادات المنشأة وأعضاؤها يديرها المسؤول.", "Company settings and members are managed by an admin.")}
        </Card>
      )}

      <form action={updateProfile} className="mt-6 space-y-4">
        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-bold md:col-span-2">{t("بياناتي", "My details")}</h2>
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
        <SubmitButton>{t("حفظ بياناتي", "Save my details")}</SubmitButton>
      </form>

      {isAdmin ? (
        <Card className="mt-6">
          <h2 className="font-bold">{t("أعضاء المنشأة", "Company members")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t(
              "كل حساب BHD يدخل لأول مرة تُنشأ له منشأته الخاصة فوراً، ولا يرى بيانات أي منشأة أخرى. ليصل شخص إلى بيانات هذه المنشأة أضف بريد حسابه في BHD هنا بالصلاحية المناسبة؛ يُربط تلقائياً عند دخوله.",
              "Every BHD account gets its own company the first time it signs in and never sees another company's data. To give someone access to this company, add their BHD email here with a role; they are linked automatically when they sign in.",
            )}
          </p>
          <form action={inviteMember} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label={t("بريد حساب BHD", "BHD account email")}>
              <input className={`${fieldClass} w-full`} type="email" name="email" dir="ltr" required placeholder="name@example.com" />
            </Field>
            <Field label={t("الصلاحية", "Role")}>
              <select name="role" defaultValue="VIEWER" className={`${fieldClass} w-full`}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleShort(role)}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton>{t("إضافة عضو", "Add member")}</SubmitButton>
          </form>
          <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
            {ROLES.map((role) => (
              <li key={role}>
                <span className="font-semibold text-slate-700">{roleShort(role)}:</span> {roleLabel(role).split("—")[1]?.trim()}
              </li>
            ))}
          </ul>
          <ul className="mt-4 divide-y divide-slate-100">
            {members.map((member) => {
              const self = member.id === user.membershipId;
              return (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {member.user?.name || member.email}
                      {self ? <span className="ms-2 text-xs font-normal text-slate-500">{t("(أنت)", "(you)")}</span> : null}
                    </p>
                    <p className="truncate text-sm text-slate-500" dir="ltr">
                      {member.email}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {member.user ? (
                        <span className={`rounded-full px-2 py-0.5 ${member.user.bhdSub ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                          {member.user.bhdSub ? t("مرتبط بحساب BHD", "BHD account linked") : t("دخول محلي فقط", "Local sign-in only")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{t("لم يدخل بعد — يُربط عند أول دخول", "Not signed in yet — linked on first sign-in")}</span>
                      )}
                    </p>
                  </div>
                  {self ? (
                    <span className="text-sm text-slate-500">{roleShort(member.role)}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateMemberRole} className="flex items-center gap-2">
                        <input type="hidden" name="membershipId" value={member.id} />
                        <select name="role" defaultValue={member.role} className={fieldClass} aria-label={t("الصلاحية", "Role")}>
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleShort(role)}
                            </option>
                          ))}
                        </select>
                        <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
                      </form>
                      <form action={removeMember}>
                        <input type="hidden" name="membershipId" value={member.id} />
                        <button className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                          {t("إزالة", "Remove")}
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
