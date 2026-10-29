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
import { requestMeta } from "@/lib/login-events";
import { signInOrigin } from "@/lib/request-origin";
import { signInBhdUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(origin: string, code: string) {
  const message = `تعذّر الدخول بحساب BHD (${code}) / BHD sign-in failed (${code})`;
  const response = NextResponse.redirect(new URL(`/login?local=1&error=${encodeURIComponent(message)}`, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const origin = signInOrigin(request);
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

  let user: { id: string; bhdSub: string | null };
  try {
    user = await signInBhdUser(profile, requestMeta(request));
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message.slice(0, 40) : "user");
  }

  const response = NextResponse.redirect(new URL(oauth.returnTo, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(COMPANY_COOKIE);
  response.cookies.set(SESSION_COOKIE, signSession(user), await sessionCookieOptions());
  return response;
}
