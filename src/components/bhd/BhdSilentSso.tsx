"use client";

import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { applyAccountIsolation, clearAccountRebindLock, isAccountRebindPending, isIdentityOrigin, productStartPath } from "@/lib/identity/client";
import { useEffect } from "react";

/**
 * One place that auto-rebinds when identity window ≠ product session.
 * Keeps a lock so refresh cannot stack rebinds and freeze the tab.
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
    const here = `${window.location.pathname}${window.location.search || ""}` || "/";

    void loadBhdIdentity().then(async (identity) => {
      if (cancelled || !identity) return;
      try {
        const { ok, body } = await identity.me();
        if (cancelled || !ok) return;
        if (!body.user?.id) {
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
        if (!local.user?.id) {
          // No product session yet — normal silent start once.
          if (sessionStorage.getItem(`bhd-sso:${here}`) === "1") return;
          sessionStorage.setItem(`bhd-sso:${here}`, "1");
          window.location.replace(identity.productStart(here) || productStartPath(here));
          return;
        }
        // Mismatch: rebind from window token (once).
        applyAccountIsolation(body.token);
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
