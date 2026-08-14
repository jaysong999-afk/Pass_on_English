import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWebPushConfigured, webpush } from "@/lib/push/vapid";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  expired: number;
  skipped: boolean;
  usersReached: number;
  usersWithSubscriptions: number;
}

function isExpiredSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode = "statusCode" in error ? Number(error.statusCode) : NaN;
  return statusCode === 404 || statusCode === 410;
}

export async function fetchPushSubscriptionsForUsersInDb(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) {
    throw new Error(`push_subscriptions_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as PushSubscriptionRow[];
}

export async function deletePushSubscriptionByEndpointInDb(
  supabase: SupabaseClient,
  endpoint: string
): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    throw new Error(`push_subscription_delete_failed: ${error.message}`);
  }
}

export async function sendPushToUsersInDb(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PushPayload
): Promise<PushSendResult> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) {
    return {
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: false,
      usersReached: 0,
      usersWithSubscriptions: 0,
    };
  }

  const subscriptions = await fetchPushSubscriptionsForUsersInDb(supabase, uniqueUserIds);
  const usersWithSubscriptions = new Set(subscriptions.map((s) => s.user_id)).size;

  if (!ensureWebPushConfigured()) {
    return {
      sent: 0,
      failed: subscriptions.length,
      expired: 0,
      skipped: true,
      usersReached: 0,
      usersWithSubscriptions,
    };
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    data: payload.data ?? {},
  });

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const reachedUsers = new Set<string>();

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          notificationPayload
        );
        sent += 1;
        reachedUsers.add(subscription.user_id);
      } catch (error) {
        if (isExpiredSubscriptionError(error)) {
          expired += 1;
          try {
            await deletePushSubscriptionByEndpointInDb(supabase, subscription.endpoint);
          } catch (deleteError) {
            console.warn("[push] failed to delete expired subscription", deleteError);
          }
        } else {
          failed += 1;
          console.warn("[push] send failed", subscription.endpoint, error);
        }
      }
    })
  );

  return {
    sent,
    failed,
    expired,
    skipped: false,
    usersReached: reachedUsers.size,
    usersWithSubscriptions,
  };
}
