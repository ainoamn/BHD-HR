"use client";

import { useCallback, useEffect, useState } from "react";
import { type UiLocale } from "@/lib/bhd/identity-public";
import { loadBhdIdentity, type BhdIdentityUser } from "@/lib/identity/bhd-browser";
import { addAccountUrl, applyAccountIsolation, isAccountRebindPending, productStartPath } from "@/lib/identity/client";
import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";

function asSwitcher(user: BhdIdentityUser | null | undefined, fallback?: BhdSwitcherUser): BhdSwitcherUser | null {
  if (!user?.id && !fallback?.id) return null;
  return {
    id: user?.id || fallback?.id || "",
    email: user?.email || fallback?.email || "",
    name: user?.name || fallback?.name || user?.email || fallback?.email || "",
    picture: user?.picture ?? fallback?.picture ?? null,
    username: user?.username ?? fallback?.username ?? null,
  };
}

/**
 * Header account menu. Roster from BhdIdentity.me — does NOT auto-rebind on load
 * (BhdSilentSso owns that) to avoid double navigation freezes.
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActive(user);
    if (!identityLinked) setAccounts(user.id ? [user] : []);
  }, [identityLinked, user]);

  useEffect(() => {
    if (!identityLinked) return;
    let cancelled = false;
    void loadBhdIdentity().then(async (identity) => {
      if (cancelled || !identity) return;
      try {
        const { ok, body } = await identity.me();
        if (cancelled || !ok) return;
        const list = (body.accounts?.length ? body.accounts : body.user ? [body.user] : [])
          .map((item) => asSwitcher(item))
          .filter((item): item is BhdSwitcherUser => Boolean(item?.id));
        if (list.length) setAccounts(list);
        const identityUser = asSwitcher(body.user);
        // Only paint the header when it matches the product session — SilentSso rebinds otherwise.
        if (identityUser?.id && user.id && identityUser.id === user.id) {
          setActive({ ...user, ...identityUser, id: identityUser.id });
        }
      } catch {
        /* keep product user */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityLinked, user.id, user.email, user.name, user.picture]);

  const signOutThis = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    if (busy || isAccountRebindPending()) return;
    const identity = await loadBhdIdentity();
    if (!identity) {
      window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent("https://id.bhd-om.com/login")}`);
      return;
    }
    try {
      setBusy(true);
      const { ok, body } = await identity.signOut(false);
      if (ok && body.user) {
        applyAccountIsolation(body.token);
        return;
      }
    } catch {
      /* fall through */
    }
    window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent("https://id.bhd-om.com/login")}`);
  }, [busy, identityLinked]);

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
      if (!sub || sub === active.id || busy || isAccountRebindPending()) return;
      const identity = await loadBhdIdentity();
      if (!identity) {
        window.location.assign(productStartPath(window.location.pathname || "/"));
        return;
      }
      try {
        setBusy(true);
        // Drop prior account paint immediately — isolate (inside switchAccount) rebinds the product.
        setActive({ id: "", name: "", email: "", picture: null });
        setAccounts([]);
        const { ok, body } = await identity.switchAccount(sub);
        if (ok) {
          // Live script already called isolate(); only fall back if navigation did not start.
          if (!identity.isolate) applyAccountIsolation(body.token);
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      setBusy(false);
      window.location.assign("https://id.bhd-om.com/account");
    },
    [active.id, busy],
  );

  return (
    <BhdAppSwitcher
      user={active}
      accounts={accounts}
      platformAdmin={platformAdmin}
      locale={locale}
      onSignOut={() => void signOutThis()}
      onSignOutAll={identityLinked ? () => void signOutAll() : undefined}
      onSwitchAccount={identityLinked && !busy ? (sub) => void switchAccount(sub) : undefined}
      onAddAccount={identityLinked ? () => window.location.assign(addAccountUrl()) : undefined}
    />
  );
}
