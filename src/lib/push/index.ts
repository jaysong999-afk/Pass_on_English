export type PushRole = "student" | "teacher";
export type PushFailure = "denied" | "dismissed" | "unsupported" | "unavailable" | "failed";
export class PushError extends Error {
  constructor(public readonly reason: PushFailure) { super(reason); }
}

let registrationRequest: Promise<ServiceWorkerRegistration | null> | undefined;
const saved = new Map<string, number>();
const pending = new Map<string, Promise<PushSubscription>>();

function applicationKey(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function supportsPush() {
  return typeof window !== "undefined" && window.isSecureContext &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !window.isSecureContext || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  registrationRequest ??= navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    registrationRequest = undefined;
    return null;
  });
  return registrationRequest;
}

async function activeRegistration() {
  const registration = await registerServiceWorker();
  if (!registration) throw new PushError("failed");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PushError("failed")), 10000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Called directly by the click handler: permission is requested before any await. */
export async function subscribeToPush(role: PushRole, userId: string, requestPermission = true): Promise<PushSubscription> {
  if (!supportsPush()) throw new PushError("unsupported");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapid) throw new PushError("unavailable");
  const permission = Notification.permission === "default" && requestPermission
    ? await Notification.requestPermission()
    : Notification.permission;
  window.dispatchEvent(new Event("push-permission-changed"));
  if (permission !== "granted") throw new PushError(permission === "denied" ? "denied" : "dismissed");

  const owner = role + ":" + userId;
  const existing = pending.get(owner);
  if (existing) return existing;
  const operation = (async () => {
    const registration = await activeRegistration();
    const key = applicationKey(vapid);
    let subscription = await registration.pushManager.getSubscription();
    const oldKey = subscription?.options.applicationServerKey;
    if (oldKey && String(new Uint8Array(oldKey)) !== String(key)) {
      await subscription!.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: key as BufferSource,
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new PushError("failed");
    const cacheKey = owner + ":" + JSON.stringify(json);
    // No repeated upserts on navigation; retry failures and reconcile on a later visit.
    if ((saved.get(cacheKey) ?? 0) < Date.now()) {
      const response = await fetch("/api/push/subscribe", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, role }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new PushError("failed");
      saved.set(cacheKey, Date.now() + 3600000);
    }
    return subscription;
  })().finally(() => pending.delete(owner));
  pending.set(owner, operation);
  return operation;
}

/** Prevent a shared browser from continuing to receive a signed-out account's messages. */
export async function detachPushSubscription() {
  saved.clear();
  try {
    await Promise.allSettled([...pending.values()]);
    const registration = await navigator.serviceWorker?.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await subscription.unsubscribe();
    await fetch("/api/push/subscribe", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* A cancelled browser subscription is pruned on the next push. */ }
  finally { saved.clear(); }
}
