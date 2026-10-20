import { NextResponse } from "next/server";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * After “add account” on identity, land here then silent-start into the intended page
 * (docs/BHD-ACCOUNT-SWITCHER.md §4). Never opens /login?add=1 again.
 */
export function GET(request: Request) {
  const origin = originOf(request);
  const to = new URL(request.url).searchParams.get("to") || "";
  let returnTo = "/";
  try {
    const target = new URL(to);
    if (target.origin === origin) {
      returnTo = `${target.pathname}${target.search}` || "/";
    } else if (target.hostname === "bhd-om.com" || target.hostname.endsWith(".bhd-om.com") || target.hostname.endsWith(".vercel.app")) {
      return NextResponse.redirect(target.toString());
    }
  } catch {
    /* keep / */
  }
  const start = new URL("/api/auth/bhd/start", origin);
  start.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(start);
}
