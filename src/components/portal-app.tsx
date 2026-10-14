"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Download, Smartphone } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { removePushSubscription, savePushSubscription } from "@/server/portal-actions";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * "Install the portal" and "turn on notifications" for the employee's own phone or computer. The service worker
 * only shows notifications; it never caches pages. Hidden once both are done.
 */
export function PortalApp({ token, publicKey }: { token: string; publicKey: string }) {
  const { t } = useLang();
  const [ready, setReady] = useState(false);
  const [pushable, setPushable] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const scope = `/portal/${token}`;

  useEffect(() => {
    const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushable(canPush);
    setDenied(canPush && Notification.permission === "denied");
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (canPush) {
      navigator.serviceWorker
        .register("/portal-sw.js", { scope })
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setSubscribed(Boolean(subscription)))
        .catch(() => setPushable(false))
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [scope]);

  async function enable() {
    setBusy(true);
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDenied(permission === "denied");
        setNote(t("لم يُسمح بالإشعارات من المتصفح", "Notifications were not allowed in the browser"));
        return;
      }
      const registration = await navigator.serviceWorker.register("/portal-sw.js", { scope });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = subscription.toJSON();
      const saved = await savePushSubscription({ token, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh || "", auth: json.keys?.auth || "", userAgent: navigator.userAgent });
      if (!saved.ok) throw new Error("save");
      setSubscribed(true);
      setNote(t("فُعّلت الإشعارات على هذا الجهاز", "Notifications are on for this device"));
    } catch {
      setNote(t("تعذر تفعيل الإشعارات على هذا المتصفح", "Could not turn on notifications in this browser"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(scope);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription({ token, endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setNote(t("أُوقفت الإشعارات على هذا الجهاز", "Notifications are off for this device"));
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    if (!install) return;
    await install.prompt();
    await install.userChoice.catch(() => undefined);
    setInstall(null);
  }

  if (!ready) return null;
  const showInstall = !standalone && (install || ios);
  const showPush = pushable && !denied;
  if (!showInstall && !showPush && !note) return null;
  if (!showInstall && subscribed && !note) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
      <Smartphone size={18} className="shrink-0 text-teal-700" />
      <p className="min-w-0 flex-1 basis-56 leading-6">
        {t(
          "ثبّت البوابة على هاتفك وفعّل الإشعارات ليصلك قرار الإجازة وصرف الراتب وتنبيه انتهاء مستنداتك فوراً.",
          "Install the portal on your phone and turn on notifications to hear about leave decisions, paid salaries and expiring documents at once.",
        )}
        {ios && !standalone ? (
          <span className="block text-xs text-teal-800">
            {t("على آيفون: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتحها من هناك لتفعيل الإشعارات.", "On iPhone: Share, then “Add to Home Screen”, and open it from there to turn on notifications.")}
          </span>
        ) : null}
        {note ? <span className="block text-xs font-semibold">{note}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {install && !standalone ? (
          <button type="button" onClick={installApp} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800">
            <Download size={16} />
            {t("تثبيت", "Install")}
          </button>
        ) : null}
        {showPush ? (
          subscribed ? (
            <button type="button" onClick={disable} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-surface px-3.5 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-60">
              <BellOff size={16} />
              {t("إيقاف الإشعارات", "Turn off")}
            </button>
          ) : (
            <button type="button" onClick={enable} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
              <BellRing size={16} />
              {t("تفعيل الإشعارات", "Turn on notifications")}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
