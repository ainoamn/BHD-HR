import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";
import { getCachedCatalogApps } from "@/lib/bhd/catalog";
import {
  boundWindowToken,
  captureAccountToken,
  captureWindowToken,
  readActiveAu,
  setActiveAu,
  tokenForAccount,
  windowFetchHeaders,
} from "@/lib/identity/window-session";

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
 * Attaches this window's Bearer so multi-window accounts stay isolated.
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
    .then((data: { token?: unknown; user?: { id?: string } | null } | null) => {
      if (!data || typeof data.token !== "string") return;
      const sub = typeof data.user?.id === "string" ? data.user.id : readActiveAu();
      // Only capture when we know which account the token belongs to — never thrash
      // the window token with a different account after a Google-style switch.
      if (sub) captureAccountToken(sub, data.token);
      else captureWindowToken(data.token);
    })
    .catch(() => undefined);
  return response;
}

export function currentReturnPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search || ""}` || "/";
}

/**
 * Google authuser-style return path: bind tab to `au=<sub>` and bust caches with `_bhd=`.
 */
export function accountBoundReturnPath(returnTo = "/", sub?: string | null) {
  const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const au = (sub || readActiveAu() || "").trim();
  try {
    const url = new URL(path, "https://bhd.local");
    url.searchParams.delete("_bhd");
    if (au) url.searchParams.set("au", au);
    else url.searchParams.delete("au");
    url.searchParams.set("_bhd", String(Date.now()));
    return `${url.pathname}${url.search}`;
  } catch {
    const base = path.includes("?") ? path : `${path}?`;
    const join = base.endsWith("?") || base.endsWith("&") ? "" : "&";
    const auPart = au ? `au=${encodeURIComponent(au)}&` : "";
    return `${path.includes("?") ? path : `${path}?`}${join}${auPart}_bhd=${Date.now()}`.replace("?&", "?");
  }
}

/** Bust bfcache / soft RSC so the rebound session always remounts server UI. */
export function cacheBustReturnPath(returnTo = "/", sub?: string | null) {
  return accountBoundReturnPath(returnTo, sub);
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
  return Number.isFinite(at) && Date.now() - at < 15_000;
}

/** Full-viewport privacy veil — previous account pixels must never stay visible. */
export function paintPrivacyVeil(message = "جاري عزل بيانات الحساب…") {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.dataset.bhdSwitching = "1";
    let veil = document.getElementById("bhd-privacy-veil");
    if (!veil) {
      veil = document.createElement("div");
      veil.id = "bhd-privacy-veil";
      veil.setAttribute("role", "status");
      veil.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#092d24;color:#fff;font:600 1rem/1.5 system-ui,sans-serif;padding:1.5rem;text-align:center";
      document.body.appendChild(veil);
    }
    veil.textContent = message;
  } catch {
    /* ignore */
  }
}

function markIsolationPending() {
  sessionStorage.setItem(REBIND_LOCK, String(Date.now()));
  paintPrivacyVeil();
}

function rebindWithWindowToken(token: string, returnTo: string, sub?: string | null) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/bhd/rebind";
  form.style.display = "none";
  const tokenInput = document.createElement("input");
  tokenInput.name = "token";
  tokenInput.value = token;
  const returnInput = document.createElement("input");
  returnInput.name = "returnTo";
  returnInput.value = accountBoundReturnPath(returnTo, sub);
  form.append(tokenInput, returnInput);
  document.body.appendChild(form);
  form.submit();
}

/**
 * Switch window identity Bearer only (no BhdIdentity.switchAccount auto-isolate).
 * Product isolation is always applyAccountIsolation afterward.
 *
 * Persists shared bhd_id (X-BHD-Persist-Cookie) so linked BHD apps open as this
 * account — Google-style cross-app follow — while ?au= keeps other tabs bound.
 */
export async function switchWindowAccount(sub: string): Promise<{ ok: boolean; token?: string; userId?: string }> {
  if (!sub) return { ok: false };
  paintPrivacyVeil();
  const response = await identityFetch("/api/auth/switch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BHD-Persist-Cookie": "1",
    },
    body: JSON.stringify({ sub }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    token?: string;
    user?: { id?: string } | null;
  };
  const userId = typeof body.user?.id === "string" ? body.user.id : sub;
  if (typeof body.token === "string") {
    captureAccountToken(userId, body.token);
    setActiveAu(userId);
  }
  return {
    ok: response.ok,
    token: typeof body.token === "string" ? body.token : undefined,
    userId,
  };
}

/**
 * Bind this product tab to THIS window's identity account only.
 *
 * PRIMARY path: POST /api/auth/bhd/rebind with the window Bearer.
 * Why: Bearer switch alone is not enough — product cookies must rewrite too.
 *
 * Handoff→start is only for bootstrap when no window token exists.
 */
export async function applyAccountIsolation(
  token?: string | null,
  options?: { force?: boolean; sub?: string | null },
) {
  if (typeof window === "undefined") return;
  if (!options?.force && isAccountRebindPending()) return;
  const sub = (options?.sub || readActiveAu() || "").trim();
  if (sub) setActiveAu(sub);
  const here = currentReturnPath();
  if (isIdentityOrigin()) {
    const next = accountBoundReturnPath(here, sub);
    window.location.assign(next);
    return;
  }
  markIsolationPending();
  const windowToken =
    token || (sub ? tokenForAccount(sub) : "") || boundWindowToken() || sessionStorage.getItem("bhd_window_token") || "";

  // Authoritative: rewrite hr_session from this window's Bearer (never shared bhd_id alone).
  if (windowToken) {
    rebindWithWindowToken(windowToken, here, sub);
    return;
  }

  // Bootstrap only (no window token yet): official handoff → start.
  try {
    const response = await identityFetch("/api/auth/window-handoff", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { ticket?: string };
    const start = new URL(
      productStartPath(accountBoundReturnPath(here, sub)),
      window.location.origin,
    ).toString();
    if (response.ok && data.ticket) {
      const handoff = new URL("/auth/handoff", DEFAULT_IDENTITY_ISSUER);
      handoff.searchParams.set("ticket", data.ticket);
      handoff.searchParams.set("next", start);
      window.location.assign(handoff.toString());
      return;
    }
  } catch {
    /* fall through */
  }

  // Last resort: clear product session then OIDC start (still must not skip logout).
  window.location.assign(
    `/api/auth/bhd/logout?continue=${encodeURIComponent(productStartPath(accountBoundReturnPath(here, sub)))}`,
  );
}

/** Call after a successful matched page load so the next switch can rebind again. */
export function clearAccountRebindLock() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(REBIND_LOCK);
  try {
    delete document.documentElement.dataset.bhdSwitching;
    document.getElementById("bhd-privacy-veil")?.remove();
  } catch {
    /* ignore */
  }
}

/** Identity account recovery when the identity returns ACCOUNT_SECURITY_HOLD. */
export function identityRecoverUrl() {
  return `${DEFAULT_IDENTITY_ISSUER}/recover`;
}
