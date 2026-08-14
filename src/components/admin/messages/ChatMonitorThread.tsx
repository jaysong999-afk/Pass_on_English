"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";
import { useChatRealtime } from "@/hooks/useChatRealtime";

interface ChatMonitorThreadProps {
  roomId: string;
  readOnly?: boolean;
}

export function ChatMonitorThread({ roomId, readOnly = true }: ChatMonitorThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const { scrollRef, handleScroll } = useStickToBottomScroll({
    resetKey: roomId,
    itemCount: messages.length,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`);
      const data = await res.json();
      setMessages((data.messages ?? []) as ChatMessage[]);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  useChatRealtime(roomId, undefined, (message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        대화 불러오는 중...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {readOnly && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
            모니터링 모드 — 학생·선생님 대화 열람 전용
          </div>
        )}
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          아직 메시지가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {readOnly && (
        <div className="shrink-0 border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          모니터링 모드 — 학생·선생님 대화 열람 전용
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.map((msg) => {
          const isStudent = msg.senderRole === "student";
          const isTeacher = msg.senderRole === "teacher";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex w-full gap-2",
                isStudent ? "justify-start" : isTeacher ? "justify-end" : "justify-center"
              )}
            >
              {isStudent && (
                <PersonAvatar
                  name={msg.senderName}
                  avatarUrl={msg.senderAvatarUrl}
                  className="h-8 w-8 shrink-0"
                  fallbackClassName="bg-blue-100 text-xs text-blue-800"
                />
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  isStudent && "rounded-bl-md border bg-gray-50 text-gray-900",
                  isTeacher && "rounded-br-md bg-emerald-600 text-white",
                  !isStudent && !isTeacher && "bg-violet-100 text-violet-900"
                )}
              >
                <p className="mb-0.5 text-[10px] font-semibold opacity-70">
                  {msg.senderName}
                </p>
                <p className="leading-relaxed">{msg.body}</p>
                <p className="mt-1 text-[10px] opacity-60">
                  {new Date(msg.createdAt).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {isTeacher && (
                <PersonAvatar
                  name={msg.senderName}
                  avatarUrl={msg.senderAvatarUrl}
                  className="h-8 w-8 shrink-0"
                  fallbackClassName="bg-emerald-100 text-xs text-emerald-800"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
