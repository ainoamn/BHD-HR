"use client";

import { BHD_APPS, launchUrlForApp, type BhdApp } from "../../lib/bhd/apps";
import { DEFAULT_IDENTITY_ISSUER, type UiLocale } from "../../lib/bhd/identity-public";
import { BhdAppIcon } from "./BhdAppIcon";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type BhdSwitcherUser = {
  name: string;
  email: string;
  picture: string | null;
};

type Panel = "apps" | "account" | null;

const COPY = {
  ar: {
    appsAria: "تطبيقات BHD",
    accountAria: "الحساب",
    appsTitle: "تطبيقات BHD",
    account: "الحساب",
    admin: "الإدارة",
    signOut: "خروج",
  },
  en: {
    appsAria: "BHD apps",
    accountAria: "Account",
    appsTitle: "BHD apps",
    account: "Account",
    admin: "Admin",
    signOut: "Sign out",
  },
} as const;

function stripSlash(value: string) {
  return value.replace(/\/$/, "");
}

function isCurrentApp(app: BhdApp, pageOrigin: string) {
  const here = stripSlash(pageOrigin);
  if (app.id === "account") return here === "https://id.bhd-om.com";
  if (app.id === "portal") {
    return (
      here === "https://www.bhd-om.com" ||
      here === "https://bhd-om.com" ||
      here.endsWith(".vercel.app") ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here)
    );
  }
  return Boolean(app.origin) && here === stripSlash(app.origin);
}

function accountPageUrl(pageOrigin: string) {
  if (!pageOrigin) return "/account";
  const accountApp = BHD_APPS.find((app) => app.id === "account");
  const portalApp = BHD_APPS.find((app) => app.id === "portal");
  if (
    (accountApp && isCurrentApp(accountApp, pageOrigin)) ||
    (portalApp && isCurrentApp(portalApp, pageOrigin))
  ) {
    return "/account";
  }
  return `${DEFAULT_IDENTITY_ISSUER}/account`;
}

function openApp(app: BhdApp, pageOrigin: string) {
  if (app.mode === "identity") {
    window.location.assign(accountPageUrl(pageOrigin));
    return;
  }
  window.location.assign(launchUrlForApp(app, pageOrigin));
}

export function BhdAppSwitcher({
  user,
  onSignOut,
  platformAdmin = false,
  locale = "ar",
}: {
  user: BhdSwitcherUser;
  onSignOut: () => void | Promise<void>;
  platformAdmin?: boolean;
  locale?: UiLocale;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [origin, setOrigin] = useState("");
  const [pictureBroken, setPictureBroken] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsId = useId();
  const accountId = useId();
  const t = COPY[locale];
  const isArabic = locale === "ar";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setPictureBroken(false);
  }, [user.picture]);

  const close = useCallback(() => setPanel(null), []);

  useEffect(() => {
    if (!panel) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [panel, close]);

  function onAppClick(app: BhdApp) {
    if (!app.enabled) return;
    if (app.id === "account") {
      if (window.location.pathname.startsWith("/account")) {
        close();
        return;
      }
      window.location.assign(accountPageUrl(origin));
      return;
    }
    if (origin && isCurrentApp(app, origin)) {
      close();
      return;
    }
    openApp(app, origin);
  }

  const initial = user.name.trim().slice(0, 1) || "B";
  const showPicture = Boolean(user.picture) && !pictureBroken;

  return (
    <div className="bhd-switcher-slot" ref={rootRef}>
      <button
        type="button"
        className="bhd-switcher-grid"
        aria-label={t.appsAria}
        aria-haspopup="dialog"
        aria-expanded={panel === "apps"}
        aria-controls={panel === "apps" ? appsId : undefined}
        onClick={() => setPanel((current) => (current === "apps" ? null : "apps"))}
      >
        <span aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <i key={index} />
          ))}
        </span>
      </button>

      <button
        type="button"
        className="bhd-switcher-avatar"
        aria-label={t.accountAria}
        aria-haspopup="dialog"
        aria-expanded={panel === "account"}
        aria-controls={panel === "account" ? accountId : undefined}
        onClick={() => setPanel((current) => (current === "account" ? null : "account"))}
      >
        {showPicture ? (
          <img
            src={user.picture || undefined}
            alt=""
            width={32}
            height={32}
            referrerPolicy="no-referrer"
            onError={() => setPictureBroken(true)}
          />
        ) : (
          <span>{initial}</span>
        )}
      </button>

      {panel === "apps" ? (
        <div className="bhd-switcher-card" id={appsId} role="dialog" aria-label={t.appsAria}>
          <div className="bhd-switcher-card-head">
            <p>{t.appsTitle}</p>
          </div>
          <div className="bhd-switcher-grid-apps">
            {BHD_APPS.map((app) => {
              const current = origin ? isCurrentApp(app, origin) : false;
              const label = isArabic ? app.nameAr : app.nameEn;
              return (
                <button
                  key={app.id}
                  type="button"
                  className={app.enabled ? "bhd-switcher-app" : "bhd-switcher-app is-disabled"}
                  disabled={!app.enabled}
                  aria-disabled={!app.enabled}
                  aria-current={current ? "page" : undefined}
                  onClick={() => onAppClick(app)}
                >
                  <BhdAppIcon
                    id={app.id}
                    title={label}
                    className={current ? "bhd-switcher-mark is-current" : "bhd-switcher-mark"}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {panel === "account" ? (
        <div className="bhd-switcher-card bhd-switcher-account" id={accountId} role="dialog" aria-label={t.accountAria}>
          <div className="bhd-switcher-account-row">
            {showPicture ? (
              <img
                src={user.picture || undefined}
                alt=""
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                onError={() => setPictureBroken(true)}
              />
            ) : (
              <span className="bhd-switcher-account-initial">{initial}</span>
            )}
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <a className="bhd-switcher-account-link" href={accountPageUrl(origin)}>
            {t.account}
          </a>
          {platformAdmin ? (
            <a className="bhd-switcher-account-link" href="/admin">
              {t.admin}
            </a>
          ) : null}
          <button type="button" className="bhd-switcher-signout" onClick={() => void onSignOut()}>
            {t.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
