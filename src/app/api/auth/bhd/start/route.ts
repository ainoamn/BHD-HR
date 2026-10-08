import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  authorizeUrl,
  encodeOAuthState,
  identityConfig,
  isSsoConfigured,
  oauthStateCookieOptions,
  randomUrlToken,
  safeReturnPath,
} from "@/lib/bhd/identity";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("returnTo") ?? url.searchParams.get("next"));
  if (!isSsoConfigured()) {
    return NextResponse.redirect(new URL(`/login?local=1&next=${encodeURIComponent(returnTo)}`, origin));
  }
  const oauth = { state: randomUrlToken(24), nonce: randomUrlToken(24), verifier: randomUrlToken(48), returnTo };
  const response = NextResponse.redirect(authorizeUrl(identityConfig(origin), oauth), 302);
  response.cookies.set(OAUTH_STATE_COOKIE, encodeOAuthState(oauth), oauthStateCookieOptions());
  return response;
}
