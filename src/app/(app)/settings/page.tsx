import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, BellRing, Building2, ChevronLeft, ChevronRight, Info, Landmark, Mail, MapPin, MessageCircle, PenLine, Save, Send, Settings, ShieldCheck, Sparkles, UserCog, UserPlus, UsersRound, Zap } from "lucide-react";
import { WorkSitePicker } from "@/components/work-site-picker";
import { updateClockSettings } from "@/server/request-actions";
import { SearchSelect } from "@/components/search-select";
import { bankOptions } from "@/lib/banks";
import { updateSocialProtection } from "@/server/compliance-actions";
import { AccessEditor, PermissionGrid } from "@/components/access-editor";
import { Flash } from "@/components/flash";
import { InviteLink } from "@/components/invite-link";
import { Modal } from "@/components/modal";
import { PhoneField } from "@/components/phone-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, ToneBadge, fieldClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { STAFF_ROLES, requireUser } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { backupStatus, visibleErrorScope } from "@/lib/errors";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { TEAM_PERMISSIONS, TEAM_PERMISSION_LABEL, normalizePermissions, readRoleMap, rolePreset, teamPreset } from "@/lib/permissions";
import { ACCOUNT_ROLE_LABEL } from "@/lib/team";
import { isPlaceholderEmail } from "@/lib/accounts";
import { openAccountsForAll, saveRolePermissions } from "@/server/account-actions";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/utils";
import { sendPendingLetterCopies } from "@/server/letter-actions";
import { inviteMember, removeMember, renewInviteLink, updateCompanySettings, updateLetterIssuing, updateMemberAccess, updateProfile, updateSignatureSettings } from "@/server/settings-actions";
import { AUTO_ISSUE_KINDS, LETTER_KIND, readAutoKinds } from "@/lib/letters";

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
    ? await prisma.membership.findMany({
        where: { companyId: user.companyId, role: { in: [...STAFF_ROLES] } },
        include: { user: true, employee: { select: { id: true, fullName: true } }, employer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const roleMap = readRoleMap(company.rolePermissions);
  const [roleCounts, employeesWithout, employersWithout] = isAdmin
    ? await Promise.all([
        prisma.membership.groupBy({ by: ["role"], where: { companyId: user.companyId }, _count: { _all: true } }),
        prisma.employee.count({ where: { companyId: user.companyId, status: { not: "TERMINATED" }, account: null } }),
        prisma.employer.count({ where: { companyId: user.companyId, account: null } }),
      ])
    : [[], 0, 0];
  const roleCount = (role: string) => roleCounts.find((row) => row.role === role)?._count._all || 0;
  const roleRows: { role: string; text: string; tunable: boolean; count: number; granted: string[] }[] = [
    {
      role: "EMPLOYEE",
      text: t("صفحته الشخصية فقط: طلب الإجازات، الرصيد، قسائم الرواتب، المستندات، الخطابات، المصروفات والحضور.", "Their own page only: leave requests, balances, payslips, documents, letters, expenses and clock-in."),
      tunable: false,
      count: roleCount("EMPLOYEE"),
      granted: [],
    },
    {
      role: "TEAM_MANAGER",
      text: t("صفحته الشخصية + صفحة فريقه: كل من يتبعه في الهيكل التنظيمي بكل مستوياته.", "Their own page + a team page: everyone under them in the org chart, at every level."),
      tunable: true,
      count: roleCount("TEAM_MANAGER"),
      granted: teamPreset("TEAM_MANAGER", roleMap),
    },
    {
      role: "EMPLOYER",
      text: t("العمّال المكفولون عليه فقط، من دفتر العناوين.", "Only the workers they sponsor, from the address book."),
      tunable: true,
      count: roleCount("EMPLOYER"),
      granted: teamPreset("EMPLOYER", roleMap),
    },
    {
      role: "VIEWER",
      text: t("داخل النظام الكامل بحسب الصلاحيات أدناه.", "Inside the full system, per the permissions below."),
      tunable: true,
      count: roleCount("VIEWER"),
      granted: rolePreset("VIEWER", roleMap),
    },
    {
      role: "MANAGER",
      text: t("داخل النظام الكامل بحسب الصلاحيات أدناه، دون الإعدادات والأعضاء.", "Inside the full system per the permissions below, without settings and members."),
      tunable: true,
      count: roleCount("MANAGER"),
      granted: rolePreset("MANAGER", roleMap),
    },
    {
      role: "ADMIN",
      text: t("كل شيء، مع الإعدادات والأعضاء والأدوار.", "Everything, including settings, members and roles."),
      tunable: false,
      count: roleCount("ADMIN"),
      granted: [],
    },
  ];
  const personAccounts = roleCount("EMPLOYEE") + roleCount("TEAM_MANAGER") + roleCount("EMPLOYER");
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
  const roleShort = (role: string) => pick(ACCOUNT_ROLE_LABEL[role], lang, role);
  const roleText = (role: string, stored: string[]) =>
    role === "CUSTOM" ? t(`مخصص — ${normalizePermissions(stored).length} صلاحية`, `Custom — ${normalizePermissions(stored).length} permissions`) : roleShort(role);
  const sections = [
    ...(isAdmin
      ? [
          { id: "company", label: t("المنشأة", "Company"), icon: Building2 },
          { id: "payroll", label: t("الرواتب والتنبيهات", "Payroll & alerts"), icon: BellRing },
          { id: "oman", label: t("الحماية الاجتماعية والبنك", "Social protection & bank"), icon: Landmark },
          { id: "clock", label: t("تسجيل الحضور", "Clock-in"), icon: MapPin },
        ]
      : []),
    { id: "profile", label: t("بياناتي", "My details"), icon: UserCog },
    ...(isAdmin
      ? [
          { id: "signature", label: t("التوقيع والختم", "Signature & stamp"), icon: PenLine },
          { id: "letter-issuing", label: t("إصدار الخطابات المطلوبة", "Requested letters"), icon: Zap },
          { id: "channels", label: t("إرسال الخطابات", "Letter delivery"), icon: Send },
          { id: "roles", label: t("الأدوار والحسابات", "Roles & accounts"), icon: UsersRound },
          { id: "members", label: t("المستخدمون والصلاحيات", "Users & permissions"), icon: ShieldCheck },
        ]
      : []),
  ];
  const Chevron = lang === "en" ? ChevronRight : ChevronLeft;
  const errorScope = isAdmin ? await visibleErrorScope(user.companyId) : null;
  const platformAdmin = Boolean(errorScope?.platform);
  const [openErrors, backupOverdue] = errorScope
    ? await Promise.all([prisma.errorEvent.count({ where: { ...errorScope.where, resolvedAt: null } }), platformAdmin ? backupStatus().then((status) => status.overdue) : false])
    : [0, false];
  const autoKinds = readAutoKinds(user.company.letterAutoKinds);

  return (
    <div className="page-wide">
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
                    className="flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-surface px-3 py-2 text-sm font-semibold text-slate-600 shadow-card transition hover:text-teal-700 lg:border-transparent lg:bg-transparent lg:shadow-none lg:hover:bg-surface lg:hover:shadow-card"
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
              className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-l from-ink-900 to-teal-900 p-5 text-white shadow-raised transition hover:-translate-y-0.5"
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
            <Link
              href="/settings/system"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-teal-200"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                  <Activity size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900">{t("صحة النظام", "System health")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {platformAdmin
                      ? t("سجل الأخطاء والنسخ الاحتياطية اليومية.", "Error log and daily backups.")
                      : t("سجل الأخطاء التي واجهها مستخدمو منشأتك.", "Errors your company's users ran into.")}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {openErrors ? <ToneBadge tone="red">{t(`${openErrors} خطأ مفتوح`, `${openErrors} open`)}</ToneBadge> : null}
                {backupOverdue ? <ToneBadge tone="red">{t("النسخ الاحتياطي متأخر", "Backup overdue")}</ToneBadge> : null}
                <Chevron size={18} className="text-slate-400 transition group-hover:text-teal-700" />
              </span>
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
          ) : null}

          {isAdmin ? (
            <form action={updateSocialProtection}>
              <Card id="oman" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
                <SectionHead
                  icon={Landmark}
                  title={t("الحماية الاجتماعية والبنك", "Social protection & bank")}
                  text={t(
                    "حصة الموظف العماني تُخصم تلقائياً سطراً في راتبه، وحصة صاحب العمل تظهر في تقرير الاشتراكات ولا تُخصم. غير العماني: حصة صاحب العمل فقط. الحفظ يعيد احتساب الرواتب غير المصروفة.",
                    "The Omani employee share is deducted automatically as a salary line; the employer share appears in the contributions report and is not deducted. Non-Omanis: employer share only. Saving recalculates unpaid salaries.",
                  )}
                />
                <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-100 md:col-span-2">
                  <input type="checkbox" name="spfEnabled" value="1" defaultChecked={company.spfEnabled} className="size-4 accent-teal-700" />
                  {t("احتساب اشتراكات صندوق الحماية الاجتماعية في الرواتب", "Calculate Social Protection Fund contributions in payroll")}
                </label>
                <Field label={t("حصة الموظف العماني (%)", "Omani employee share (%)")} hint={t("7.5% شيخوخة وعجز ووفاة + 0.5% أمان وظيفي", "7.5% old age, disability & death + 0.5% job security")}>
                  <input className={`${fieldClass} w-full`} type="number" min="0" max="100" step="0.001" name="spfEmployeeRate" defaultValue={company.spfEmployeeRate} />
                </Field>
                <Field label={t("حصة صاحب العمل عن العماني (%)", "Employer share for Omanis (%)")} hint={t("11 + 0.5 + 1 إصابات + 1 أمومة + 1 مرضية (من 19 يوليو 2026)", "11 + 0.5 + 1 injury + 1 maternity + 1 sick leave (from 19 Jul 2026)")}>
                  <input className={`${fieldClass} w-full`} type="number" min="0" max="100" step="0.001" name="spfEmployerRate" defaultValue={company.spfEmployerRate} />
                </Field>
                <Field label={t("حصة صاحب العمل عن غير العماني (%)", "Employer share for non-Omanis (%)")} hint={t("1% أمومة + 1% إجازات مرضية واستثنائية", "1% maternity + 1% sick & extraordinary leave")}>
                  <input className={`${fieldClass} w-full`} type="number" min="0" max="100" step="0.001" name="spfExpatEmployerRate" defaultValue={company.spfExpatEmployerRate} />
                </Field>
                <Field label={t("الحد الأعلى للأجر الخاضع", "Insured wage cap")} hint={t("0 = بلا حد", "0 = no cap")}>
                  <input className={`${fieldClass} w-full`} type="number" min="0" step="0.001" name="spfWageCap" defaultValue={company.spfWageCap} />
                </Field>
                <Field label={t("الأجر الخاضع للاشتراك", "Insured wage")}>
                  <select className={`${fieldClass} w-full`} name="spfBase" defaultValue={company.spfBase}>
                    <option value="GROSS">{t("الأساسي + البدلات الثابتة والعلاوات", "Basic + fixed and recurring allowances")}</option>
                    <option value="BASIC">{t("الأساسي فقط", "Basic only")}</option>
                  </select>
                </Field>
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 ring-1 ring-inset ring-amber-100 md:col-span-2">
                  <Info size={15} className="mt-0.5 shrink-0" />
                  <span>
                    {t(
                      "النسب الافتراضية منشورة من صندوق الحماية الاجتماعية (spf.gov.om) حتى يوليو 2026. تحقق منها قبل التفعيل، فالصندوق يعدّلها بقرارات. نظام الادخار لغير العمانيين (9% من الأساسي) يبدأ في موعد أقصاه 19 يوليو 2027 ولم يُضف بعد.",
                      "Default rates are those published by the Social Protection Fund (spf.gov.om) as of July 2026. Check them before turning this on; the fund changes them by decision. The savings scheme for non-Omanis (9% of basic) starts by 19 July 2027 at the latest and is not included yet.",
                    )}
                  </span>
                </p>
                <div className="border-t border-slate-100 pt-4 md:col-span-2">
                  <h3 className="text-sm font-bold text-slate-900">{t("حساب المنشأة لملف الرواتب (WPS)", "Company account for the salary file (WPS)")}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{t("يظهر في رأس ملف WPS. رقم السجل التجاري يؤخذ من بيانات المنشأة أو الكفيل.", "Shown in the WPS file header. The CR number comes from the company or sponsor details.")}</p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t("بنك المنشأة", "Company bank")}</span>
                  <SearchSelect name="bankBic" options={bankOptions(lang)} defaultValue={company.bankBic || ""} emptyLabel={t("غير محدد", "Not set")} ariaLabel={t("بنك المنشأة", "Company bank")} />
                </div>
                <Field label={t("رقم حساب المنشأة", "Company account number")}>
                  <input className={`${fieldClass} w-full`} name="bankAccount" dir="ltr" defaultValue={company.bankAccount || ""} />
                </Field>
                <div className="flex items-end justify-end md:col-span-2">
                  <SubmitButton className="w-full sm:w-auto">
                    <Save size={16} />
                    {t("حفظ وإعادة احتساب الرواتب غير المصروفة", "Save and recalculate unpaid salaries")}
                  </SubmitButton>
                </div>
              </Card>
            </form>
          ) : null}

          {isAdmin ? (
            <form action={updateClockSettings}>
              <Card id="clock" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
                <SectionHead
                  icon={MapPin}
                  title={t("تسجيل الحضور من البوابة", "Clock-in from the portal")}
                  text={t(
                    "يسجّل الموظف حضوره وانصرافه من رابط بوابته على هاتفه. إن حددت موقع العمل فلن يُقبل التسجيل إلا من داخل النطاق، ويُحفظ البُعد مع كل تسجيل.",
                    "Employees clock in and out from their portal link on their phone. If you set a work site, punches are only accepted inside the radius, and the distance is saved with each one.",
                  )}
                />
                <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-100 md:col-span-2">
                  <input type="checkbox" name="clockEnabled" value="1" defaultChecked={company.clockEnabled} className="size-4 accent-teal-700" />
                  {t("تفعيل تسجيل الحضور والانصراف في بوابة الموظف", "Turn on clock-in and clock-out in the employee portal")}
                </label>
                <WorkSitePicker lat={company.workLat} lng={company.workLng} />
                <Field label={t("نطاق القبول (متر)", "Allowed radius (m)")} hint={t("من 30 إلى 5000. اتركه 200 لمبنى عادي.", "30 to 5000. 200 suits a normal building.")}>
                  <input className={`${fieldClass} w-full`} type="number" min="30" max="5000" name="workRadius" defaultValue={company.workRadius} />
                </Field>
                <Field label={t("بداية الدوام", "Work starts at")} hint={t("بتوقيت مسقط. يُحسب التأخير بعده. اتركه فارغاً لعدم احتساب التأخير.", "Muscat time. Lateness counts after it. Leave empty to skip lateness.")}>
                  <input className={`${fieldClass} w-full`} type="time" name="workStart" defaultValue={company.workStart || ""} />
                </Field>
                <p className="flex items-start gap-2 rounded-xl bg-aqua-50 px-3.5 py-3 text-xs leading-5 text-slate-700 ring-1 ring-inset ring-aqua-100 md:col-span-2">
                  <Info size={15} className="mt-0.5 shrink-0 text-aqua-700" />
                  <span>
                    {t(
                      "اترك الإحداثيات فارغة لقبول التسجيل من أي مكان (للعمل عن بُعد). السجل اليومي يظهر في صفحة الحضور والغياب.",
                      "Leave the coordinates empty to accept punches from anywhere (remote work). The daily log appears on the Attendance page.",
                    )}{" "}
                    <Link href="/attendance#clock" className="font-bold text-teal-800 underline underline-offset-2">
                      {t("سجل الدوام", "Clock-in log")}
                    </Link>
                  </span>
                </p>
                <div className="flex items-end justify-end md:col-span-2">
                  <SubmitButton className="w-full sm:w-auto">
                    <Save size={16} />
                    {t("حفظ إعدادات الحضور", "Save clock-in settings")}
                  </SubmitButton>
                </div>
              </Card>
            </form>
          ) : null}

          {isAdmin ? null : (
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
            <form action={updateSignatureSettings}>
              <Card id="signature" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
                <SectionHead
                  icon={PenLine}
                  title={t("التوقيع الإلكتروني والختم", "E-signature and stamp")}
                  text={t(
                    "يُطبع على كل خطاب وشهادة تصدر من النظام مع رمز QR للتحقق. الصورتان تُنسخان على الخطاب لحظة توقيعه، فتغييرهما لاحقاً لا يغيّر الخطابات السابقة.",
                    "Printed on every letter and certificate the system issues, with a QR code for verification. Both images are copied onto the letter when it is signed, so changing them later doesn't alter earlier letters.",
                  )}
                />
                <Field label={t("اسم المفوّض بالتوقيع", "Authorised signatory")} hint={t("فارغ = اسم من يعتمد الخطاب", "Empty = whoever approves the letter")}>
                  <input className={`${fieldClass} w-full`} name="signatoryName" defaultValue={company.signatoryName || ""} maxLength={120} />
                </Field>
                <Field label={t("صفته", "Title")}>
                  <input className={`${fieldClass} w-full`} name="signatoryTitle" defaultValue={company.signatoryTitle || ""} placeholder={t("مدير الموارد البشرية", "HR manager")} maxLength={120} />
                </Field>
                {(
                  [
                    ["signature", t("صورة التوقيع", "Signature image"), company.signatureUrl, t("PNG بخلفية شفافة أفضل.", "A PNG with a transparent background works best.")],
                    ["stamp", t("صورة الختم", "Stamp image"), company.stampUrl, t("PNG أو JPG مربّع تقريباً.", "A roughly square PNG or JPG.")],
                  ] as const
                ).map(([input, label, current, hint]) => (
                  <div key={input} className="space-y-2">
                    <Field label={label} hint={hint}>
                      <input className={`${fieldClass} w-full`} type="file" name={input} accept="image/png,image/jpeg,image/webp" />
                    </Field>
                    {current ? (
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                        <img src={current} alt="" className="h-16 w-28 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" name={`remove${input}`} value="1" />
                          {t("حذف", "Remove")}
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="flex items-end justify-end md:col-span-2">
                  <SubmitButton className="w-full sm:w-auto">
                    <Save size={16} />
                    {t("حفظ التوقيع والختم", "Save signature and stamp")}
                  </SubmitButton>
                </div>
              </Card>
            </form>
          ) : null}

          {isAdmin ? (
            <form action={updateLetterIssuing}>
              <Card id="letter-issuing" className="grid scroll-mt-24 gap-4">
                <SectionHead
                  icon={Zap}
                  title={t("إصدار الخطابات المطلوبة من البوابة", "Letters requested in the portal")}
                  text={t(
                    "اختر الخطابات التي تصدر إلكترونياً فور طلب الموظف دون تدخل بشري، موقّعة باسم المفوّض بالتوقيع ومن بيانات ملفه. غير المختارة تنتظر موافقة يدوية في «طلبات الموظفين». إن نقصت بيانات في الملف يُحوَّل الطلب للموافقة اليدوية تلقائياً.",
                    "Choose the letters issued electronically the moment an employee asks, with no one involved, signed in the authorised signatory's name from the employee's file. The rest wait for manual approval in “Employee requests”. If the file lacks data, the request falls back to manual approval.",
                  )}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {AUTO_ISSUE_KINDS.map((kind) => (
                    <label
                      key={kind}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface p-3 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 has-[:checked]:bg-emerald-50/60 has-[:checked]:ring-emerald-300"
                    >
                      <input type="checkbox" name="autoKinds" value={kind} defaultChecked={autoKinds.includes(kind)} className="mt-1 size-4 accent-teal-700" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{pick(LETTER_KIND[kind].label, lang)}</span>
                        <span className="block text-xs text-slate-500">
                          {LETTER_KIND[kind].salary ? t("يُظهر الراتب", "Shows pay") : t("لا يُظهر الراتب", "No pay shown")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  {t(
                    "«خطاب آخر» بموضوع يكتبه الموظف، وقبول الاستقالة، والسلف، واستلام المستندات الأصلية تبقى دائماً بموافقة يدوية.",
                    "“Another letter” with the employee's own subject, resignations, advances and collecting originals always need manual approval.",
                  )}
                </p>
                <div className="flex justify-end">
                  <SubmitButton className="w-full sm:w-auto">
                    <Save size={16} />
                    {t("حفظ طريقة الإصدار", "Save issuing")}
                  </SubmitButton>
                </div>
              </Card>
            </form>
          ) : null}

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
                        <span className="break-all font-mono text-xs text-slate-700" dir="ltr">
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
            <Card id="roles" className="scroll-mt-24">
              <SectionHead
                icon={UsersRound}
                title={t("الأدوار وحسابات الموظفين", "Roles and staff accounts")}
                text={t(
                  "كل موظف أو صاحب عمل تضيفه يُفتح له حساب دخول تلقائياً باسم مستخدم وكلمة مرور مؤقتة. حدّد هنا ما يستطيعه كل دور في منشأتك؛ يسري التغيير فوراً على كل من يحمله. ولترقية موظف إلى مدير افتح ملفه ← «حساب الدخول».",
                  "Every employee or sponsor you add gets a sign-in account with a username and temporary password. Set what each role can do in your company; changes apply at once to everyone holding it. To promote an employee, open their file → Sign-in account.",
                )}
              />
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {roleRows.map((row) => {
                  const customized = Boolean(roleMap[row.role as keyof typeof roleMap]);
                  const label = roleShort(row.role);
                  const appRole = row.role === "MANAGER" || row.role === "VIEWER";
                  return (
                    <li key={row.role} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-slate-900">{label}</p>
                        <span className="flex flex-wrap gap-1.5">
                          {customized ? <ToneBadge tone="gold">{t("معدّل", "Customized")}</ToneBadge> : null}
                          <ToneBadge tone="slate">{t(`${row.count} حساب`, `${row.count} account(s)`)}</ToneBadge>
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-slate-500">{row.text}</p>
                      {row.tunable ? (
                        <>
                          <p className="text-xs text-slate-600">
                            {appRole
                              ? t(`${row.granted.length} صلاحية في النظام`, `${row.granted.length} system permission(s)`)
                              : row.granted.map((permission) => pick(TEAM_PERMISSION_LABEL[permission as keyof typeof TEAM_PERMISSION_LABEL], lang)).join(" · ") || t("عرض البيانات الأساسية فقط", "Basic details only")}
                          </p>
                          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                            <Modal label={t("تعديل الصلاحيات", "Edit permissions")} title={t(`صلاحيات دور «${label}»`, `“${label}” role permissions`)} triggerClassName={secondaryBtn}>
                              <form action={saveRolePermissions} className="space-y-4">
                                <input type="hidden" name="role" value={row.role} />
                                {appRole ? (
                                  <PermissionGrid defaultPermissions={row.granted} />
                                ) : (
                                  <fieldset className="space-y-2">
                                    <legend className="mb-1 text-sm text-slate-600">
                                      {t("يرى دائماً البيانات الأساسية لمن يتبعه. اختر ما يزيد على ذلك:", "Always sees the basic details of their people. Choose what else:")}
                                    </legend>
                                    {TEAM_PERMISSIONS.map((permission) => (
                                      <label key={permission} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800">
                                        <input type="checkbox" name="perm" value={permission} defaultChecked={row.granted.includes(permission)} className="size-4 accent-teal-700" />
                                        {pick(TEAM_PERMISSION_LABEL[permission], lang)}
                                      </label>
                                    ))}
                                  </fieldset>
                                )}
                                <SubmitButton className="w-full">{t("حفظ صلاحيات الدور", "Save role permissions")}</SubmitButton>
                              </form>
                              {customized ? (
                                <form action={saveRolePermissions} className="mt-3 text-center">
                                  <input type="hidden" name="role" value={row.role} />
                                  <input type="hidden" name="reset" value="1" />
                                  <SubmitButton variant="link" confirm={t("إرجاع صلاحيات هذا الدور إلى الافتراضي؟", "Put this role back to its default permissions?")}>
                                    {t("إرجاع الافتراضي", "Restore default")}
                                  </SubmitButton>
                                </form>
                              ) : null}
                            </Modal>
                          </div>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <form action={openAccountsForAll} className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="font-semibold text-slate-900">{t("فتح حسابات لمن ليس لديه حساب", "Open accounts for everyone without one")}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-slate-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="employees" value="1" defaultChecked={employeesWithout > 0} className="size-4 accent-teal-700" />
                      {t(`الموظفون (${employeesWithout})`, `Employees (${employeesWithout})`)}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="employers" value="1" className="size-4 accent-teal-700" />
                      {t(`أصحاب العمل (${employersWithout})`, `Sponsors (${employersWithout})`)}
                    </label>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    {t("من له موظفون يتبعونه يُفتح له حساب مدير فريق. تُرسل البيانات تلقائياً إن كانت قناة البريد أو واتساب مفعّلة.", "People with reports get a team manager account. Details are sent automatically when email or WhatsApp is on.")}
                  </p>
                </div>
                <SubmitButton variant="secondary" className="shrink-0" pendingLabel={t("جارٍ فتح الحسابات...", "Opening accounts...")}>
                  <UserPlus size={16} />
                  {t("فتح الحسابات", "Open accounts")}
                </SubmitButton>
              </form>
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
                      <AccessEditor defaultRole="VIEWER" presetPermissions={{ MANAGER: rolePreset("MANAGER", roleMap), VIEWER: rolePreset("VIEWER", roleMap) }} />
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
                            {member.user?.username && isPlaceholderEmail(member.email) ? member.user.username : member.email}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <ToneBadge tone="slate">{roleText(member.role, stored)}</ToneBadge>
                            {member.employee ? (
                              <Link href={`/employees/${member.employee.id}#account`}>
                                <ToneBadge tone="teal">{t(`موظف: ${member.employee.fullName}`, `Employee: ${member.employee.fullName}`)}</ToneBadge>
                              </Link>
                            ) : member.employer ? (
                              <Link href={`/employers/${member.employer.id}#account`}>
                                <ToneBadge tone="teal">{t(`صاحب عمل: ${member.employer.name}`, `Sponsor: ${member.employer.name}`)}</ToneBadge>
                              </Link>
                            ) : null}
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
                              <AccessEditor
                                defaultRole={member.role}
                                defaultPermissions={stored}
                                presetPermissions={{ MANAGER: rolePreset("MANAGER", roleMap), VIEWER: rolePreset("VIEWER", roleMap) }}
                              />
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
              {personAccounts ? (
                <p className="mt-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                  {t(
                    `و${personAccounts} حساب موظفين ومديري فرق وأصحاب عمل — يُدار كل منها من ملف صاحبه، ودور كل نوع من «الأدوار والحسابات».`,
                    `Plus ${personAccounts} employee, team manager and sponsor account(s) — each is managed from its person's file, and each type's role under Roles & accounts.`,
                  )}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
