import { isPlaceholderEmail } from "./accounts";
import { writeAudit } from "./audit";
import type { IdentityProfile } from "./bhd/identity";
import { type LoginMeta, recordLogin } from "./login-events";
import { startTrial } from "./platform";
import { prisma } from "./prisma";

/** A system-opened account that now signs in through BHD: its own username and password stop working. */
export const BHD_ONLY = { password: "", tempPassword: null, mustChangePassword: false } as const;

/**
 * Accounts HR opened (username + temporary password) for an employee or sponsor whose record carries this email,
 * not yet tied to a BHD account. Only open accounts count: closing one deletes its membership, so it is never revived.
 */
export async function localAccountsFor(email: string, exceptUserId?: string) {
  const rows = await prisma.membership.findMany({
    where: {
      user: { username: { not: null }, bhdSub: null, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      OR: [{ employee: { email: { equals: email, mode: "insensitive" } } }, { employer: { email: { equals: email, mode: "insensitive" } } }],
    },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  return [...new Set(rows.map((row) => row.userId!))];
}

export async function auditAccountLink(userId: string, email: string, where: { userId: string } | { id: string }) {
  const members = await prisma.membership.findMany({ where, select: { companyId: true, employeeId: true } });
  for (const member of members) {
    await writeAudit({
      companyId: member.companyId,
      userId,
      employeeId: member.employeeId,
      action: "ACCOUNT_LINK",
      message: `رُبط حساب الدخول بحساب BHD ${email} / Sign-in account linked to BHD account ${email}`,
    });
  }
}

/**
 * After a BHD sign-in: the person's other system-opened accounts (one per company that recorded the same email)
 * move onto this account, so every company shows up in one switcher. Placeholder membership emails become the real one.
 */
export async function mergeLocalAccounts(user: { id: string; email: string; name: string }) {
  const email = user.email.toLowerCase();
  for (const otherId of await localAccountsFor(email, user.id)) {
    const moving = await prisma.membership.findMany({ where: { userId: otherId }, select: { id: true, companyId: true, employeeId: true } });
    for (const member of moving) {
      if (await prisma.membership.findFirst({ where: { userId: user.id, companyId: member.companyId }, select: { id: true } })) continue;
      await prisma.membership.update({ where: { id: member.id }, data: { userId: user.id } });
      await auditAccountLink(user.id, email, { id: member.id });
    }
    if (!(await prisma.membership.count({ where: { userId: otherId } }))) await prisma.user.update({ where: { id: otherId }, data: BHD_ONLY });
  }
  const placeholders = await prisma.membership.findMany({ where: { userId: user.id, email: { not: email } }, select: { id: true, companyId: true, email: true } });
  for (const member of placeholders) {
    if (!isPlaceholderEmail(member.email)) continue;
    if (await prisma.membership.findUnique({ where: { companyId_email: { companyId: member.companyId, email } }, select: { id: true } })) continue;
    await prisma.membership.update({ where: { id: member.id }, data: { email } });
  }
}

/**
 * BHD-PRODUCT-SSO-ADMIN §3.3: bhd_sub → verified email (keep memberships/roles) → an open account HR made for
 * an employee or sponsor recorded with that email → new account. A system-opened account linked here signs in
 * through BHD from then on. Then the person's other such accounts merge in, invitations for the email attach,
 * and an account with no access anywhere gets its own company.
 */
export async function signInBhdUser(profile: IdentityProfile, meta: LoginMeta = {}) {
  const email = profile.email.toLowerCase();
  const bySub = await prisma.user.findUnique({ where: { bhdSub: profile.sub } });
  if (bySub?.disabledAt) throw new Error("account_disabled");
  let user;
  if (bySub) {
    user = await prisma.user.update({
      where: { id: bySub.id },
      data: { name: profile.name, picture: profile.picture, lastLoginAt: new Date() },
    });
  } else {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    const [local] = byEmail ? [] : await localAccountsFor(email);
    if (byEmail) {
      if (byEmail.bhdSub) throw new Error("email_linked");
      if (byEmail.disabledAt) throw new Error("account_disabled");
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { bhdSub: profile.sub, picture: profile.picture, lastLoginAt: new Date(), ...(byEmail.username ? BHD_ONLY : {}) },
      });
      if (byEmail.username) await auditAccountLink(user.id, email, { userId: user.id });
    } else if (local) {
      user = await prisma.user.update({
        where: { id: local },
        data: { bhdSub: profile.sub, email, picture: profile.picture, lastLoginAt: new Date(), ...BHD_ONLY },
      });
      await auditAccountLink(user.id, email, { userId: user.id });
    } else {
      user = await prisma.user.create({
        data: { name: profile.name, email, password: "", mustChangePassword: false, bhdSub: profile.sub, picture: profile.picture, lastLoginAt: new Date() },
      });
    }
  }
  await mergeLocalAccounts(user);
  await linkInvitations(user);
  await ensureWorkspace(user, meta.ip);
  await recordLogin(user.id, "BHD", meta);
  return user;
}

/** Invitations are stored by email; they attach to the account the first time that (verified) email signs in. */
export async function linkInvitations(user: { id: string; email: string }) {
  const pending = await prisma.membership.findMany({
    where: { email: user.email.toLowerCase(), userId: null },
    select: { id: true, companyId: true, role: true },
  });
  for (const invite of pending) {
    await prisma.membership.update({ where: { id: invite.id }, data: { userId: user.id, acceptedAt: new Date() } });
    await writeAudit({
      companyId: invite.companyId,
      userId: user.id,
      action: "MEMBER_JOIN",
      message: `انضم ${user.email} بدعوة (${invite.role}) / ${user.email} joined by invitation (${invite.role})`,
    });
  }
  return pending.length;
}

/**
 * BHD-UNIFIED-LOGIN-AND-APPS §0.7: an account with no access anywhere gets its own company as ADMIN
 * of that company only — never a seat in someone else's data. The company starts on the free trial.
 */
export async function ensureWorkspace(user: { id: string; email: string; name: string }, ip?: string | null) {
  const count = await prisma.membership.count({ where: { userId: user.id } });
  if (count > 0) return null;
  const company = await prisma.company.create({ data: { name: user.name || user.email, signupIp: ip && ip !== "local" ? ip.slice(0, 64) : null } });
  await prisma.membership.create({
    data: { companyId: company.id, userId: user.id, email: user.email.toLowerCase(), role: "ADMIN", acceptedAt: new Date() },
  });
  await startTrial(company.id);
  await writeAudit({
    companyId: company.id,
    userId: user.id,
    action: "WORKSPACE_CREATE",
    message: `أُنشئت مساحة عمل جديدة لـ ${user.email} / New workspace created for ${user.email}`,
  });
  return company;
}
