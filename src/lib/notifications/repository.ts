import type { SupabaseClient } from "@supabase/supabase-js";
import { createRequestDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
import { patchAdminCampaignInCache } from "@/lib/admin/messages/admin-messages-cache";
import { sendPushToUsersInDb } from "@/lib/push/send-service";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listNotificationsForUserInDb(userId: string): Promise<AppNotification[]> {
  const supabase = await createRequestDbClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, payload, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`notifications_fetch_failed: ${error.message}`);
  }

  return ((data ?? []) as NotificationRow[]).map(rowToNotification);
}

export async function getNotificationByIdInDb(
  userId: string,
  notificationId: string
): Promise<AppNotification | null> {
  const supabase = await createRequestDbClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, payload, read_at, created_at")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`notification_fetch_failed: ${error.message}`);
  }

  if (!data) return null;
  return rowToNotification(data as NotificationRow);
}

export async function markNotificationsReadInDb(
  userId: string,
  input: { ids?: string[]; all?: boolean }
): Promise<number> {
  const supabase = await createRequestDbClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .is("read_at", null);

  if (!input.all && input.ids?.length) {
    query = query.in("id", input.ids);
  } else if (!input.all) {
    return 0;
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`notifications_mark_read_failed: ${error.message}`);
  }

  return data?.length ?? 0;
}

async function incrementBroadcastClickCount(
  supabase: SupabaseClient,
  broadcastId: string
): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from("admin_broadcasts")
    .select(
      "id, title, body, sent_at, audience, enrollment_filters, channel, segment_label, recipient_count, delivered_count, failed_count, clicked_count"
    )
    .eq("id", broadcastId)
    .maybeSingle();

  if (fetchError || !row) return;

  const clicked = (row.clicked_count ?? 0) + 1;
  await supabase.from("admin_broadcasts").update({ clicked_count: clicked }).eq("id", broadcastId);

  try {
    patchAdminCampaignInCache({
      id: row.id,
      title: row.title,
      segment: row.segment_label ?? row.audience ?? "전체",
      sentAt: row.sent_at,
      recipients: row.recipient_count,
      delivered: row.delivered_count,
      failed: row.failed_count,
      clicked,
      channel: row.channel === "push_chat" ? "push_chat" : "push",
    });
  } catch {
    /* cache optional */
  }
}

export async function trackNotificationClickInDb(
  notificationId: string,
  userId: string
): Promise<{ tracked: boolean; broadcastId?: string }> {
  const supabase = await createRequestDbClient();

  const { data: row, error } = await supabase
    .from("notifications")
    .select("id, user_id, payload, read_at")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !row) {
    throw new Error("notification_not_found");
  }

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const alreadyClicked = Boolean(payload.clicked);
  const broadcastId =
    typeof payload.broadcastId === "string"
      ? payload.broadcastId
      : typeof payload.campaignId === "string"
        ? payload.campaignId
        : undefined;

  const now = new Date().toISOString();
  const nextPayload = { ...payload, clicked: true, clickedAt: now };

  await supabase
    .from("notifications")
    .update({
      read_at: row.read_at ?? now,
      payload: nextPayload,
    })
    .eq("id", notificationId);

  if (broadcastId && !alreadyClicked) {
    const privileged = createServiceDbClient();
    await incrementBroadcastClickCount(privileged, broadcastId);
    return { tracked: true, broadcastId };
  }

  return { tracked: !alreadyClicked, broadcastId };
}

export async function sendNotificationWithOptionalPushInDb(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  push?: boolean;
}): Promise<AppNotification> {
  const supabase = await createRequestDbClient();
  const trimmedBody = input.body.trim();

  const { data: row, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title.trim(),
      body: trimmedBody.slice(0, 500),
      payload: input.payload ?? {},
    })
    .select("id, user_id, type, title, body, payload, read_at, created_at")
    .single();

  if (error || !row) {
    throw new Error(`notification_insert_failed: ${error?.message}`);
  }

  if (input.push) {
    await sendPushToUsersInDb(supabase, [input.userId], {
      title: input.title.trim(),
      body: trimmedBody.slice(0, 500),
      tag: input.type,
      data: {
        notificationId: row.id,
        ...(input.payload ?? {}),
      },
    });
  }

  return rowToNotification(row as NotificationRow);
}
