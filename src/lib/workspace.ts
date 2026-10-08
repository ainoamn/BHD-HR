import { writeAudit } from "./audit";
import { prisma } from "./prisma";

/** Invitations are stored by email; they attach to the account the first time that (verified) email signs in. */
export async function linkInvitations(user: { id: string; email: string }) {
  const pending = await prisma.membership.findMany({
    where: { email: user.email.toLowerCase(), userId: null },
    select: { id: true, companyId: true, role: true },
  });
  for (const invite of pending) {
    await prisma.membership.update({ where: { id: invite.id }, data: { userId: user.id } });
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
 * of that company only — never a seat in someone else's data.
 */
export async function ensureWorkspace(user: { id: string; email: string; name: string }) {
  const count = await prisma.membership.count({ where: { userId: user.id } });
  if (count > 0) return null;
  const company = await prisma.company.create({ data: { name: user.name || user.email } });
  await prisma.membership.create({
    data: { companyId: company.id, userId: user.id, email: user.email.toLowerCase(), role: "ADMIN" },
  });
  await writeAudit({
    companyId: company.id,
    userId: user.id,
    action: "WORKSPACE_CREATE",
    message: `أُنشئت مساحة عمل جديدة لـ ${user.email} / New workspace created for ${user.email}`,
  });
  return company;
}
