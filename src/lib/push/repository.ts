import { createRequestDbClient } from "@/lib/supabase/db-client";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function upsertPushSubscriptionInDb(
  userId: string,
  input: PushSubscriptionInput
): Promise<void> {
  const supabase = await createRequestDbClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    throw new Error(`push_subscription_upsert_failed: ${error.message}`);
  }
}
