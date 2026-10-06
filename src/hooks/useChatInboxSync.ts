"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_INBOX_CHANGED } from "@/lib/chat-inbox-events";

// One channel/timer per tab, shared by the list and responsive header bell.
export type ChatInboxScope = "all" | "chat" | "admin-direct";

const listeners = new Map<() => void, ChatInboxScope>();
let stopSync: (() => void) | undefined;

function startSync() {
  const db = createClient();
  let channel: ReturnType<typeof db.channel> | undefined;
  let connected = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const pendingScopes = new Set<ChatInboxScope>();
  const refresh = (scope: ChatInboxScope = "all") => {
    if (document.visibilityState !== "visible") return;
    pendingScopes.add(scope);
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      if (document.visibilityState !== "visible") return;
      const scopes = new Set(pendingScopes);
      pendingScopes.clear();
      listeners.forEach((listenerScope, listener) => {
        if (
          scopes.has("all") ||
          listenerScope === "all" ||
          scopes.has(listenerScope)
        ) {
          listener();
        }
      });
    }, 100);
  };
  const disconnect = () => {
    connected = false;
    clearInterval(poll);
    clearTimeout(scheduled);
    scheduled = undefined;
    pendingScopes.clear();
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => refresh("chat")
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_direct_messages" },
        () => refresh("admin-direct")
      );
    channel = next;
    next.subscribe((status) => {
      if (channel !== next) return;
      connected = status === "SUBSCRIBED";
      if (connected) refresh(); // Catch up after reconnecting.
    });
    poll = setInterval(() => { if (!connected) refresh(); }, 60000);
    refresh();
  };
  const refreshAll = () => refresh("all");
  window.addEventListener("focus", refreshAll);
  window.addEventListener(CHAT_INBOX_CHANGED, refreshAll);
  document.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    disconnect();
    window.removeEventListener("focus", refreshAll);
    window.removeEventListener(CHAT_INBOX_CHANGED, refreshAll);
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function useChatInboxSync(
  onRefresh: () => void,
  enabled = true,
  scope: ChatInboxScope = "all"
) {
  const callback = useRef(onRefresh);
  callback.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    const listener = () => callback.current();
    listeners.set(listener, scope);
    if (!stopSync) stopSync = startSync();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) { stopSync?.(); stopSync = undefined; }
    };
  }, [enabled, scope]);
}
