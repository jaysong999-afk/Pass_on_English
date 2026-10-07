"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { ChatDateDivider, formatChatTime, shouldShowChatDate } from "@/components/shared/ChatTimeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { addChatCursor, mergeChatMessagePages, type ChatMessageCursor, type ChatMessagePageInfo } from "@/lib/chat/message-page";

interface ChatMonitorThreadProps {
  roomId: string;
  readOnly?: boolean;
}

const EMPTY_PAGE: ChatMessagePageInfo = { hasMore: false, nextCursor: null };

export function ChatMonitorThread({ roomId, readOnly = true }: ChatMonitorThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState<ChatMessagePageInfo>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const prependScrollHeight = useRef<number | null>(null);
  const loadingRequest = useRef<string | null>(null);
  const currentRoom = useRef(roomId);
  const historyAdvanced = useRef(false);
  currentRoom.current = roomId;

  const { scrollRef, handleScroll } = useStickToBottomScroll({
    resetKey: roomId,
    itemCount: messages.length,
  });

  const load = useCallback(async (cursor: ChatMessageCursor | null = null) => {
    const requestKey = `${roomId}:${cursor?.id ?? "latest"}`;
    if (loadingRequest.current?.startsWith(`${roomId}:`)) return;
    loadingRequest.current = requestKey;
    if (cursor) {
      prependScrollHeight.current = scrollRef.current?.scrollHeight ?? null;
      setLoadingOlder(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(addChatCursor(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`, cursor));
      if (!res.ok) return;
      const data = await res.json();
      if (currentRoom.current !== roomId) return;
      const loaded = (data.messages ?? []) as ChatMessage[];
      setMessages((previous) => mergeChatMessagePages(previous, loaded));
      if (cursor || !historyAdvanced.current) setPage(data.page ?? EMPTY_PAGE);
      if (cursor) historyAdvanced.current = true;
    } catch {
      if (!cursor) setMessages([]);
    } finally {
      if (loadingRequest.current === requestKey) loadingRequest.current = null;
      if (cursor) setLoadingOlder(false);
      else setLoading(false);
    }
  }, [roomId, scrollRef]);

  useLayoutEffect(() => {
    const previousHeight = prependScrollHeight.current;
    const element = scrollRef.current;
    if (previousHeight === null || !element) return;
    element.scrollTop += element.scrollHeight - previousHeight;
    prependScrollHeight.current = null;
  }, [messages.length, scrollRef]);

  useEffect(() => {
    setMessages([]);
    setPage(EMPTY_PAGE);
    historyAdvanced.current = false;
    void load();
  }, [load]);

  useChatRealtime(roomId, undefined, (message) => {
    setMessages((previous) => mergeChatMessagePages(previous, [message]));
  }, () => { void load(); });

  function onMessageScroll() {
    handleScroll();
    const element = scrollRef.current;
    if (element && element.scrollTop < 72 && page.nextCursor && !loadingOlder) {
      void load(page.nextCursor);
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-500">대화 불러오는 중...</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {readOnly && (
        <div className="shrink-0 border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          모니터링 모드 · 학생과 선생님 대화 열람 전용
        </div>
      )}
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">아직 메시지가 없습니다.</div>
      ) : (
        <div ref={scrollRef} onScroll={onMessageScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {page.hasMore && (
            <div className="text-center">
              <Button type="button" size="sm" variant="ghost" disabled={loadingOlder} onClick={() => page.nextCursor && void load(page.nextCursor)}>
                {loadingOlder ? "불러오는 중..." : "이전 메시지 보기"}
              </Button>
            </div>
          )}
          {messages.map((msg, index) => {
            const isStudent = msg.senderRole === "student";
            const isTeacher = msg.senderRole === "teacher";
            return (
              <Fragment key={msg.id}>
                {shouldShowChatDate(messages, index) && <ChatDateDivider value={msg.createdAt} locale="ko-KR" />}
                <div className={cn("flex w-full gap-2", isStudent ? "justify-start" : isTeacher ? "justify-end" : "justify-center")}>
                  {isStudent && <PersonAvatar name={msg.senderName} avatarUrl={msg.senderAvatarUrl} className="h-8 w-8 shrink-0" fallbackClassName="bg-blue-100 text-xs text-blue-800" />}
                  <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", isStudent && "rounded-bl-md border bg-gray-50 text-gray-900", isTeacher && "rounded-br-md bg-emerald-600 text-white", !isStudent && !isTeacher && "bg-violet-100 text-violet-900")}>
                    <p className="mb-0.5 text-[10px] font-semibold opacity-70">{msg.senderName}</p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
                    <p className="mt-1 text-[10px] opacity-60">{formatChatTime(msg.createdAt, "ko-KR")}</p>
                  </div>
                  {isTeacher && <PersonAvatar name={msg.senderName} avatarUrl={msg.senderAvatarUrl} className="h-8 w-8 shrink-0" fallbackClassName="bg-emerald-100 text-xs text-emerald-800" />}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
