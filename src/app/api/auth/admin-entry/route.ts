import { NextResponse } from "next/server";
import { isSsoConfigured } from "@/lib/bhd/identity";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";

/** The HR admin console lives at `/settings` (there is no `/admin` route in this product). */
function adminReturnTo(request: Request): string {
  const raw = new URL(request.url).searchParams.get("next")?.trim() || "/settings";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) {
    return "/settings";
  }
  return raw;
}

/**
 * Product + identity: never send admins to `?local=1` password login.
 * Forwards to the site's BHD start so the same identity session opens the admin console.
 */
export async function GET(request: Request) {
  const origin = originOf(request);
  const returnTo = adminReturnTo(request);
  if (!isSsoConfigured()) {
    return NextResponse.redirect(new URL(`/login?local=1&next=${encodeURIComponent(returnTo)}`, origin));
  }
  return NextResponse.redirect(new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin));
}
