import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BellRing, Building2, ChevronLeft, ChevronRight, Info, Mail, MessageCircle, Save, Send, Settings, ShieldCheck, Sparkles, UserCog, UserPlus } from "lucide-react";
import { AccessEditor } from "@/components/access-editor";
import { Flash } from "@/components/flash";
import { InviteLink } from "@/components/invite-link";
import { Modal } from "@/components/modal";
import { PhoneField } from "@/components/phone-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { normalizePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";
import { sendPendingLetterCopies } from "@/server/letter-actions";
import { inviteMember, removeMember, renewInviteLink, updateCompanySettings, updateMemberAccess, updateProfile } from "@/server/settings-actions";

function SectionHead({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 md:col-span-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
          <Icon size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {text ? <p className="mt-0.5 max-w-xl text-xs leading-5 text-slate-500">{text}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; invite?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const company = user.company;
  const isAdmin = user.role === "ADMIN";
  const members = isAdmin
    ? await prisma.membership.findMany({ where: { companyId: user.companyId }, include: { user: true }, orderBy: { createdAt: "asc" } })
    : [];
  const deliveryCounts = isAdmin
    ? await prisma.letterDelivery.groupBy({ by: ["channel", "status"], where: { letter: { companyId: user.companyId, cancelledAt: null } }, _count: { _all: true } })
    : [];
  const countOf = (channel: string, status: string) => deliveryCounts.find((row) => row.channel === channel && row.status === status)?._count._all || 0;
  const channelRows = [
    { id: "EMAIL" as const, label: t("البريد الإلكتروني", "Email"), icon: Mail, env: "RESEND_API_KEY, MAIL_FROM" },
    { id: "WHATSAPP" as const, label: t("واتساب", "WhatsApp"), icon: MessageCircle, env: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE" },
  ].map((row) => ({ ...row, ready: channelReady(row.id), pending: countOf(row.id, "PENDING"), sent: countOf(row.id, "SENT"), failed: countOf(row.id, "FAILED") }));
  const pendingTotal = channelRows.reduce((sum, row) => sum + row.pending, 0);
  const origin = await requestOrigin();
  const justInvited = sp.invite ? members.find((member) => member.id === sp.invite) : undefined;
  const roleShort = (role: string) =>
    role === "ADMIN" ? t("مسؤول", "Admin") : role === "MANAGER" ? t("مدير", "Manager") : role === "CUSTOM" ? t("مخصص", "Custom") : t("مستخدم", "User");
  const roleText = (role: string, stored: string[]) =>
    role === "CUSTOM" ? t(`مخصص — ${normalizePermissions(stored).length} صلاحية`, `Custom — ${normalizePermissions(stored).length} permissions`) : roleShort(role);
  const sections = [
    ...(isAdmin
      ? [
          { id: "company", label: t("المنشأة", "Company"), icon: Building2 },
          { id: "payroll", label: t("الرواتب والتنبيهات", "Payroll & alerts"), icon: BellRing },
        ]
      : []),
    { id: "profile", label: t("بياناتي", "My details"), icon: UserCog },
    ...(isAdmin
      ? [
          { id: "channels", label: t("إرسال الخطابات", "Letter delivery"), icon: Send },
          { id: "members", label: t("المستخدمون والصلاحيات", "Users & permissions"), icon: ShieldCheck },
        ]
      : []),
  ];
  const Chevron = lang === "en" ? ChevronRight : ChevronLeft;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={Settings}
        title={t("الإعدادات", "Settings")}
        description={t(
          "بيانات المنشأة الحالية وأعضاؤها وبياناتك الشخصية. بيانات كل منشأة معزولة؛ لا يراها إلا أعضاؤها.",
          "The current company, its members, and your own details. Each company's data is isolated and visible to its members only.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="grid items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="no-print -mx-4 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:px-0" aria-label={t("أقسام الإعدادات", "Settings sections")}>
          <ul className="flex gap-1.5 lg:flex-col lg:gap-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <li key={section.id} className="shrink-0">
                  <a
                    href={`#${section.id}`}
                    className="flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-card transition hover:text-teal-700 lg:border-transparent lg:bg-transparent lg:shadow-none lg:hover:bg-white lg:hover:shadow-card"
                  >
                    <Icon size={16} className="text-slate-400" />
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {isAdmin ? (
            <Link
              href="/settings/hr"
              className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 to-teal-900 p-5 text-white shadow-raised transition hover:-translate-y-0.5"
            >
              <span className="higher-horizon pointer-events-none absolute -bottom-6 end-10 h-32 w-56 bg-[length:100%] opacity-[0.08]" aria-hidden="true" />
              <span className="relative flex min-w-0 items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300 ring-1 ring-inset ring-white/15">
                  <Sparkles size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{t("إعدادات الموارد البشرية", "HR settings")}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-white/70">
                    {t(
                      "المسميات الوظيفية، الأقسام، أنواع الإجازات وأيامها، والعلاوات — بالعربية والإنجليزية مع الترجمة بالذكاء الاصطناعي.",
                      "Job titles, departments, leave types and days, and allowances — in Arabic and English with AI translation.",
                    )}
                  </span>
                </span>
              </span>
              <Chevron size={20} className="relative shrink-0 text-white/60 transition group-hover:text-white" />
            </Link>
          ) : null}

          {isAdmin ? (
            <form action={updateCompanySettings} className="space-y-5">
              <Card id="company" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
                <SectionHead icon={Building2} title={t("المنشأة", "Company")} />
                <p className="flex items-start gap-2 rounded-xl bg-aqua-50 px-3.5 py-3 text-xs leading-5 text-slate-700 ring-1 ring-inset ring-aqua-100 md:col-span-2">
                  <Info size={15} className="mt-0.5 shrink-0 text-aqua-700" />
                  <span>
                    {t("لتغيير اسم أو شعار شركة أو شخص معيّن تُصرف باسمه الرواتب، افتح", "To change the name or logo of a specific company or person paying salaries, open")}{" "}
                    <Link href="/employers" className="font-bold text-teal-800 underline underline-offset-2">
                      {t("دفتر العناوين", "Address book")}
                    </Link>
                    .
                  </span>
                </p>
                <Field label={t("الاسم بالعربية", "Name (Arabic)")}>
                  <input className={`${fieldClass} w-full`} name="name" defaultValue={company.name} required />
                </Field>
                <Field label={t("الاسم بالإنجليزية", "Name (English)")}>
                  <input className={`${fieldClass} w-full`} name="nameEn" dir="ltr" defaultValue={company.nameEn || ""} />
                </Field>
                <Field label={t("السجل التجاري", "CR number")}>
                  <input className={`${fieldClass} w-full`} name="crNumber" defaultValue={company.crNumber || ""} />
                </Field>
                <PhoneField label={t("الهاتف", "Phone")} name="phone" defaultValue={company.phone} />
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
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                    <img src={company.logoUrl} alt="" className="size-16 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="removeLogo" value="1" />
                      {t("حذف الشعار", "Remove logo")}
                    </label>
                  </div>
                ) : null}
              </Card>
              <Card id="payroll" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
                <SectionHead icon={BellRing} title={t("الرواتب والتنبيهات", "Payroll & alerts")} />
                <Field label={t("أيام حساب الراتب", "Salary days")} hint={t("عادة 30. قيمة اليوم = إجمالي الراتب ÷ هذا الرقم.", "Usually 30. Daily rate = gross ÷ this number.")}>
                  <input className={`${fieldClass} w-full`} type="number" min="1" max="31" name="salaryDays" defaultValue={company.salaryDays} />
                </Field>
                <Field
                  label={t("يوم استحقاق الرواتب", "Salary pay day")}
                  hint={t("يظهر في التقويم كل شهر. اختر 0 لآخر يوم في الشهر.", "Shown on the calendar every month. Use 0 for the last day of the month.")}
                >
                  <input className={`${fieldClass} w-full`} type="number" min="0" max="31" name="payDay" defaultValue={company.payDay} />
                </Field>
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100 sm:grid-cols-3 md:col-span-2">
                  <Field label={t("تنبيه عاجل خلال (يوم)", "Urgent alert within (days)")}>
                    <input className={`${fieldClass} w-full`} type="number" min="1" name="alertUrgentDays" defaultValue={company.alertUrgentDays} />
                  </Field>
                  <Field label={t("تنبيه تحذير خلال (يوم)", "Warning within (days)")}>
                    <input className={`${fieldClass} w-full`} type="number" min="1" name="alertWarningDays" defaultValue={company.alertWarningDays} />
                  </Field>
                  <Field label={t("تنبيه مبكر خلال (يوم)", "Early notice within (days)")}>
                    <input className={`${fieldClass} w-full`} type="number" min="1" name="alertEarlyDays" defaultValue={company.alertEarlyDays} />
                  </Field>
                </div>
                <Field
                  label={t("تنبيه نفاد الإجازة عند بقاء (يوم)", "Leave alert when days left ≤")}
                  hint={t("يظهر تنبيه أحمر عندما يقترب رصيد الموظف من النفاد أو يتجاوزه.", "A red alert appears when an employee's balance is nearly or fully used.")}
                >
                  <input className={`${fieldClass} w-full`} type="number" min="0" max="60" name="leaveWarningDays" defaultValue={company.leaveWarningDays} />
                </Field>
                <div className="flex items-end justify-end md:col-span-2">
                  <SubmitButton className="w-full sm:w-auto">
                    <Save size={16} />
                    {t("حفظ إعدادات المنشأة", "Save company settings")}
                  </SubmitButton>
                </div>
              </Card>
            </form>
          ) : (
            <Card className="flex items-start gap-3 text-sm text-slate-700">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Building2 size={19} />
              </span>
              <p className="leading-6">
                {t("المنشأة:", "Company:")} <span className="font-bold">{company.name}</span> — {t("صلاحيتك:", "your role:")}{" "}
                <span className="font-bold">{roleShort(user.role)}</span>. {t("إعدادات المنشأة وأعضاؤها يديرها المسؤول.", "Company settings and members are managed by an admin.")}
              </p>
            </Card>
          )}

          <form action={updateProfile}>
            <Card id="profile" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
              <SectionHead icon={UserCog} title={t("بياناتي", "My details")} />
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
              <div className="flex justify-end md:col-span-2">
                <SubmitButton className="w-full sm:w-auto">
                  <Save size={16} />
                  {t("حفظ بياناتي", "Save my details")}
                </SubmitButton>
              </div>
            </Card>
          </form>

          {isAdmin ? (
            <Card id="channels" className="scroll-mt-24">
              <SectionHead
                icon={Send}
                title={t("إرسال الخطابات للموظفين", "Sending letters to employees")}
                text={t(
                  "عند إصدار خطاب أو إنذار تُجهَّز نسخة لكل موظف عبر البريد وواتساب. القناة غير المفعّلة تحفظ النسخ في الانتظار، وتُرسل تلقائياً بعد تفعيلها. إلى ذلك الحين يمكن مشاركة الخطاب يدوياً من صفحته.",
                  "Each letter or warning queues a copy for the employee by email and WhatsApp. An inactive channel keeps copies waiting and sends them once activated. Until then, share the letter manually from its page.",
                )}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {channelRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-bold text-slate-900">
                        <row.icon size={17} className="text-slate-400" />
                        {row.label}
                      </p>
                      <ToneBadge tone={row.ready ? "green" : "amber"}>{row.ready ? t("مفعّل", "Active") : t("غير مفعّل", "Not active")}</ToneBadge>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      {[
                        [t("بالانتظار", "Waiting"), row.pending, "text-amber-700"],
                        [t("أُرسلت", "Sent"), row.sent, "text-emerald-700"],
                        [t("تعذّرت", "Failed"), row.failed, "text-red-700"],
                      ].map(([label, value, tone]) => (
                        <div key={String(label)} className="rounded-xl bg-slate-50 px-2 py-2">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className={`tabular mt-0.5 text-base font-bold ${tone}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {row.ready ? null : (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {t("للتفعيل أضف في إعدادات الخادم:", "To activate, set on the server:")}{" "}
                        <span className="break-all font-mono text-[11px] text-slate-700" dir="ltr">
                          {row.env}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  {pendingTotal
                    ? t(`${pendingTotal} نسخة بانتظار الإرسال.`, `${pendingTotal} copies waiting to be sent.`)
                    : t("لا توجد نسخ بانتظار الإرسال.", "No copies are waiting.")}
                </p>
                {pendingTotal && channelRows.some((row) => row.ready) ? (
                  <form action={sendPendingLetterCopies}>
                    <SubmitButton variant="secondary" className="w-full sm:w-auto" pendingLabel={t("جارٍ الإرسال...", "Sending...")}>
                      <Send size={16} />
                      {t("إرسال النسخ المنتظرة الآن", "Send waiting copies now")}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card id="members" className="scroll-mt-24">
              <SectionHead
                icon={ShieldCheck}
                title={t("المستخدمون والصلاحيات", "Users & permissions")}
                text={t(
                  "ادعُ مستخدماً ببريد حسابه في BHD وحدد ما يراه وما يستطيع فعله. يصله رابط دعوة؛ عند فتحه والدخول بنفس البريد تُفتح له بيانات هذه المنشأة بحسب صلاحياته فقط.",
                  "Invite a user by their BHD account email and choose what they can see and do. They get an invitation link; after opening it and signing in with that email, this company opens for them with exactly those permissions.",
                )}
              >
                <Modal
                  label={
                    <>
                      <UserPlus size={16} />
                      {t("دعوة مستخدم", "Invite user")}
                    </>
                  }
                  title={t("دعوة مستخدم جديد", "Invite a new user")}
                  triggerClassName={primaryBtn}
                >
                  <form action={inviteMember} className="space-y-4">
                    <Field label={t("بريد حساب BHD للمستخدم", "User's BHD account email")} hint={t("يجب أن يدخل المستخدم بهذا البريد نفسه لقبول الدعوة.", "The user must sign in with this same email to accept.")}>
                      <input className={`${fieldClass} w-full`} type="email" name="email" dir="ltr" required placeholder="name@example.com" />
                    </Field>
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">{t("الصلاحيات", "Permissions")}</p>
                      <AccessEditor defaultRole="VIEWER" />
                    </div>
                    <SubmitButton className="w-full" pendingLabel={t("جارٍ إنشاء الدعوة...", "Creating invitation...")}>
                      {t("إنشاء الدعوة", "Create invitation")}
                    </SubmitButton>
                  </form>
                </Modal>
              </SectionHead>

              {justInvited?.inviteToken ? (
                <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
                  <p className="mb-2 text-sm font-semibold text-teal-900">
                    {t("رابط دعوة", "Invitation link for")} <span dir="ltr">{justInvited.email}</span>
                  </p>
                  <InviteLink url={`${origin}/invite/${justInvited.inviteToken}`} email={justInvited.email} company={company.name} />
                </div>
              ) : null}

              <ul className="mt-2 divide-y divide-slate-100">
                {members.map((member) => {
                  const self = member.id === user.membershipId;
                  const stored = Array.isArray(member.permissions) ? (member.permissions as string[]) : [];
                  const pending = !member.userId;
                  const linkUrl = member.inviteToken ? `${origin}/invite/${member.inviteToken}` : null;
                  const display = member.user?.name || member.email;
                  return (
                    <li key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${pending ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70" : "bg-teal-700 text-white"}`}
                        >
                          {display.trim().slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {display}
                            {self ? <span className="ms-2 text-xs font-normal text-slate-500">{t("(أنت)", "(you)")}</span> : null}
                          </p>
                          <p className="truncate text-sm text-slate-500" dir="ltr">
                            {member.email}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <ToneBadge tone="slate">{roleText(member.role, stored)}</ToneBadge>
                            {pending ? (
                              <ToneBadge tone="amber">
                                {t("دعوة معلّقة", "Invitation pending")}
                                {member.invitedAt ? ` — ${formatDate(member.invitedAt)}` : ""}
                              </ToneBadge>
                            ) : member.user?.bhdSub ? (
                              <ToneBadge tone="teal">{t("مرتبط بحساب BHD", "BHD account linked")}</ToneBadge>
                            ) : (
                              <ToneBadge tone="slate">{t("دخول محلي فقط", "Local sign-in only")}</ToneBadge>
                            )}
                          </div>
                        </div>
                      </div>
                      {self ? null : (
                        <div className="flex flex-wrap items-center gap-2 ps-[3.25rem] sm:ps-0">
                          <Modal label={t("الصلاحيات", "Permissions")} title={t(`صلاحيات ${display}`, `Permissions — ${display}`)} triggerClassName={secondaryBtn}>
                            <form action={updateMemberAccess} className="space-y-4">
                              <input type="hidden" name="membershipId" value={member.id} />
                              <AccessEditor defaultRole={member.role} defaultPermissions={stored} />
                              <SubmitButton className="w-full">{t("حفظ الصلاحيات", "Save permissions")}</SubmitButton>
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
      </div>
    </div>
  );
}
