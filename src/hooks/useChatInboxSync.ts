"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_INBOX_CHANGED } from "@/lib/chat-inbox-events";

// One channel/timer per tab, shared by the list and responsive header bell.
const listeners = new Set<() => void>();
let stopSync: (() => void) | undefined;

function startSync() {
  const db = createClient();
  let channel: ReturnType<typeof db.channel> | undefined;
  let connected = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (document.visibilityState !== "visible" || scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      if (document.visibilityState === "visible") listeners.forEach((listener) => listener());
    }, 100);
  };
  const disconnect = () => {
    connected = false;
    clearInterval(poll);
    clearTimeout(scheduled);
    scheduled = undefined;
    if (channel) {
      const previous = channel;
      channel = undefined;
      void db.removeChannel(previous);
    }
  };
  const visibility = () => {
    if (document.visibilityState !== "visible") { disconnect(); return; }
    if (channel) return;
    const next = db.channel("chat-inbox-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_direct_messages" }, refresh);
    channel = next;
    next.subscribe((status) => {
      if (channel !== next) return;
      connected = status === "SUBSCRIBED";
      if (connected) refresh(); // Catch up after reconnecting.
    });
    poll = setInterval(() => { if (!connected) refresh(); }, 60000);
    refresh();
  };
  window.addEventListener("focus", refresh);
  window.addEventListener(CHAT_INBOX_CHANGED, refresh);
  document.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    disconnect();
    window.removeEventListener("focus", refresh);
    window.removeEventListener(CHAT_INBOX_CHANGED, refresh);
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function useChatInboxSync(onRefresh: () => void, enabled = true) {
  const callback = useRef(onRefresh);
  callback.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    const listener = () => callback.current();
    listeners.add(listener);
    if (!stopSync) stopSync = startSync();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) { stopSync?.(); stopSync = undefined; }
    };
  }, [enabled]);
}
