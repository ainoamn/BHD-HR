import type { Instrumentation } from "next";

/** Every server error of a page, action or route is grouped into ErrorEvent (Settings › System health). */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const failure = error as Error & { digest?: string };
  if (typeof failure.digest === "string" && /^(NEXT_|DYNAMIC_SERVER_USAGE)/.test(failure.digest)) return;
  const { companyFromCookieHeader, recordError } = await import("./lib/errors");
  const companyId = await companyFromCookieHeader(request.headers.cookie).catch(() => null);
  const host = request.headers.host;
  await recordError({
    source: "SERVER",
    message: failure.message || String(error),
    stack: failure.stack,
    path: request.path,
    digest: failure.digest,
    companyId,
    origin: typeof host === "string" ? `https://${host}` : undefined,
  });
};
