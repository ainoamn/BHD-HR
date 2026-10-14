import { prisma } from "./prisma";

export type LoginMeta = { ip?: string | null; userAgent?: string | null };

/** IP as the hosting proxy reports it, from a route handler's request. */
export function requestMeta(request: Request): LoginMeta {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent"),
  };
}

/** Keeps the sign-in for the platform admin's view, and the latest IP on the account. */
export async function recordLogin(userId: string, method: "BHD" | "LOCAL", meta: LoginMeta = {}) {
  const ip = meta.ip && meta.ip !== "local" ? meta.ip.slice(0, 64) : null;
  await prisma.$transaction([
    prisma.loginEvent.create({ data: { userId, method, ip, userAgent: meta.userAgent?.slice(0, 300) || null } }),
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), ...(ip ? { lastLoginIp: ip } : {}) } }),
  ]);
}

export async function purgeOldLogins(days = 180) {
  return (await prisma.loginEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } })).count;
}
