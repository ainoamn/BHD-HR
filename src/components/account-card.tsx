import { KeyRound, UserCheck } from "lucide-react";
import { AccountCredentials } from "@/components/account-credentials";
import { SubmitButton } from "@/components/submit-button";
import { Card, SectionTitle, ToneBadge, fieldClass } from "@/components/ui";
import { accountWhatsAppReady, credentialsMessage, isPlaceholderEmail, loginUrl, openSecret } from "@/lib/accounts";
import { type SessionUser, can, isStaffRole } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { ACCOUNT_ROLE_LABEL } from "@/lib/team";
import { formatDateTime } from "@/lib/utils";
import { closeAccount, openPersonAccount, resendAccountDetails, resetAccountPassword, setAccountRole } from "@/server/account-actions";

/**
 * The sign-in account of an employee or sponsor: open it, share the username and temporary password,
 * change the role (team manager, or a main-system role by an admin), reset the password, or close it.
 */
export async function AccountCard({
  user,
  kind,
  personId,
  person,
  hasReports = false,
}: {
  user: SessionUser;
  kind: "employee" | "employer";
  personId: string;
  person: { name: string; email: string | null; phone: string | null; active: boolean };
  hasReports?: boolean;
}) {
  const { lang, t } = await getI18n();
  const canEdit = can(user, kind === "employee" ? "employees.edit" : "employers.edit");
  const isAdmin = user.role === "ADMIN";
  if (!canEdit && !isAdmin) return null;
  const member = await prisma.membership.findFirst({
    where: { companyId: user.companyId, ...(kind === "employee" ? { employeeId: personId } : { employerId: personId }) },
    include: { user: { include: { _count: { select: { memberships: true } } } } },
  });
  const companyName = lang === "en" && user.company.nameEn ? user.company.nameEn : user.company.name;

  if (!member) {
    return (
      <Card id="account" className="scroll-mt-24">
        <SectionTitle>{t("حساب الدخول", "Sign-in account")}</SectionTitle>
        <p className="mb-3 text-xs leading-5 text-slate-600">
          {kind === "employee"
            ? t("حساب باسم مستخدم وكلمة مرور يفتح به الموظف صفحته، ويفتح للمدير صفحة فريقه.", "A username and password account: the employee's own page, and the team page for a manager.")
            : t("حساب يرى به صاحب العمل عمّاله المكفولين بحسب صلاحيات دور «صاحب عمل».", "An account where the sponsor sees their sponsored workers, per the Employer role's permissions.")}
        </p>
        {person.active ? (
          <form action={openPersonAccount} className="space-y-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={personId} />
            {kind === "employee" ? (
              <select className={`${fieldClass} w-full`} name="role" defaultValue={hasReports ? "TEAM_MANAGER" : "EMPLOYEE"} aria-label={t("نوع الحساب", "Account type")}>
                <option value="EMPLOYEE">{t("موظف — صفحته الشخصية", "Employee — own page")}</option>
                <option value="TEAM_MANAGER">{t("مدير فريق — صفحته وفريقه", "Team manager — own page and team")}</option>
              </select>
            ) : null}
            <SubmitButton className="w-full" pendingLabel={t("جارٍ الفتح...", "Opening...")}>
              <UserCheck size={16} />
              {t("فتح حساب دخول", "Open sign-in account")}
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-slate-500">{t("انتهت خدمة هذا الموظف.", "This employee's service has ended.")}</p>
        )}
      </Card>
    );
  }

  const manageable = isAdmin || (canEdit && !isStaffRole(member.role));
  const generated = Boolean(member.user?.username) && (member.user?._count.memberships ?? 0) <= 1;
  const password = manageable && generated ? openSecret(member.user?.tempPassword) : null;
  const origin = await requestOrigin();
  const message =
    password && member.user?.username
      ? credentialsMessage({ name: person.name, company: companyName, username: member.user.username, password, url: loginUrl(origin) })
      : null;
  const channelsOn = (person.email && channelReady("EMAIL")) || (person.phone && accountWhatsAppReady());
  const roleOptions =
    kind === "employee"
      ? ["EMPLOYEE", "TEAM_MANAGER", ...(isAdmin ? ["VIEWER", "MANAGER", "ADMIN"] : [])]
      : ["EMPLOYER", ...(isAdmin ? ["VIEWER", "MANAGER", "ADMIN"] : [])];
  if (!roleOptions.includes(member.role)) roleOptions.push(member.role);
  const signInEmail = member.user && !isPlaceholderEmail(member.user.email) ? member.user.email : null;

  return (
    <Card id="account" className="scroll-mt-24">
      <SectionTitle action={<ToneBadge tone={isStaffRole(member.role) ? "gold" : "teal"}>{pick(ACCOUNT_ROLE_LABEL[member.role], lang, member.role)}</ToneBadge>}>
        {t("حساب الدخول", "Sign-in account")}
      </SectionTitle>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        {member.user?.lastLoginAt
          ? t(`آخر دخول ${formatDateTime(member.user.lastLoginAt)}`, `Last sign-in ${formatDateTime(member.user.lastLoginAt)}`)
          : t("لم يدخل بعد.", "Has not signed in yet.")}
      </p>
      {!manageable ? (
        <p className="text-sm text-slate-600">{t("هذا الحساب له صلاحيات في النظام؛ يديره المسؤول.", "This account has system access; an admin manages it.")}</p>
      ) : (
        <div className="space-y-4">
          {member.user?.username ? (
            <>
              <AccountCredentials
                username={member.user.username}
                password={password}
                message={message}
                subject={t(`حسابك في نظام الموارد البشرية — ${companyName}`, `Your HR account — ${companyName}`)}
                phone={person.phone}
                email={person.email}
              />
              {!password ? (
                <p className="text-xs leading-5 text-slate-500">
                  {generated
                    ? t("اختار صاحب الحساب كلمة مروره. إن نسيها أنشئ له كلمة مؤقتة جديدة.", "The person chose their own password. If they forget it, create a new temporary one.")
                    : t("هذا الحساب يستخدمه صاحبه في منشأة أخرى أيضاً.", "This account is also used at another company.")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-100">
              {t("يدخل بحسابه الحالي", "Signs in with their existing account")}
              {signInEmail ? (
                <>
                  {" "}
                  <span className="font-semibold" dir="ltr">
                    {signInEmail}
                  </span>
                </>
              ) : null}
            </p>
          )}

          <form action={setAccountRole} className="flex gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="membershipId" value={member.id} />
            <select className={`${fieldClass} min-w-0 flex-1`} name="role" defaultValue={member.role} aria-label={t("الدور", "Role")}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {pick(ACCOUNT_ROLE_LABEL[role], lang, role)}
                </option>
              ))}
            </select>
            <SubmitButton variant="secondary">{t("حفظ الدور", "Save role")}</SubmitButton>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap gap-2">
              {password && channelsOn ? (
                <form action={resendAccountDetails}>
                  <input type="hidden" name="membershipId" value={member.id} />
                  <SubmitButton variant="secondary">{t("إرسال تلقائي", "Send automatically")}</SubmitButton>
                </form>
              ) : null}
              {generated ? (
                <form action={resetAccountPassword}>
                  <input type="hidden" name="membershipId" value={member.id} />
                  <SubmitButton variant="secondary" confirm={t("ستتوقف كلمة المرور الحالية وتُنشأ كلمة مؤقتة جديدة. متابعة؟", "The current password stops working and a new temporary one is created. Continue?")}>
                    <KeyRound size={15} />
                    {t("كلمة مرور جديدة", "New password")}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            <form action={closeAccount}>
              <input type="hidden" name="membershipId" value={member.id} />
              <SubmitButton variant="link" confirm={t("إيقاف حساب الدخول؟ لن يستطيع الدخول إلى هذه المنشأة.", "Close this account? They will no longer be able to sign in to this company.")}>
                {t("إيقاف الحساب", "Close account")}
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
