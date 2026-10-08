import { redirect } from "next/navigation";
import { Flash } from "@/components/flash";
import { LangToggle } from "@/components/lang-provider";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { ACTION_LABEL, MODULES, MODULE_ACTIONS, MODULE_LABEL, permissionsFor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { logout } from "@/server/auth-actions";
import { acceptInvite } from "@/server/invite-actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const { lang, t } = await getI18n();
  const invite = await prisma.membership.findUnique({ where: { inviteToken: token }, include: { company: true } });
  const inviter = invite?.invitedById ? await prisma.user.findUnique({ where: { id: invite.invitedById }, select: { name: true, email: true } }) : null;
  const email = user.email.toLowerCase();
  const takenByOther = Boolean(invite?.userId && invite.userId !== user.id);
  const wrongEmail = Boolean(invite && !invite.userId && invite.email !== email);
  const roleName: Record<string, string> = {
    ADMIN: t("مسؤول — كل الصلاحيات", "Admin — full access"),
    MANAGER: t("مدير — كل العمليات عدا الإعدادات", "Manager — all operations except settings"),
    VIEWER: t("مستخدم — عرض وطباعة وتصدير", "User — view, print and export"),
    CUSTOM: t("صلاحيات مخصصة", "Custom permissions"),
  };
  const granted = invite ? permissionsFor(invite.role, invite.permissions) : [];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex justify-end">
          <LangToggle />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <span className="official-logo official-logo-mark official-logo-ink w-14" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-900">{t("دعوة للانضمام", "Invitation to join")}</h1>
        </div>
        <Flash error={sp.error} />
        {!invite || takenByOther ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(
              "الرابط غير صالح: أُلغيت الدعوة أو جُدّد رابطها أو استُخدمت بحساب آخر. اطلب من مسؤول المنشأة رابطاً جديداً.",
              "This link is not valid: the invitation was cancelled, renewed or used by another account. Ask the company admin for a new link.",
            )}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl bg-slate-50 p-4 leading-7">
              <p>
                {t("المنشأة", "Company")}: <strong>{lang === "en" && invite.company.nameEn ? invite.company.nameEn : invite.company.name}</strong>
              </p>
              <p>
                {t("البريد المدعو", "Invited email")}: <strong dir="ltr">{invite.email}</strong>
              </p>
              <p>
                {t("الصلاحية", "Access")}: <strong>{roleName[invite.role] || invite.role}</strong>
              </p>
              {inviter ? (
                <p>
                  {t("الدعوة من", "Invited by")}: {inviter.name} <span dir="ltr">({inviter.email})</span>
                  {invite.invitedAt ? ` — ${formatDate(invite.invitedAt)}` : ""}
                </p>
              ) : null}
            </div>
            <details className="rounded-2xl border border-slate-200 p-4">
              <summary className="cursor-pointer font-semibold">{t("تفاصيل الصلاحيات", "Permission details")}</summary>
              <ul className="mt-3 space-y-1.5">
                {MODULES.map((module) => {
                  const actions = MODULE_ACTIONS[module].filter((action) => granted.includes(`${module}.${action}`));
                  return (
                    <li key={module} className="flex justify-between gap-3">
                      <span>{pick(MODULE_LABEL[module], lang)}</span>
                      <span className={actions.length ? "text-teal-800" : "text-slate-400"}>
                        {actions.length ? actions.map((action) => pick(ACTION_LABEL[action], lang)).join("، ") : t("لا يظهر", "Hidden")}
                      </span>
                    </li>
                  );
                })}
                {invite.role === "ADMIN" ? <li className="text-teal-800">{t("+ إعدادات المنشأة وإدارة الأعضاء", "+ Company settings and members")}</li> : null}
              </ul>
            </details>
            {wrongEmail ? (
              <div className="space-y-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
                <p>
                  {t("أنت داخل بالبريد", "You are signed in as")} <strong dir="ltr">{email}</strong>{" "}
                  {t("والدعوة مرسلة إلى", "but the invitation is for")} <strong dir="ltr">{invite.email}</strong>.{" "}
                  {t("اخرج ثم ادخل بحساب BHD المسجّل بالبريد المدعو.", "Sign out and sign in with the BHD account of the invited email.")}
                </p>
                <form action={logout}>
                  <SubmitButton variant="secondary">{t("تسجيل الخروج", "Sign out")}</SubmitButton>
                </form>
              </div>
            ) : (
              <form action={acceptInvite}>
                <input type="hidden" name="token" value={token} />
                <SubmitButton pendingLabel={t("جارٍ الفتح...", "Opening...")}>
                  {invite.userId ? t("فتح بيانات المنشأة", "Open the company") : t("قبول الدعوة وفتح البيانات", "Accept and open")}
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
