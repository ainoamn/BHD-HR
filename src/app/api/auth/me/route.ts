import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product session mirror for silent SSO matching (docs/BHD-ACCOUNT-SWITCHER.md §3).
 * `user.id` is the BHD `sub` when linked so it compares with identity `/api/auth/me`.
 * JSON only — no Set-Cookie (BHD-SESSION-POLICY).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, accounts: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    {
      user: {
        id: user.bhdSub || user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        username: user.username,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
