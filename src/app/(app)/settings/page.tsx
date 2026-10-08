import Link from "next/link";
import { AccessEditor } from "@/components/access-editor";
import { Flash } from "@/components/flash";
import { InviteLink } from "@/components/invite-link";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { normalizePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";
import { inviteMember, removeMember, renewInviteLink, updateCompanySettings, updateMemberAccess, updateProfile } from "@/server/settings-actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; invite?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t } = await getI18n();
  const company = user.company;
  const isAdmin = user.role === "ADMIN";
  const members = isAdmin
    ? await prisma.membership.findMany({ where: { companyId: user.companyId }, include: { user: true }, orderBy: { createdAt: "asc" } })
    : [];
  const origin = await requestOrigin();
  const justInvited = sp.invite ? members.find((member) => member.id === sp.invite) : undefined;
  const roleShort = (role: string) =>
    role === "ADMIN" ? t("مسؤول", "Admin") : role === "MANAGER" ? t("مدير", "Manager") : role === "CUSTOM" ? t("مخصص", "Custom") : t("مستخدم", "User");
  const roleText = (role: string, stored: string[]) =>
    role === "CUSTOM" ? t(`مخصص — ${normalizePermissions(stored).length} صلاحية`, `Custom — ${normalizePermissions(stored).length} permissions`) : roleShort(role);

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
        <Card className="mt-6 scroll-mt-20">
          <div id="members" className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold">{t("المستخدمون والصلاحيات", "Users & permissions")}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                {t(
                  "ادعُ مستخدماً ببريد حسابه في BHD وحدد ما يراه وما يستطيع فعله. يصله رابط دعوة؛ عند فتحه والدخول بنفس البريد تُفتح له بيانات هذه المنشأة بحسب صلاحياته فقط.",
                  "Invite a user by their BHD account email and choose what they can see and do. They get an invitation link; after opening it and signing in with that email, this company opens for them with exactly those permissions.",
                )}
              </p>
            </div>
            <Modal label={t("+ دعوة مستخدم", "+ Invite user")} title={t("دعوة مستخدم جديد", "Invite a new user")} triggerClassName={primaryBtn}>
              <form action={inviteMember} className="space-y-4">
                <Field label={t("بريد حساب BHD للمستخدم", "User's BHD account email")} hint={t("يجب أن يدخل المستخدم بهذا البريد نفسه لقبول الدعوة.", "The user must sign in with this same email to accept.")}>
                  <input className={`${fieldClass} w-full`} type="email" name="email" dir="ltr" required placeholder="name@example.com" />
                </Field>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">{t("الصلاحيات", "Permissions")}</p>
                  <AccessEditor defaultRole="VIEWER" />
                </div>
                <SubmitButton pendingLabel={t("جارٍ إنشاء الدعوة...", "Creating invitation...")}>{t("إنشاء الدعوة", "Create invitation")}</SubmitButton>
              </form>
            </Modal>
          </div>

          {justInvited?.inviteToken ? (
            <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-teal-900">
                {t("رابط دعوة", "Invitation link for")} <span dir="ltr">{justInvited.email}</span>
              </p>
              <InviteLink url={`${origin}/invite/${justInvited.inviteToken}`} email={justInvited.email} company={company.name} />
            </div>
          ) : null}

          <ul className="mt-4 divide-y divide-slate-100">
            {members.map((member) => {
              const self = member.id === user.membershipId;
              const stored = Array.isArray(member.permissions) ? (member.permissions as string[]) : [];
              const pending = !member.userId;
              const linkUrl = member.inviteToken ? `${origin}/invite/${member.inviteToken}` : null;
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
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{roleText(member.role, stored)}</span>
                      {pending ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                          {t("دعوة معلّقة", "Invitation pending")}
                          {member.invitedAt ? ` — ${formatDate(member.invitedAt)}` : ""}
                        </span>
                      ) : member.user?.bhdSub ? (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">{t("مرتبط بحساب BHD", "BHD account linked")}</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{t("دخول محلي فقط", "Local sign-in only")}</span>
                      )}
                    </p>
                  </div>
                  {self ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Modal label={t("الصلاحيات", "Permissions")} title={t(`صلاحيات ${member.user?.name || member.email}`, `Permissions — ${member.user?.name || member.email}`)} triggerClassName={secondaryBtn}>
                        <form action={updateMemberAccess} className="space-y-4">
                          <input type="hidden" name="membershipId" value={member.id} />
                          <AccessEditor defaultRole={member.role} defaultPermissions={stored} />
                          <SubmitButton>{t("حفظ الصلاحيات", "Save permissions")}</SubmitButton>
                        </form>
                      </Modal>
                      {pending ? (
                        <Modal label={t("رابط الدعوة", "Invite link")} title={t("رابط الدعوة", "Invitation link")} triggerClassName={secondaryBtn}>
                          <div className="space-y-4">
                            {linkUrl ? (
                              <InviteLink url={linkUrl} email={member.email} company={company.name} />
                            ) : (
                              <p className="text-sm text-slate-500">{t("لا يوجد رابط لهذه الدعوة بعد. أنشئ رابطاً.", "No link for this invitation yet. Create one.")}</p>
                            )}
                            <form action={renewInviteLink}>
                              <input type="hidden" name="membershipId" value={member.id} />
                              <SubmitButton variant="secondary">{linkUrl ? t("إنشاء رابط جديد (يُلغي السابق)", "New link (cancels the old one)") : t("إنشاء رابط", "Create link")}</SubmitButton>
                            </form>
                          </div>
                        </Modal>
                      ) : null}
                      <form action={removeMember}>
                        <input type="hidden" name="membershipId" value={member.id} />
                        <SubmitButton variant="danger" confirm={pending ? t("إلغاء هذه الدعوة؟", "Cancel this invitation?") : t(`إزالة ${member.email} من المنشأة؟`, `Remove ${member.email} from the company?`)}>
                          {pending ? t("إلغاء الدعوة", "Cancel invite") : t("إزالة", "Remove")}
                        </SubmitButton>
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
