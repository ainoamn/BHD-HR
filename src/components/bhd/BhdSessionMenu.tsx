"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_IDENTITY_ISSUER, type UiLocale } from "@/lib/bhd/identity-public";
import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";

type MeResponse = {
  user?: BhdSwitcherUser | null;
  accounts?: BhdSwitcherUser[];
};

/**
 * Product header account menu (docs/BHD-SESSION-POLICY.md + BHD-APP-SWITCHER §2.2).
 * Roster + switch live on the identity host; after switch/add/logout-this we re-enter via silent SSO start.
 */
export function BhdSessionMenu({
  user,
  platformAdmin = false,
  locale = "ar",
  identityLinked = true,
}: {
  user: BhdSwitcherUser;
  platformAdmin?: boolean;
  locale?: UiLocale;
  /** False for local username accounts that are not linked to BHD identity. */
  identityLinked?: boolean;
}) {
  const [accounts, setAccounts] = useState<BhdSwitcherUser[]>(user.id ? [user] : []);
  const [active, setActive] = useState<BhdSwitcherUser>(user);

  useEffect(() => {
    setActive(user);
    if (!identityLinked) setAccounts(user.id ? [user] : []);
  }, [identityLinked, user]);

  useEffect(() => {
    if (!identityLinked) return;
    let cancelled = false;
    const issuer = DEFAULT_IDENTITY_ISSUER;
    fetch(`${issuer}/api/auth/me`, { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled || !data) return;
        const list = data.accounts?.length ? data.accounts : data.user ? [data.user] : [];
        if (list.length) setAccounts(list);
        const current =
          (user.id && list.find((item) => item.id === user.id)) ||
          data.user ||
          list.find((item) => item.email && item.email === user.email);
        if (current) setActive({ ...user, ...current, id: current.id || user.id });
      })
      .catch(() => {
        /* Identity may block cross-origin reads (CORP); add/logout still work via top-level navigation. */
      });
    return () => {
      cancelled = true;
    };
  }, [identityLinked, user]);

  const productStart = useCallback(() => `${window.location.origin}/api/auth/bhd/start?returnTo=${encodeURIComponent("/")}`, []);

  const clearProductThen = useCallback((url: string) => {
    window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent(url)}`);
  }, []);

  const signOutThis = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    const issuer = DEFAULT_IDENTITY_ISSUER;
    const clientId = "bhd-hr";
    try {
      const response = await fetch(`${issuer}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: false }),
      });
      if (response.ok) {
        const data = (await response.json()) as { user?: BhdSwitcherUser | null };
        clearProductThen(data.user ? productStart() : `${issuer}/login`);
        return;
      }
    } catch {
      /* fall through to end-session hop */
    }
    const end = new URL(`${issuer}/oauth/end-session`);
    end.searchParams.set("client_id", clientId);
    end.searchParams.set("post_logout_redirect_uri", productStart());
    clearProductThen(end.toString());
  }, [clearProductThen, identityLinked, productStart]);

  const signOutAll = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    const issuer = DEFAULT_IDENTITY_ISSUER;
    const end = new URL(`${issuer}/oauth/end-session`);
    end.searchParams.set("client_id", "bhd-hr");
    end.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/`);
    end.searchParams.set("all", "1");
    clearProductThen(end.toString());
  }, [clearProductThen, identityLinked]);

  const switchAccount = useCallback(
    async (sub: string) => {
      if (!sub || sub === user.id) return;
      const issuer = DEFAULT_IDENTITY_ISSUER;
      try {
        const response = await fetch(`${issuer}/api/auth/switch`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub }),
        });
        if (response.ok) {
          clearProductThen(productStart());
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      // Fallback: identity account page has the roster switcher (same browser, host-only cookies).
      window.location.assign(`${issuer}/account`);
    },
    [clearProductThen, productStart, user.id],
  );

  const addAccount = useCallback(() => {
    window.location.assign(`${DEFAULT_IDENTITY_ISSUER}/login?add=1`);
  }, []);

  return (
    <BhdAppSwitcher
      user={active}
      accounts={accounts}
      platformAdmin={platformAdmin}
      locale={locale}
      onSignOut={() => void signOutThis()}
      onSignOutAll={identityLinked ? () => void signOutAll() : undefined}
      onSwitchAccount={identityLinked ? (sub) => void switchAccount(sub) : undefined}
      onAddAccount={identityLinked ? addAccount : undefined}
    />
  );
}
