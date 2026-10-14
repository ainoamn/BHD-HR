/* Employee portal service worker: shows push notifications and opens the portal when one is tapped.
   It caches nothing and does not handle fetches, so pages always come fresh from the server. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "BHD", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "BHD", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/96",
      data: { url: data.url || "/" },
      dir: "auto",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const target = new URL(url, self.location.origin);
      for (const client of windows) {
        const current = new URL(client.url);
        if (current.pathname === target.pathname && "focus" in client) {
          return client.navigate(target.href).then((opened) => (opened || client).focus());
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
