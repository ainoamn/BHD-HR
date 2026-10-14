import { getSessionUser } from "@/lib/auth";
import { recordError } from "@/lib/errors";
import { LIMITS, clientIp, hitLimit, limitKey } from "@/lib/rate-limit";
import { originOf } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/** Browser errors (components/error-reporter.tsx). Same-site only, size- and rate-limited; never sets a cookie. */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 8000) return new Response(null, { status: 413 });
  let body: { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) return new Response(null, { status: 400 });
  if (!(await hitLimit(limitKey("errors", await clientIp()), LIMITS.errorReport)).ok) return new Response(null, { status: 429 });
  const user = await getSessionUser().catch(() => null);
  await recordError({
    source: "CLIENT",
    message: body.message,
    stack: typeof body.stack === "string" ? body.stack : null,
    path: typeof body.path === "string" ? body.path : null,
    digest: typeof body.digest === "string" ? body.digest : null,
    companyId: user?.companyId ?? null,
    origin: originOf(request),
  });
  return new Response(null, { status: 204 });
}
