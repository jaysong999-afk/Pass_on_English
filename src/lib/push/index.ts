function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("[push] service worker registration failed", error);
    return null;
  }
}

export async function subscribeToPush(
  role: "student" | "teacher" = "student"
): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = (await navigator.serviceWorker.ready) ?? (await registerServiceWorker());
  if (!registration) return null;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      role,
    }),
  });

  if (!res.ok) {
    console.warn("[push] subscribe API failed", await res.text());
    return null;
  }

  return subscription;
}

export async function ensurePushSubscription(
  role: "student" | "teacher" = "student"
): Promise<boolean> {
  try {
    const sub = await subscribeToPush(role);
    return Boolean(sub);
  } catch (error) {
    console.warn("[push] ensurePushSubscription failed", error);
    return false;
  }
}
