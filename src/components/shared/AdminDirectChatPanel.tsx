"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { ADMIN_SENDER_DISPLAY_NAME } from "@/lib/admin/constants";
import type { DirectMessage } from "@/lib/admin/messages/types";
import {
  appendDirectMessage,
  dedupeDirectMessages,
} from "@/lib/admin/messages/dedupe-messages";
import { ADMIN_SUPPORT_ROOM_ID, setActiveChatRoom } from "@/lib/chat-active-room";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAdminDirectRealtime } from "@/hooks/useAdminDirectRealtime";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";

interface AdminDirectChatPanelProps {
  role: "student" | "teacher";
  placeholder?: string;
}

export function AdminDirectChatPanel({
  role,
  placeholder = "메시지를 입력하세요...",
}: AdminDirectChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const chatReady = Boolean(threadId) && !loading;

  const { scrollRef, handleScroll, pinToBottom } = useStickToBottomScroll({
    resetKey: threadId,
    itemCount: messages.length,
    ready: chatReady,
  });

  const markRead = useCallback(async () => {
    if (!threadId) return;
    try {
      await fetch("/api/messages/admin-direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, threadId }),
      });
    } catch {
      // Retry on next load.
    }
  }, [role, threadId]);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/admin-direct?role=${role}`);
      const data = await res.json();
      const id = data.thread?.id ?? null;
      setThreadId(id);
      setMessages(dedupeDirectMessages(data.messages ?? []));
      if (id) {
        try {
          await fetch("/api/messages/admin-direct", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, threadId: id }),
          });
          notifyChatInboxChanged();
        } catch {
          // Retry on next load.
        }
      }
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    setActiveChatRoom(ADMIN_SUPPORT_ROOM_ID);
    void loadInbox();
    return () => setActiveChatRoom(null);
  }, [loadInbox]);

  useAdminDirectRealtime(threadId ?? undefined, (message) => {
    pinToBottom();
    setMessages((prev) => appendDirectMessage(prev, message));
    if (message.senderRole === "admin") {
      void markRead();
      notifyChatInboxChanged();
    }
  });

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending || !threadId) return;

    setSending(true);
    pinToBottom();
    try {
      const res = await fetch("/api/messages/admin-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          threadId,
          body: input.trim(),
        }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) =>
          appendDirectMessage(prev, data.message as DirectMessage)
        );
      }
      setInput("");
    } finally {
      setSending(false);
    }
  }

  if (loading && !threadId) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
        Loading...
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
        {ADMIN_SENDER_DISPLAY_NAME} support messages will appear here when available.
      </div>
    );
  }

  return (
    <div className="flex h-[480px] min-h-0 flex-col rounded-2xl border bg-white shadow-sm">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isOwn = msg.senderRole !== "admin";
              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {isOwn ? "Me" : "POE"}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                      isOwn ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                    )}
                  >
                    {!isOwn && (
                      <p className="mb-0.5 text-xs font-medium text-gray-500">
                        {ADMIN_SENDER_DISPLAY_NAME}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <form onSubmit={handleSend} className="flex shrink-0 gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={sending || loading}
        />
        <Button type="submit" size="icon" disabled={sending || loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
