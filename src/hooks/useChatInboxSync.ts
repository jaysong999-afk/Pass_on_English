"use client";

import { useEffect, useId, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_INBOX_CHANGED } from "@/lib/chat-inbox-events";

const POLL_MS = 15_000;

/** Keeps chat inbox badges fresh via polling, focus, custom events, and Supabase realtime. */
export function useChatInboxSync(onRefresh: () => void, enabled = true) {
  const instanceId = useId();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => onRefreshRef.current();

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(CHAT_INBOX_CHANGED, refresh);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);

    const supabase = createClient();
    const channelName = `chat-inbox-sync-${instanceId.replace(/:/g, "")}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_direct_messages" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => refresh()
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(CHAT_INBOX_CHANGED, refresh);
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId]);
}
