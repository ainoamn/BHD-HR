"use client";

import { applyAccountIsolation, clearAccountRebindLock, isAccountRebindPending, isIdentityOrigin, productStartPath } from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { useEffect } from "react";

/**
 * Sole auto-binder when identity window ≠ product session (ONE-BHD BhdSilentSso).
 * Uses window-handoff → start. Guarded per identity sub so refresh cannot loop/flicker.
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

    if (isAccountRebindPending()) return;

    let cancelled = false;

    void loadBhdIdentity().then(async (identity) => {
      if (cancelled || !identity) return;
      try {
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
        if (last && Date.now() - last < 15_000) return;
        sessionStorage.setItem(guardKey, String(Date.now()));

        if (!local.user?.id) {
          const here = `${window.location.pathname}${window.location.search || ""}` || "/";
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }

        await applyAccountIsolation(body.token, { force: true });
      } catch {
        clearAccountRebindLock();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
