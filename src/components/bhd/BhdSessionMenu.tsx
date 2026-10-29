"use client";

import { useCallback, useEffect, useState } from "react";
import { type UiLocale } from "@/lib/bhd/identity-public";
import { loadBhdIdentity, type BhdIdentityUser } from "@/lib/identity/bhd-browser";
import {
  addAccountUrl,
  applyAccountIsolation,
  isAccountRebindPending,
  productStartPath,
  switchWindowAccount,
} from "@/lib/identity/client";
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
 * Header account menu. Product session is the source of truth for the active face/email
 * (prevents flicker from the other window's cookie). BhdSilentSso owns auto-rebind.
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
    // Always mirror the product session — never flash another account's email here.
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
        // Only enrich picture/name when the window identity matches this product session.
        if (identityUser?.id && user.id && identityUser.id === user.id) {
          setActive({
            ...user,
            name: identityUser.name || user.name,
            picture: identityUser.picture ?? user.picture,
            username: identityUser.username ?? user.username,
            // email stays from product session to avoid cross-window flicker
            email: user.email,
            id: user.id,
          });
        }
      } catch {
        /* keep product user */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityLinked, user]);

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
        await applyAccountIsolation(body.token);
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
      try {
        setBusy(true);
        // Hide previous account data immediately (privacy) until handoff finishes.
        setAccounts([]);
        setActive({ id: "", name: "…", email: "…", picture: null });
        const switched = await switchWindowAccount(sub);
        if (switched.ok) {
          // force: ignore a stale rebind lock so the new Bearer always rewrites hr_session
          await applyAccountIsolation(switched.token, { force: true });
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      setBusy(false);
      setActive(user);
      setAccounts(user.id ? [user] : []);
      window.location.assign(productStartPath(window.location.pathname || "/"));
    },
    [active.id, busy, user],
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
