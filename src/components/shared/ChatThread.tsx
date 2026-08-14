"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatMessage, UserRole } from "@/types";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";
import { setActiveChatRoom } from "@/lib/chat-active-room";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";

interface ChatThreadProps {
  roomId: string;
  senderRole: UserRole;
  currentUserId?: string;
  studentId?: string;
  teacherId?: string;
  placeholder?: string;
}

function messageIsOwn(
  msg: ChatMessage,
  viewerRole: UserRole,
  currentUserId?: string
): boolean {
  if (msg.senderRole === viewerRole) return true;
  if (currentUserId && msg.senderId === currentUserId) return true;
  return msg.isOwn === true;
}

export function ChatThread({
  roomId,
  senderRole,
  currentUserId,
  studentId,
  teacherId,
  placeholder = "메시지를 입력하세요...",
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const { scrollRef, handleScroll, pinToBottom } = useStickToBottomScroll({
    resetKey: roomId,
    itemCount: messages.length,
  });

  const normalizeMessage = useCallback(
    (msg: ChatMessage): ChatMessage => ({
      ...msg,
      isOwn: messageIsOwn(msg, senderRole, currentUserId),
    }),
    [currentUserId, senderRole]
  );

  const markRoomRead = useCallback(async () => {
    let url = `/api/chat/rooms?role=${senderRole}&id=${encodeURIComponent(roomId)}&action=read`;
    if (senderRole === "student" && studentId) {
      url += `&studentId=${encodeURIComponent(studentId)}`;
    }
    if (senderRole === "teacher" && teacherId) {
      url += `&teacherId=${encodeURIComponent(teacherId)}`;
    }
    try {
      await fetch(url, { method: "PATCH" });
      notifyChatInboxChanged();
    } catch {
      // Badge refresh will retry on next poll or focus.
    }
  }, [roomId, senderRole, studentId, teacherId]);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`);
    const data = await res.json();
    const loaded = (data.messages ?? []) as ChatMessage[];
    setMessages(loaded.map(normalizeMessage));
    void markRoomRead();
  }, [roomId, normalizeMessage, markRoomRead]);

  useEffect(() => {
    setActiveChatRoom(roomId);
    void loadMessages();
    return () => setActiveChatRoom(null);
  }, [roomId, loadMessages]);

  useChatRealtime(roomId, currentUserId, (message) => {
    const normalized = normalizeMessage(message);
    setMessages((prev) => {
      if (prev.some((m) => m.id === normalized.id)) return prev;
      return [...prev, normalized];
    });
    if (!normalized.isOwn) void markRoomRead();
  });

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    pinToBottom();
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          body: input.trim(),
          senderRole,
          studentId,
          teacherId,
          viewerProfileId: currentUserId,
        }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => {
          const next = normalizeMessage({ ...data.message, isOwn: true });
          if (prev.some((m) => m.id === next.id)) return prev;
          return [...prev, next];
        });
      }
      setInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[480px] min-h-0 flex-col rounded-2xl border bg-white shadow-sm">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        <div className="space-y-3">
        {messages.map((msg) => {
          const isOwn = messageIsOwn(msg, senderRole, currentUserId);
          return (
            <div
              key={msg.id}
              className={cn("flex w-full", isOwn ? "justify-end" : "justify-start gap-2")}
            >
              {!isOwn && (
                <PersonAvatar
                  name={msg.senderName}
                  avatarUrl={msg.senderAvatarUrl}
                  className="h-9 w-9 shrink-0"
                  fallbackClassName="bg-gray-200 text-xs font-semibold text-gray-700"
                />
              )}
              <div
                className={cn(
                  "flex max-w-[78%] flex-col",
                  isOwn ? "items-end" : "items-start"
                )}
              >
                {!isOwn && (
                  <p className="mb-1 px-1 text-xs font-medium text-gray-500">{msg.senderName}</p>
                )}
                <div
                  className={cn(
                    "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                    isOwn
                      ? "rounded-2xl rounded-br-md bg-brand-600 text-white"
                      : "rounded-2xl rounded-bl-md border border-gray-100 bg-gray-50 text-gray-900"
                  )}
                >
                  {msg.body}
                </div>
                <p
                  className={cn(
                    "mt-1 px-1 text-[10px] text-gray-400",
                    isOwn ? "text-right" : "text-left"
                  )}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        </div>
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t bg-gray-50/80 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-12 flex-1 rounded-full border-gray-200 bg-white px-4"
          disabled={sending}
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className="rounded-full shadow-md"
        >
          <Send className="size-7" strokeWidth={2.5} />
        </Button>
      </form>
    </div>
  );
}
