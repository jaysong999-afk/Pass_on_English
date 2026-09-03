"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePageVisible } from "./usePageVisible";
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
  onMessage: (message: ChatMessage) => void,
  onReconnect?: () => void
) {
  const visible = usePageVisible();
  const instanceId = useId();
  const [connected, setConnected] = useState(false);
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!roomId || !visible) return;
    let disposed = false;

    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages:${roomId}:${instanceId}`)
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
      .subscribe((status) => {
        if (disposed) return;
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") reconnectRef.current?.();
      });

    return () => {
      disposed = true;
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, visible, instanceId]);
  return connected && visible;
}
