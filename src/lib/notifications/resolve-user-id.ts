import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAuthContext } from "@/lib/auth/session";

export type NotificationPortalRole = "student" | "teacher";

export async function resolveNotificationUserId(
  role: NotificationPortalRole
): Promise<string | null> {
  if (role === "teacher") {
    await ensureSchedulesBootstrapped();
    const auth = await getAuthContext();
    if (auth?.profile.role === "teacher") {
      return auth.userId;
    }
    return null;
  }

  const { ensureAccountSession } = await import("@/lib/account-store");
  const session = await ensureAccountSession();
  return session?.account.id ?? null;
}
