import { getAuthContext } from "@/lib/auth/session";

export type NotificationPortalRole = "student" | "teacher";

/** Subscription and notification reads need only identity, never global schedule/account caches. */
export async function resolveNotificationUserId(role: NotificationPortalRole): Promise<string | null> {
  const auth = await getAuthContext();
  return auth?.profile.role === role ? auth.userId : null;
}
