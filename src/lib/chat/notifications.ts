import "server-only";
import { createServiceDbClient } from "@/lib/supabase/db-client";
import { sendNotificationWithOptionalPushInDb } from "@/lib/notifications/repository";
import type { ChatMessage } from "@/types";

interface Recipient {
  user_id: string;
  portal_role: "student" | "teacher";
  locale: string | null;
  room_id: string;
  viewing: boolean;
}

/** Only called after a session-authorized message INSERT has succeeded. */
export async function notifyChatMessageInDb(message: ChatMessage) {
  const db = createServiceDbClient();
  const { data, error } = await db.rpc("get_chat_push_recipients", { p_message_id: message.id });
  if (error) throw new Error(`chat_recipients_failed:${error.code}`);
  await Promise.all((data as Recipient[] ?? []).map(async (recipient) => {
    const locale = recipient.locale === "zh-CN" ? "zh-CN" : "ko";
    const url = recipient.portal_role === "teacher"
      ? `/teacher/chat/${recipient.room_id}`
      : `/${locale}/student/chat/${recipient.room_id}`;
    await sendNotificationWithOptionalPushInDb({
      userId: recipient.user_id, type: "chat_message", title: message.senderName,
      body: message.body, push: !recipient.viewing, url,
      tag: `chat:${recipient.room_id}`,
      payload: { roomId: recipient.room_id, messageId: message.id, portalRole: recipient.portal_role },
    }, db);
  }));
}
