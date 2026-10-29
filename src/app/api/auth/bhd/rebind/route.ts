import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, getSessionUser, sessionCookieOptions, signSession } from "@/lib/auth";
import { identityIssuer, isSsoConfigured, safeReturnPath, type IdentityProfile } from "@/lib/bhd/identity";
import { requestMeta } from "@/lib/login-events";
import { signInOrigin } from "@/lib/request-origin";
import { signInBhdUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rebind the product session to this window's identity Bearer account.
 * This is the privacy-critical path: shared `bhd_id` must never decide the product user
 * after a Bearer window switch (see docs/BHD-ACCOUNT-ISOLATION.md).
 */
async function profileFromWindowToken(token: string): Promise<IdentityProfile> {
  const issuer = identityIssuer();
  const response = await fetch(`${issuer}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`me_${response.status}`);
  const body = (await response.json()) as {
    user?: { id?: string; email?: string; name?: string; picture?: string | null } | null;
  };
  const user = body.user;
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!user?.id || !email) throw new Error("claims");
  return {
    sub: user.id,
    email,
    name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : email.split("@")[0],
    picture: typeof user.picture === "string" && user.picture.startsWith("https://") ? user.picture : null,
  };
}

function redirectHome(origin: string, returnTo: string) {
  const response = NextResponse.redirect(new URL(returnTo, origin), 303);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

async function rebind(request: Request) {
  const origin = signInOrigin(request);
  if (!isSsoConfigured()) {
    return NextResponse.redirect(new URL("/login?local=1", origin), 303);
  }

  let token = "";
  let returnTo = "/";
  const contentType = request.headers.get("content-type") || "";
  if (request.method === "POST" && contentType.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as { token?: string; returnTo?: string };
    token = typeof json.token === "string" ? json.token.trim() : "";
    returnTo = safeReturnPath(json.returnTo);
  } else if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") || "").trim();
    returnTo = safeReturnPath(String(form?.get("returnTo") || ""));
  } else {
    returnTo = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  }

  const header = request.headers.get("authorization");
  if (!token && header?.toLowerCase().startsWith("bearer ")) token = header.slice(7).trim();
  if (!token || token.length < 20) {
    return NextResponse.redirect(new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin), 303);
  }

  try {
    const profile = await profileFromWindowToken(token);
    const current = await getSessionUser();
    // Always clear company scope so the rebound user cannot inherit the prior workspace cookie.
    if (current?.bhdSub && current.bhdSub === profile.sub) {
      const response = redirectHome(origin, returnTo);
      response.cookies.delete(COMPANY_COOKIE);
      // Re-stamp the session so browsers do not keep a stale document for the same URL.
      response.cookies.set(SESSION_COOKIE, signSession(current), sessionCookieOptions());
      return response;
    }
    const user = await signInBhdUser(profile, requestMeta(request));
    const response = redirectHome(origin, returnTo);
    response.cookies.delete(COMPANY_COOKIE);
    response.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions());
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL(`/api/auth/bhd/logout?continue=${encodeURIComponent(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`)}`, origin),
      303,
    );
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(COMPANY_COOKIE);
    return response;
  }
}

export const POST = rebind;
export const GET = rebind;
