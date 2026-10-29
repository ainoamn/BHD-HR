"use client";

import { useCallback, useEffect, useState } from "react";
import { type UiLocale } from "@/lib/bhd/identity-public";
import { addAccountUrl, applyAccountIsolation, identityFetch } from "@/lib/identity/client";
import { captureWindowToken, signOutThisWindow } from "@/lib/identity/window-session";
import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";

type MeResponse = {
  user?: BhdSwitcherUser | null;
  accounts?: BhdSwitcherUser[];
  token?: string;
};

/**
 * Product header — Google-style isolation (docs/BHD-ACCOUNT-SWITCHER.md).
 * Switch never opens /login?add=1; after switch the product rebinds via start so data matches the active sub.
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
    identityFetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled || !data) return;
        captureWindowToken(data.token);
        const list = data.accounts?.length ? data.accounts : data.user ? [data.user] : [];
        if (list.length) setAccounts(list);
        const current =
          (user.id && list.find((item) => item.id === user.id)) ||
          data.user ||
          list.find((item) => item.email && item.email === user.email);
        if (current) setActive({ ...user, ...current, id: current.id || user.id });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identityLinked, user]);

  const signOutThis = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    try {
      const response = await identityFetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: false }),
      });
      if (response.ok) {
        const data = (await response.json()) as MeResponse;
        if (data.user) {
          captureWindowToken(data.token);
          applyAccountIsolation();
          return;
        }
        signOutThisWindow();
        window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent("https://id.bhd-om.com/login")}`);
        return;
      }
    } catch {
      /* fall through */
    }
    window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent("https://id.bhd-om.com/login")}`);
  }, [identityLinked]);

  const signOutAll = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    const end = new URL("https://id.bhd-om.com/oauth/end-session");
    end.searchParams.set("client_id", "bhd-hr");
    end.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/`);
    end.searchParams.set("all", "1");
    window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent(end.toString())}`);
  }, [identityLinked]);

  const switchAccount = useCallback(
    async (sub: string) => {
      if (!sub || sub === active.id) return;
      try {
        const response = await identityFetch("/api/auth/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub }),
        });
        if (response.ok) {
          const data = (await response.json()) as MeResponse;
          captureWindowToken(data.token);
          // Full rebind: product session + page data must become the new account only.
          applyAccountIsolation();
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      // Never /login?add=1 on switch failure — identity account page has the roster.
      window.location.assign("https://id.bhd-om.com/account");
    },
    [active.id],
  );

  return (
    <BhdAppSwitcher
      user={active}
      accounts={accounts}
      platformAdmin={platformAdmin}
      locale={locale}
      onSignOut={() => void signOutThis()}
      onSignOutAll={identityLinked ? () => void signOutAll() : undefined}
      onSwitchAccount={identityLinked ? (sub) => void switchAccount(sub) : undefined}
      onAddAccount={identityLinked ? () => window.location.assign(addAccountUrl()) : undefined}
    />
  );
}
