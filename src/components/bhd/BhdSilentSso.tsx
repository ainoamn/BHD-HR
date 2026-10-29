"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  paintPrivacyVeil,
  productStartPath,
} from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { boundWindowToken, readActiveAu, setActiveAu } from "@/lib/identity/window-session";
import { useEffect } from "react";

/**
 * Keep THIS tab bound to its ?au= / window Bearer (Google authuser model).
 * Product cookies (hr_session) are shared across tabs — when another tab switches,
 * restore this tab to its bound account instead of adopting the shared cookie.
 */
export function BhdSilentSso() {
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
      if (cancelled || isAccountRebindPending()) return;
      try {
        const au = readActiveAu();
        if (au) setActiveAu(au);

        const identity = await loadBhdIdentity();
        if (cancelled || !identity) return;
        const { ok, body } = await identity.me();
        if (cancelled || !ok || !body.user?.id) {
          clearAccountRebindLock();
          return;
        }

        const identityId = body.user.id;
        const targetAu = au || identityId;

        // Tab is bound to a different account than the current Bearer — rebind to bound token.
        if (au && identityId !== au) {
          const token = boundWindowToken();
          if (token) {
            paintPrivacyVeil();
            await applyAccountIsolation(token, { force: true, sub: au });
            return;
          }
        }

        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as {
          user?: { id?: string; email?: string } | null;
        };
        if (cancelled) return;

        if (local.user?.id && local.user.id === identityId && local.user.id === targetAu) {
          clearAccountRebindLock();
          return;
        }

        const guardKey = `bhd-sso:${targetAu || identityId}`;
        const last = Number(sessionStorage.getItem(guardKey) || "0");
        if (last && Date.now() - last < 8_000) return;
        sessionStorage.setItem(guardKey, String(Date.now()));

        if (!local.user?.id) {
          const here = `${window.location.pathname}${window.location.search || ""}` || "/";
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }

        paintPrivacyVeil();
        await applyAccountIsolation(boundWindowToken() || body.token, {
          force: true,
          sub: targetAu || identityId,
        });
      } catch {
        clearAccountRebindLock();
      }
    }

    void reconcile();
    const onVis = () => {
      if (!document.hidden) void reconcile();
    };
    document.addEventListener("visibilitychange", onVis);
    timer = window.setInterval(() => {
      if (!document.hidden) void reconcile();
    }, 4_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
