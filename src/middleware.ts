import { NextResponse, type NextRequest } from "next/server";

/** First path segments whose links carry case-sensitive tokens or file names; their paths are never lowercased. */
const CASE_SENSITIVE = new Set(["_next", "api", "portal", "invite", "files", "verify", "apply", "task", "letter", "id", "pwa-icon"]);

/**
 * Addresses typed with capitals (/ADMIN, /Employees) go to their lowercase page instead of a 404.
 * Visitors without a session see the public landing page at "/"; signed-in users get their dashboard.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    const first = pathname.split("/")[1]?.toLowerCase() ?? "";
    if (/[A-Z]/.test(pathname) && !CASE_SENSITIVE.has(first)) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.toLowerCase();
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }
  if (request.cookies.has("hr_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/welcome";
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/", "/((?!_next/|api/|portal/|invite/|files/|verify/|apply/|task/|letter/|id/).*[A-Z].*)"] };
