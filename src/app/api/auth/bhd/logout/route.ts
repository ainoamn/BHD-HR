import { NextResponse } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { endSessionUrl, isSsoConfigured, isSafeReturnPath } from "@/lib/bhd/identity";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears the product session, then continues to identity end-session or a safe absolute URL
 * (docs/BHD-SESSION-POLICY.md — explicit sign-out only).
 */
function signOut(request: Request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const localOnly = url.searchParams.get("local") === "1";
  const cont = url.searchParams.get("continue") || "";
  let target: string;
  if (localOnly) {
    target = new URL("/login?local=1", origin).toString();
  } else if (cont.startsWith("https://") || cont.startsWith("http://")) {
    try {
      const next = new URL(cont);
      const issuerHost = new URL(process.env.BHD_IDENTITY_ISSUER?.trim() || "https://id.bhd-om.com").host;
      const allowed =
        next.origin === origin ||
        next.host === issuerHost ||
        next.pathname.startsWith("/api/auth/bhd/");
      target = allowed ? cont : isSsoConfigured() ? endSessionUrl(origin, { all }) : new URL("/login?local=1", origin).toString();
    } catch {
      target = isSsoConfigured() ? endSessionUrl(origin, { all }) : new URL("/login?local=1", origin).toString();
    }
  } else if (isSafeReturnPath(cont)) {
    target = new URL(cont, origin).toString();
  } else if (isSsoConfigured()) {
    target = endSessionUrl(origin, { all });
  } else {
    target = new URL("/login?local=1", origin).toString();
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(COMPANY_COOKIE);
  return response;
}

export const GET = signOut;
export const POST = signOut;
