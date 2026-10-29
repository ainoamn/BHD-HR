"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  productStartPath,
} from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { useEffect } from "react";

/**
 * Keep THIS tab bound to its window identity Bearer.
 * Product cookies (hr_session) are shared across tabs — when another tab switches,
 * LiveUpdates may refresh this tab onto the other account. Re-check on an interval
 * and on visibility; if identity Bearer ≠ product session, rebind back to the Bearer.
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
        const identity = await loadBhdIdentity();
        if (cancelled || !identity) return;
        const { ok, body } = await identity.me();
        if (cancelled || !ok || !body.user?.id) {
          clearAccountRebindLock();
          return;
        }

        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as { user?: { id?: string } | null };
        if (cancelled) return;

        if (local.user?.id && local.user.id === body.user.id) {
          clearAccountRebindLock();
          return;
        }

        const guardKey = `bhd-sso:${body.user.id}`;
        const last = Number(sessionStorage.getItem(guardKey) || "0");
        if (last && Date.now() - last < 8_000) return;
        sessionStorage.setItem(guardKey, String(Date.now()));

        if (!local.user?.id) {
          const here = `${window.location.pathname}${window.location.search || ""}` || "/";
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }

        // Drift: shared product cookie belongs to another tab's switch — restore THIS window.
        await applyAccountIsolation(body.token, { force: true });
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
