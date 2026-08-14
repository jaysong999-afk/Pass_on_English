/* eslint-disable no-restricted-globals */
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
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "/";
  const notificationId = data.notificationId;

  event.waitUntil(
    (async () => {
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

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && url) {
            await client.navigate(url);
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});
