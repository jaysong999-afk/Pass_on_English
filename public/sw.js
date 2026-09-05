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
  let url = self.location.origin + "/";
  try {
    const destination = new URL(typeof data.url === "string" ? data.url : "/", self.location.origin);
    if (destination.origin === self.location.origin) url = destination.href;
  } catch {
    // A malformed payload must still open the app home instead of aborting the click event.
  }
  const notificationId = data.notificationId;

  event.waitUntil(
    (async () => {
      let clients = [];
      try {
        clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      } catch {
        // Continue to open a fresh app window if client enumeration is unavailable.
      }
      const exactClient = clients.find((item) => item.url === url);
      let opened = false;
      if (exactClient) {
        try {
          await exactClient.focus();
          opened = true;
        } catch { /* try navigation/openWindow below */ }
      }
      if (!opened) {
        const navigableClient = clients.find((item) => typeof item.navigate === "function");
        if (navigableClient) {
          try {
            const navigated = await navigableClient.navigate(url);
            if (navigated) {
              await navigated.focus();
              opened = true;
            }
          } catch { /* mobile browsers may reject navigation for an existing client */ }
        }
        if (!opened && self.clients.openWindow) {
          try {
            const freshClient = await self.clients.openWindow(url);
            if (freshClient) await freshClient.focus();
            opened = true;
          } catch { /* fall back to focusing the existing app window */ }
        }
        if (!opened && clients[0]) {
          try { await clients[0].focus(); } catch { /* notification click is best effort */ }
        }
      }

      if (notificationId) {
        // Tracking is auxiliary; it must never prevent the app/chat from opening.
        try {
          const portalRole = data.portalRole === "teacher" ? "teacher" : "student";
          void fetch(`/api/notifications/${notificationId}/click?role=${portalRole}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          }).catch(() => {});
        } catch {
          /* ignore tracking errors */
        }
      }

    })()
  );
});
