"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_IDENTITY_ISSUER, type UiLocale } from "@/lib/bhd/identity-public";
import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";

type MeResponse = {
  user?: BhdSwitcherUser | null;
  accounts?: BhdSwitcherUser[];
};

/** Staff workspace after SSO (docs/BHD-ACCOUNT-SWITCHER.md §5). */
const WORKSPACE = "/";

/**
 * Product header account menu (BHD-ACCOUNT-SWITCHER §5 — soft switch, no reload flash).
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
    fetch(`${DEFAULT_IDENTITY_ISSUER}/api/auth/me`, { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled || !data) return;
        applyRoster(data, user);
      })
      .catch(() => {
        /* CORP may block; add/logout still work via navigation. */
      });
    return () => {
      cancelled = true;
    };
  }, [identityLinked, user]);

  function applyRoster(data: MeResponse, fallback: BhdSwitcherUser) {
    const list = data.accounts?.length ? data.accounts : data.user ? [data.user] : [];
    if (list.length) setAccounts(list);
    const current =
      (fallback.id && list.find((item) => item.id === fallback.id)) ||
      data.user ||
      list.find((item) => item.email && item.email === fallback.email);
    if (current) setActive({ ...fallback, ...current, id: current.id || fallback.id });
  }

  const clearProductThen = useCallback((url: string) => {
    window.location.assign(`/api/auth/bhd/logout?continue=${encodeURIComponent(url)}`);
  }, []);

  /**
   * Clear product cookie then silent SSO into workspace.
   * `/` without a session is the marketing rewrite, so rebind goes through start once (§5).
   */
  const rebindWorkspace = useCallback(() => {
    clearProductThen(`/api/auth/bhd/start?returnTo=${encodeURIComponent(WORKSPACE)}`);
  }, [clearProductThen]);

  const signOutThis = useCallback(async () => {
    if (!identityLinked) {
      window.location.assign("/api/auth/bhd/logout?local=1");
      return;
    }
    const issuer = DEFAULT_IDENTITY_ISSUER;
    try {
      const response = await fetch(`${issuer}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: false }),
      });
      if (response.ok) {
        const data = (await response.json()) as MeResponse;
        if (data.user) {
          applyRoster(data, data.user);
          window.dispatchEvent(new Event("bhd-account-changed"));
          rebindWorkspace();
          return;
        }
        clearProductThen(`${issuer}/login`);
        return;
      }
    } catch {
      /* fall through */
    }
    const end = new URL(`${issuer}/oauth/end-session`);
    end.searchParams.set("client_id", "bhd-hr");
    end.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/api/auth/bhd/start?returnTo=${encodeURIComponent(WORKSPACE)}`);
    clearProductThen(end.toString());
  }, [clearProductThen, identityLinked, rebindWorkspace]);

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
      if (!sub || sub === active.id) return;
      const issuer = DEFAULT_IDENTITY_ISSUER;
      try {
        const response = await fetch(`${issuer}/api/auth/switch`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub }),
        });
        if (response.ok) {
          const data = (await response.json()) as MeResponse;
          if (data.user) {
            applyRoster(data, data.user);
            window.dispatchEvent(new Event("bhd-account-changed"));
          }
          // Soft UI first; rebind product session once if identity sub changed (no reload of same tree).
          if (data.user?.id && data.user.id !== user.id) {
            rebindWorkspace();
          }
          return;
        }
      } catch {
        /* cross-origin blocked */
      }
      window.location.assign(`${issuer}/account`);
    },
    [active.id, rebindWorkspace, user.id],
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
