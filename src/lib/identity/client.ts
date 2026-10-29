import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";
import { getCachedCatalogApps } from "@/lib/bhd/catalog";
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
    if (getCachedCatalogApps().some((app) => app.origin.replace(/\/$/, "") === url.origin)) return url.toString();
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

const REBIND_LOCK = "bhd_rebind_lock";

/** True if a rebind/navigation is already in flight (prevents double submit / freeze). */
export function isAccountRebindPending() {
  if (typeof sessionStorage === "undefined") return false;
  const raw = sessionStorage.getItem(REBIND_LOCK);
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && Date.now() - at < 12_000;
}

/**
 * After switch/logout-this: bind product session to THIS window's identity token, then load the page.
 * Never opens /login?add=1. Must not keep the previous product user's cookie/data (privacy).
 * Deduped: only one rebind at a time so refresh/switch cannot stack navigations.
 */
export function applyAccountIsolation(token?: string | null) {
  if (typeof window === "undefined") return;
  if (isAccountRebindPending()) return;
  const here = currentReturnPath();
  if (isIdentityOrigin()) {
    window.location.assign(here);
    return;
  }
  sessionStorage.setItem(REBIND_LOCK, String(Date.now()));
  const windowToken = token || sessionStorage.getItem("bhd_window_token") || "";
  if (windowToken) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/bhd/rebind";
    form.style.display = "none";
    const tokenInput = document.createElement("input");
    tokenInput.name = "token";
    tokenInput.value = windowToken;
    const returnInput = document.createElement("input");
    returnInput.name = "returnTo";
    returnInput.value = here;
    form.append(tokenInput, returnInput);
    document.body.appendChild(form);
    form.submit();
    return;
  }
  window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent(productStartPath(here))}`);
}

/** Call after a successful matched page load so the next switch can rebind again. */
export function clearAccountRebindLock() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(REBIND_LOCK);
  sessionStorage.removeItem(`bhd-sso:${currentReturnPath()}`);
}

/** Identity account recovery when the identity returns ACCOUNT_SECURITY_HOLD. */
export function identityRecoverUrl() {
  return `${DEFAULT_IDENTITY_ISSUER}/recover`;
}
