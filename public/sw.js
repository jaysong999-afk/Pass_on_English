/* eslint-disable no-restricted-globals */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pass on English", body: event.data.text() };
  }

  const title = payload.title || "Pass on English";
  const body = payload.body || "";
  const tag = payload.tag || "pass-on-english";
  const url = payload.url || "/";
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { ...data, url },
      icon: "/icons/pwa-192.png",
      badge: "/icons/pwa-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const destination = new URL(data.url || "/", self.location.origin);
  const url = destination.origin === self.location.origin ? destination.href : self.location.origin;
  const notificationId = data.notificationId;

  event.waitUntil(
    (async () => {
      // Navigate before click tracking: a slow API must never delay opening the chat.
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = clients.find((item) => item.url === url) || clients[0];
      if (client) {
        if (client.url !== url && "navigate" in client) await client.navigate(url);
        await client.focus();
      } else if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }

      if (notificationId) {
        try {
          const portalRole = data.portalRole === "teacher" ? "teacher" : "student";
          await fetch(`/api/notifications/${notificationId}/click?role=${portalRole}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          /* ignore tracking errors */
        }
      }

    })()
  );
});
