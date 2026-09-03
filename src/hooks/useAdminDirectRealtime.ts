"use client";

import { useEffect, useRef, useId } from "react";
import { usePageVisible } from "./usePageVisible";
import { createClient } from "@/lib/supabase/client";
import type { DirectMessage } from "@/lib/admin/messages/types";

interface AdminDirectMessageRow {
  id: string;
  thread_id: string;
  sender_role: "admin" | "student" | "teacher";
  body: string;
  created_at: string;
}

export function useAdminDirectRealtime(
  threadId: string | undefined,
  onMessage: (message: DirectMessage) => void,
  onReconnect?: () => void
) {
  const visible = usePageVisible();
  const instanceId = useId();
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!threadId || !visible) return;
    let disposed = false;

    const supabase = createClient();
    const channel = supabase
      .channel(`admin-direct:${threadId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_direct_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as AdminDirectMessageRow;
          if (!row?.id) return;
          handlerRef.current({
            id: row.id,
            threadId: row.thread_id,
            senderRole: row.sender_role,
            body: row.body,
            createdAt: row.created_at,
          });
        }
      )
      .subscribe((status) => {
        if (!disposed && status === "SUBSCRIBED") reconnectRef.current?.();
      });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [threadId, visible, instanceId]);
}
