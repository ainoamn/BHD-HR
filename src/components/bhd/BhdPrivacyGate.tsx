"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  scrubCacheBustFromUrl,
} from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import {
  boundWindowToken,
  captureAccountToken,
  readActiveAu,
  setActiveAu,
} from "@/lib/identity/window-session";
import { useEffect } from "react";

/**
 * Ensures identity ≡ product ≡ ?au= without any visible notice.
 * Matched → scrub `_bhd` and continue. Mismatch → silent JSON rebind.
 */
export function BhdPrivacyGate({
  productSub,
  productEmail,
}: {
  productSub?: string | null;
  productEmail?: string | null;
}) {
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
      clearAccountRebindLock();
      return;
    }

    let cancelled = false;

    async function gate() {
      if (cancelled) return;
      try {
        const au = readActiveAu();
        if (au) setActiveAu(au);

        // Fast path: product already bound to this tab's account — no network, no overlay.
        if (productSub && (!au || productSub === au)) {
          if (productSub) setActiveAu(productSub);
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        if (isAccountRebindPending()) {
          // Switch navigation in flight — do not paint notices on the landing page.
          if (productSub && au && productSub === au) {
            clearAccountRebindLock();
            scrubCacheBustFromUrl();
          }
          return;
        }

        const identity = await loadBhdIdentity();
        if (cancelled || !identity) {
          if (productSub) {
            clearAccountRebindLock();
            scrubCacheBustFromUrl();
          }
          return;
        }

        const { ok, body } = await identity.me();
        if (cancelled) return;
        if (!ok || !body.user?.id) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        const identityId = body.user.id;
        const identityEmail = (body.user.email || "").trim().toLowerCase();
        const localEmail = (productEmail || "").trim().toLowerCase();
        if (typeof body.token === "string") captureAccountToken(identityId, body.token);
        if (!au) setActiveAu(identityId);

        const targetAu = readActiveAu() || identityId;
        const matched =
          Boolean(productSub) &&
          productSub === identityId &&
          productSub === targetAu &&
          (!localEmail || !identityEmail || localEmail === identityEmail);

        if (matched) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        // Silent repair — no message, no green splash.
        const token = boundWindowToken() || (typeof body.token === "string" ? body.token : "");
        await applyAccountIsolation(token, { force: true, sub: targetAu || identityId, silent: true });
      } catch {
        clearAccountRebindLock();
      }
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [productEmail, productSub]);

  return null;
}
