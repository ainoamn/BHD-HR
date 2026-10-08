import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  OAUTH_STATE_COOKIE,
  decodeOAuthState,
  exchangeCode,
  identityConfig,
  isSsoConfigured,
  verifyIdentity,
  type IdentityProfile,
} from "@/lib/bhd/identity";
import { prisma } from "@/lib/prisma";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(origin: string, code: string) {
  const message = `تعذّر الدخول بحساب BHD (${code}) / BHD sign-in failed (${code})`;
  const response = NextResponse.redirect(new URL(`/login?local=1&error=${encodeURIComponent(message)}`, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

/** Product-local admin list (docs/BHD-UNIFIED-LOGIN-AND-APPS.md §2: admin rights stay per product). */
function isBootstrapAdmin(email: string) {
  return (process.env.BHD_ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

async function upsertUser(profile: IdentityProfile) {
  const bySub = await prisma.user.findUnique({ where: { bhdSub: profile.sub } });
  if (bySub) {
    return prisma.user.update({
      where: { id: bySub.id },
      data: { name: profile.name, picture: profile.picture, lastLoginAt: new Date() },
    });
  }
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.bhdSub) throw new Error("email_linked");
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { bhdSub: profile.sub, picture: profile.picture, lastLoginAt: new Date() },
    });
    await writeAudit({ userId: linked.id, action: "USER_SSO_LINK", message: `ربط المستخدم ${linked.email} بحساب BHD` });
    return linked;
  }
  const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) throw new Error("no_company");
  const created = await prisma.user.create({
    data: {
      name: profile.name,
      email: profile.email,
      password: "",
      role: isBootstrapAdmin(profile.email) ? "ADMIN" : "PENDING",
      mustChangePassword: false,
      bhdSub: profile.sub,
      picture: profile.picture,
      lastLoginAt: new Date(),
      companyId: company.id,
    },
  });
  await writeAudit({
    userId: created.id,
    action: "USER_SSO_CREATE",
    message: created.role === "ADMIN" ? `مسؤول جديد من حساب BHD (BHD_ADMIN_EMAILS): ${created.email}` : `مستخدم جديد من حساب BHD بانتظار التفعيل: ${created.email}`,
  });
  return created;
}

export async function GET(request: Request) {
  const origin = originOf(request);
  if (!isSsoConfigured()) return failure(origin, "not_configured");
  const url = new URL(request.url);
  const jar = await cookies();
  const oauth = decodeOAuthState(jar.get(OAUTH_STATE_COOKIE)?.value);
  const identityError = url.searchParams.get("error");
  if (identityError) return failure(origin, identityError.slice(0, 40));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!oauth || !code || !state || state !== oauth.state) return failure(origin, "state");

  const config = identityConfig(origin);
  let profile: IdentityProfile;
  try {
    const tokens = await exchangeCode(config, code, oauth.verifier);
    profile = await verifyIdentity(config, tokens.idToken, tokens.accessToken, oauth.nonce);
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message.slice(0, 40) : "token");
  }

  let userId: string;
  try {
    userId = (await upsertUser(profile)).id;
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message.slice(0, 40) : "user");
  }

  const response = NextResponse.redirect(new URL(oauth.returnTo, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.set(SESSION_COOKIE, signSession(userId), sessionCookieOptions());
  return response;
}
