import { NextResponse, type NextRequest } from "next/server";

/** First path segments whose links carry case-sensitive tokens or file names; their paths are never lowercased. */
const CASE_SENSITIVE = new Set(["_next", "api", "portal", "invite", "files", "verify", "apply", "task", "letter", "id", "pwa-icon"]);

/**
 * Public surfaces — no product session required.
 * Protected paths without `hr_session` go to SSO start once (docs/BHD-ACCOUNT-SWITCHER.md §5).
 */
const PUBLIC_PREFIXES = [
  "/welcome",
  "/login",
  "/pricing",
  "/paused",
  "/auth/",
  "/api/",
  "/_next/",
  "/portal/",
  "/invite/",
  "/files/",
  "/verify/",
  "/apply/",
  "/task/",
  "/letter/",
  "/id/",
  "/pwa-icon/",
  "/favicon",
  "/manifest",
  "/robots",
  "/sitemap",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

/**
 * Addresses typed with capitals (/ADMIN, /Employees) go to their lowercase page instead of a 404.
 * Visitors without a session see the public landing page at "/"; signed-in users get their dashboard.
 * App routes without a session: one hop to silent SSO start with returnTo = current path.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname !== "/") {
    const first = pathname.split("/")[1]?.toLowerCase() ?? "";
    if (/[A-Z]/.test(pathname) && !CASE_SENSITIVE.has(first)) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.toLowerCase();
      return NextResponse.redirect(url, 308);
    }
  }

  const hasSession = request.cookies.has("hr_session");

  if (pathname === "/") {
    if (hasSession) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.rewrite(url);
  }

  if (!isPublicPath(pathname) && !hasSession) {
    const returnTo = `${pathname}${search || ""}` || "/";
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/bhd/start";
    url.search = `?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
