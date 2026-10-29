"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  paintPrivacyVeil,
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
 * Google authuser gate: never paint product data until identity Bearer (for ?au=)
 * matches the product session. On mismatch, full-page veil + hard rebind.
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

        // Product session already matches URL/window binding — lift veil.
        if (productSub && au && productSub === au) {
          clearAccountRebindLock();
          return;
        }

        const identity = await loadBhdIdentity();
        if (cancelled || !identity) {
          // No identity script — still clear lock so the page is usable offline.
          if (productSub) clearAccountRebindLock();
          return;
        }

        const { ok, body } = await identity.me();
        if (cancelled) return;
        if (!ok || !body.user?.id) {
          clearAccountRebindLock();
          return;
        }

        const identityId = body.user.id;
        const identityEmail = (body.user.email || "").trim().toLowerCase();
        const localEmail = (productEmail || "").trim().toLowerCase();
        if (typeof body.token === "string") captureAccountToken(identityId, body.token);

        // Bind URL au to the window if missing.
        if (!au) setActiveAu(identityId);

        const targetAu = readActiveAu() || identityId;
        const matched =
          Boolean(productSub) &&
          productSub === identityId &&
          productSub === targetAu &&
          (!localEmail || !identityEmail || localEmail === identityEmail);

        if (matched) {
          clearAccountRebindLock();
          return;
        }

        if (isAccountRebindPending()) {
          paintPrivacyVeil();
          return;
        }

        paintPrivacyVeil("جاري ربط الجلسة بالحساب المحدد…");
        const token = boundWindowToken() || (typeof body.token === "string" ? body.token : "");
        await applyAccountIsolation(token, { force: true, sub: targetAu || identityId });
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
