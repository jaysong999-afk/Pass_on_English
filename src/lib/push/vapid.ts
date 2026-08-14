import webpush from "web-push";

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

export function ensureWebPushConfigured(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@passonenglish.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
  configured = true;
  return true;
}

export { webpush };
