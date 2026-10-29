"use client";

import { useCallback, useEffect, useState } from "react";
import { type UiLocale } from "@/lib/bhd/identity-public";
import { loadBhdIdentity, type BhdIdentityUser } from "@/lib/identity/bhd-browser";
import { addAccountUrl, applyAccountIsolation, productStartPath } from "@/lib/identity/client";
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
 * Product header — uses live https://id.bhd-om.com/bhd-identity.js.
 * After switch, product session is rebound via /api/auth/bhd/rebind (window Bearer) so page data matches.
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
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setActive(user);
    if (!identityLinked) setAccounts(user.id ? [user] : []);
  }, [identityLinked, user]);

  useEffect(() => {
    if (!identityLinked || switching) return;
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
        // Privacy: if identity window ≠ product session, rebind immediately — never show mixed data.
        if (identityUser?.id && user.id && identityUser.id !== user.id) {
          setSwitching(true);
          applyAccountIsolation(body.token);
          return;
        }
        if (identityUser) setActive({ ...user, ...identityUser, id: identityUser.id });
      } catch {
        /* keep product user */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityLinked, switching, user]);

  const signOutThis = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    const identity = await loadBhdIdentity();
    if (!identity) {
      window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent("https://id.bhd-om.com/login")}`);
      return;
    }
    try {
      setSwitching(true);
      const { ok, body } = await identity.signOut(false);
      if (ok && body.user) {
        applyAccountIsolation(body.token);
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
      if (!sub || sub === active.id || switching) return;
      const identity = await loadBhdIdentity();
      if (!identity) {
        window.location.assign(productStartPath(window.location.pathname || "/"));
        return;
      }
      try {
        setSwitching(true);
        const { ok, body } = await identity.switchAccount(sub);
        if (ok) {
          // Bind product to the new window token — do not rely on OIDC cookie (still the previous account).
          applyAccountIsolation(body.token);
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      setSwitching(false);
      window.location.assign("https://id.bhd-om.com/account");
    },
    [active.id, switching],
  );

  return (
    <BhdAppSwitcher
      user={active}
      accounts={accounts}
      platformAdmin={platformAdmin}
      locale={locale}
      onSignOut={() => void signOutThis()}
      onSignOutAll={identityLinked ? () => void signOutAll() : undefined}
      onSwitchAccount={identityLinked && !switching ? (sub) => void switchAccount(sub) : undefined}
      onAddAccount={identityLinked ? () => window.location.assign(addAccountUrl()) : undefined}
    />
  );
}
