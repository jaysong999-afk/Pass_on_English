"use client";

import { useEffect, useRef } from "react";
import { ADMIN_SENDER_DISPLAY_NAME } from "@/lib/admin/constants";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, UserRole } from "@/types";

interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_role: UserRole;
  body: string;
  created_at: string;
}

export function useChatRealtime(
  roomId: string,
  currentUserId: string | undefined,
  onMessage: (message: ChatMessage) => void
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!roomId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (!row?.id) return;
          handlerRef.current({
            id: row.id,
            senderId: row.sender_id,
            senderName:
              row.sender_role === "admin"
                ? ADMIN_SENDER_DISPLAY_NAME
                : row.sender_role,
            senderRole: row.sender_role,
            body: row.body,
            createdAt: row.created_at,
            isOwn: !!currentUserId && row.sender_id === currentUserId,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId]);
}
