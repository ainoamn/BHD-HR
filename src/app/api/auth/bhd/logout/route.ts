import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { endSessionUrl, isSsoConfigured } from "@/lib/bhd/identity";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signOut(request: Request) {
  const origin = originOf(request);
  const target = isSsoConfigured() ? endSessionUrl(origin) : new URL("/login?local=1", origin).toString();
  const response = NextResponse.redirect(target, 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const GET = signOut;
export const POST = signOut;
