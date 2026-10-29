import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import { identityIssuer, isSsoConfigured, safeReturnPath, type IdentityProfile } from "@/lib/bhd/identity";
import { requestMeta } from "@/lib/login-events";
import { signInOrigin } from "@/lib/request-origin";
import { signInBhdUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rebind the product session to the identity account of this browser window's Bearer token.
 * Required after account switch: OIDC authorize still sees the shared cookie, but the window
 * token is the active account (privacy — must not keep the previous product user's data).
 */
async function profileFromWindowToken(token: string): Promise<IdentityProfile> {
  const issuer = identityIssuer();
  const response = await fetch(`${issuer}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
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
    // GET: Authorization header only — never put the window JWT in the query string (logs / Referer).
    returnTo = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  }

  const header = request.headers.get("authorization");
  if (!token && header?.toLowerCase().startsWith("bearer ")) token = header.slice(7).trim();
  if (!token || token.length < 20) {
    return NextResponse.redirect(new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin), 303);
  }

  try {
    const profile = await profileFromWindowToken(token);
    const user = await signInBhdUser(profile, requestMeta(request));
    const response = NextResponse.redirect(new URL(returnTo, origin), 303);
    response.cookies.delete(COMPANY_COOKIE);
    response.cookies.set(SESSION_COOKIE, signSession(user), await sessionCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(new URL(`/api/auth/bhd/logout?continue=${encodeURIComponent(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`)}`, origin), 303);
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(COMPANY_COOKIE);
    return response;
  }
}

export const POST = rebind;
export const GET = rebind;
