import { NextResponse, type NextRequest } from "next/server";

/** Visitors without a session see the public landing page at "/"; signed-in users get their dashboard. */
export function middleware(request: NextRequest) {
  if (request.cookies.has("hr_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/welcome";
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/"] };
