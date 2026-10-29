"use client";

import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import { isIdentityOrigin, productStartPath } from "@/lib/identity/client";
import { useEffect } from "react";

/**
 * Direct URL entry: bind product session to the identity active account via live BhdIdentity.
 * Never /login?add=1 (docs/BHD-IDENTITY-RUNTIME.md).
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
    const here = `${window.location.pathname}${window.location.search || ""}` || "/";
    const guardKey = `bhd-sso:${here}`;
    if (sessionStorage.getItem(guardKey) === "1") return;

    void loadBhdIdentity().then(async (identity) => {
      if (cancelled || !identity) return;
      try {
        const { ok, body } = await identity.me();
        if (cancelled || !ok || !body.user?.id) return;
        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as { user?: { id?: string } | null };
        if (cancelled) return;
        if (local.user?.id && local.user.id === body.user.id) return;
        sessionStorage.setItem(guardKey, "1");
        window.location.replace(identity.productStart(here) || productStartPath(here));
      } catch {
        /* stay */
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
