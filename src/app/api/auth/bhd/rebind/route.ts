import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, getSessionUser, sessionCookieOptions, signSession } from "@/lib/auth";
import { identityIssuer, isSsoConfigured, safeReturnPath, type IdentityProfile } from "@/lib/bhd/identity";
import { requestMeta } from "@/lib/login-events";
import { signInOrigin } from "@/lib/request-origin";
import { signInBhdUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rebind product session to this window's identity Bearer.
 * - Form/GET → 303 redirect (account switch — full remount).
 * - JSON Accept → { ok, user, unchanged? } + Set-Cookie (silent reconcile — no flash).
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

function bindReturnPath(returnTo: string, sub: string) {
  const safe = safeReturnPath(returnTo);
  try {
    const url = new URL(safe, "https://bhd.local");
    url.searchParams.set("au", sub);
    // Cache-bust only on hard redirect after a real account change.
    url.searchParams.set("_bhd", String(Date.now()));
    return `${url.pathname}${url.search}`;
  } catch {
    return safe;
  }
}

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

function redirectHome(origin: string, returnTo: string) {
  const response = NextResponse.redirect(new URL(returnTo, origin), 303);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function jsonOk(
  payload: { ok: true; unchanged?: boolean; user: { id: string; email: string; name: string } },
  setSession?: { cookie: string },
) {
  const response = NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache" },
  });
  response.cookies.delete(COMPANY_COOKIE);
  if (setSession) {
    response.cookies.set(SESSION_COOKIE, setSession.cookie, sessionCookieOptions());
  }
  return response;
}

async function rebind(request: Request) {
  const origin = signInOrigin(request);
  const json = wantsJson(request);

  if (!isSsoConfigured()) {
    if (json) return NextResponse.json({ ok: false, error: "sso" }, { status: 503 });
    return NextResponse.redirect(new URL("/login?local=1", origin), 303);
  }

  let token = "";
  let returnTo = "/";
  const contentType = request.headers.get("content-type") || "";
  if (request.method === "POST" && contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { token?: string; returnTo?: string };
    token = typeof body.token === "string" ? body.token.trim() : "";
    returnTo = safeReturnPath(body.returnTo);
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
    if (json) return NextResponse.json({ ok: false, error: "token" }, { status: 401 });
    return NextResponse.redirect(new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin), 303);
  }

  try {
    const profile = await profileFromWindowToken(token);
    const current = await getSessionUser();

    // Already on this account — silent JSON: no redirect, no flash.
    if (current?.bhdSub && current.bhdSub === profile.sub) {
      if (json) {
        return jsonOk({
          ok: true,
          unchanged: true,
          user: { id: profile.sub, email: current.email, name: current.name },
        });
      }
      const user = await signInBhdUser(profile, requestMeta(request));
      const response = redirectHome(origin, bindReturnPath(returnTo, profile.sub));
      response.cookies.delete(COMPANY_COOKIE);
      response.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions());
      return response;
    }

    const user = await signInBhdUser(profile, requestMeta(request));
    if (json) {
      return jsonOk(
        { ok: true, user: { id: user.bhdSub || profile.sub, email: user.email, name: user.name } },
        { cookie: signSession(user) },
      );
    }
    const response = redirectHome(origin, bindReturnPath(returnTo, profile.sub));
    response.cookies.delete(COMPANY_COOKIE);
    response.cookies.set(SESSION_COOKIE, signSession(user), sessionCookieOptions());
    return response;
  } catch {
    if (json) {
      const response = NextResponse.json({ ok: false, error: "rebind" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      response.cookies.delete(COMPANY_COOKIE);
      return response;
    }
    const response = NextResponse.redirect(
      new URL(
        `/api/auth/bhd/logout?continue=${encodeURIComponent(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`)}`,
        origin,
      ),
      303,
    );
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(COMPANY_COOKIE);
    return response;
  }
}

export const POST = rebind;
export const GET = rebind;
