import { BHD_APPS } from "@/lib/bhd/apps";
import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";
import { captureWindowToken, windowFetchHeaders } from "@/lib/identity/window-session";

export function pageOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin.replace(/\/$/, "");
}

export function isIdentityOrigin(origin = pageOrigin()) {
  const here = origin.replace(/\/$/, "");
  return here === DEFAULT_IDENTITY_ISSUER || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here);
}

export function identityApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isIdentityOrigin()) return normalized;
  return `${DEFAULT_IDENTITY_ISSUER}${normalized}`;
}

/**
 * Always hit the identity host directly (docs/BHD-ACCOUNT-SWITCHER.md §2).
 * Attaches this window's Bearer so multi-window accounts stay isolated (docs/BHD-COPY-TO-PRODUCTS.md §1).
 */
export async function identityFetch(path: string, init?: RequestInit) {
  const headers = windowFetchHeaders(init?.headers);
  const response = await fetch(identityApiUrl(path), {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers,
  });
  const clone = response.clone();
  void clone
    .json()
    .then((data: { token?: unknown } | null) => {
      if (data && typeof data.token === "string") captureWindowToken(data.token);
    })
    .catch(() => undefined);
  return response;
}

export function currentReturnPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search || ""}` || "/";
}

export function productStartPath(returnTo = "/") {
  const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}`;
}

export function allowedBhdUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.origin)) return "";
    if (url.origin === DEFAULT_IDENTITY_ISSUER) return url.toString();
    if (BHD_APPS.some((app) => app.origin.replace(/\/$/, "") === url.origin)) return url.toString();
    if (url.hostname === "bhd-om.com" || url.hostname.endsWith(".bhd-om.com") || url.hostname.endsWith(".vercel.app")) return url.toString();
  } catch {
    /* ignore */
  }
  return "";
}

/** Only path that may open /login?add=1 (docs/BHD-ACCOUNT-SWITCHER.md). */
export function addAccountUrl() {
  const next = isIdentityOrigin()
    ? currentReturnPath()
    : `/auth/continue?to=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.href)}`;
  return `${identityApiUrl("/login")}?add=1&next=${encodeURIComponent(next)}`;
}

/**
 * After switch/logout-this: reload this product bound to the new active identity sub.
 * Never opens /login?add=1.
 */
export function applyAccountIsolation() {
  if (typeof window === "undefined") return;
  const here = currentReturnPath();
  if (isIdentityOrigin()) {
    window.location.assign(here);
    return;
  }
  window.location.assign(productStartPath(here));
}

/** Identity account recovery when the identity returns ACCOUNT_SECURITY_HOLD. */
export function identityRecoverUrl() {
  return `${DEFAULT_IDENTITY_ISSUER}/recover`;
}
