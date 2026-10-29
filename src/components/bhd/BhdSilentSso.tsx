"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  productStartPath,
  scrubCacheBustFromUrl,
  ensureAuInUrl,
  SILENT_SSO_GUARD_MS,
  tabMayClaimProductCookie,
} from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { boundWindowToken, readActiveAu, setActiveAu } from "@/lib/identity/window-session";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Keep THIS tab on its ?au= account. Drift from another tab's shared cookie is
 * repaired silently (JSON rebind) — never a full reload, and never from a
 * background tab (that caused account flicker across windows).
 */
export function BhdSilentSso() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const onRebound = () => {
      startTransition(() => {
        try {
          router.refresh();
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener("bhd:account-rebound", onRebound);
    return () => window.removeEventListener("bhd:account-rebound", onRebound);
  }, [router, startTransition]);

  useEffect(() => {
    const path = window.location.pathname;
    if (
      isIdentityOrigin() ||
      path.startsWith("/login") ||
      path.startsWith("/welcome") ||
      path.startsWith("/pricing") ||
      path.startsWith("/oauth") ||
      path.startsWith("/api/") ||
      path.startsWith("/auth/") ||
      path.startsWith("/portal/") ||
      path.startsWith("/invite/") ||
      path.startsWith("/callback")
    ) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    async function reconcile() {
      if (cancelled || isAccountRebindPending() || document.hidden) return;
      try {
        const au = readActiveAu();
        if (au) setActiveAu(au);

        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as {
          user?: { id?: string; email?: string } | null;
        };
        if (cancelled) return;

        // Already aligned with this tab's au — nothing to do (no flash on refresh).
        if (local.user?.id && au && local.user.id === au) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          ensureAuInUrl(au);
          return;
        }

        // Background / unfocused tab: do not rewrite the shared cookie.
        if (!tabMayClaimProductCookie()) return;

        const identity = await loadBhdIdentity();
        if (cancelled || !identity) return;
        const { ok, body } = await identity.me();
        if (cancelled || !ok || !body.user?.id) {
          clearAccountRebindLock();
          return;
        }

        const identityId = body.user.id;
        const targetAu = au || identityId;

        if (local.user?.id && local.user.id === identityId && local.user.id === targetAu) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        const guardKey = `bhd-sso:${targetAu || identityId}`;
        const last = Number(sessionStorage.getItem(guardKey) || "0");
        if (last && Date.now() - last < SILENT_SSO_GUARD_MS) return;
        sessionStorage.setItem(guardKey, String(Date.now()));

        if (!local.user?.id) {
          const here = `${window.location.pathname}${window.location.search || ""}` || "/";
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }

        const token =
          (au && identityId !== au ? boundWindowToken() : "") || boundWindowToken() || body.token;
        await applyAccountIsolation(token, {
          force: true,
          sub: targetAu || identityId,
          silent: true,
        });
      } catch {
        clearAccountRebindLock();
      }
    }

    void reconcile();
    const onVis = () => {
      if (!document.hidden) void reconcile();
    };
    const onFocus = () => {
      void reconcile();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    // Rare check — only the focused tab claims the cookie.
    timer = window.setInterval(() => {
      if (!document.hidden && tabMayClaimProductCookie()) void reconcile();
    }, 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
