"use client";

import { identityFetch, isIdentityOrigin, productStartPath } from "@/lib/identity/client";
import { captureWindowToken } from "@/lib/identity/window-session";
import { useEffect } from "react";

/**
 * Direct URL entry: bind product session to the identity active account silently.
 * Never /login?add=1 (docs/BHD-ACCOUNT-SWITCHER.md §3).
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

    identityFetch("/api/auth/me")
      .then((response) => response.json())
      .then(async (identity: { user?: { id?: string } | null; token?: string }) => {
        if (cancelled || !identity.user?.id) return;
        captureWindowToken(identity.token);
        const localResponse = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        const local = (await localResponse.json().catch(() => ({}))) as { user?: { id?: string } | null };
        if (cancelled) return;
        if (local.user?.id && local.user.id === identity.user.id) return;
        sessionStorage.setItem(guardKey, "1");
        window.location.replace(productStartPath(here));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
