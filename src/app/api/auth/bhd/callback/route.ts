import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
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
import { ensureWorkspace, linkInvitations } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(origin: string, code: string) {
  const message = `تعذّر الدخول بحساب BHD (${code}) / BHD sign-in failed (${code})`;
  const response = NextResponse.redirect(new URL(`/login?local=1&error=${encodeURIComponent(message)}`, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

/**
 * BHD-PRODUCT-SSO-ADMIN §3.3: bhd_sub → verified email (keep memberships/roles) → new account.
 * Then attach any invitations for that email, and give an account with no access its own company.
 */
async function upsertUser(profile: IdentityProfile) {
  const email = profile.email.toLowerCase();
  const bySub = await prisma.user.findUnique({ where: { bhdSub: profile.sub } });
  let user;
  if (bySub) {
    user = await prisma.user.update({
      where: { id: bySub.id },
      data: { name: profile.name, picture: profile.picture, lastLoginAt: new Date() },
    });
  } else {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.bhdSub) throw new Error("email_linked");
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { bhdSub: profile.sub, picture: profile.picture, lastLoginAt: new Date() },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email,
          password: "",
          mustChangePassword: false,
          bhdSub: profile.sub,
          picture: profile.picture,
          lastLoginAt: new Date(),
        },
      });
    }
  }
  await linkInvitations(user);
  await ensureWorkspace(user);
  return user;
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
  response.cookies.delete(COMPANY_COOKIE);
  response.cookies.set(SESSION_COOKIE, signSession(userId), sessionCookieOptions());
  return response;
}
