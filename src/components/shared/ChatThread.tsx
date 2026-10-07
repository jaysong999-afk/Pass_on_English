"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { ChatComposer } from "@/components/shared/ChatComposer";
import { ChatDateDivider, formatChatTime, shouldShowChatDate } from "@/components/shared/ChatTimeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage, UserRole } from "@/types";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useChatPresence } from "@/hooks/useChatPresence";
import { usePageVisible } from "@/hooks/usePageVisible";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";
import { setActiveChatRoom } from "@/lib/chat-active-room";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import { addChatCursor, mergeChatMessagePages, type ChatMessageCursor, type ChatMessagePageInfo } from "@/lib/chat/message-page";

interface ChatThreadProps {
  roomId: string;
  senderRole: UserRole;
  currentUserId?: string;
  studentId?: string;
  teacherId?: string;
  placeholder?: string;
  locale?: string;
  closedAt?: string;
  closedMessage?: string;
}

const EMPTY_PAGE: ChatMessagePageInfo = { hasMore: false, nextCursor: null };

function messageIsOwn(msg: ChatMessage, viewerRole: UserRole, currentUserId?: string): boolean {
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
  locale = "ko-KR",
  closedAt,
  closedMessage = "This conversation is read-only because the enrollment has ended.",
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState<ChatMessagePageInfo>(EMPTY_PAGE);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendError, setSendError] = useState("");
  const visible = usePageVisible();
  const currentRoom = useRef(roomId);
  currentRoom.current = roomId;
  const loadingRequest = useRef<string | null>(null);
  const prependScrollHeight = useRef<number | null>(null);
  const historyAdvanced = useRef(false);
  const readRequestInFlight = useRef(false);

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
    if (
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      readRequestInFlight.current
    ) return;
    readRequestInFlight.current = true;
    let url = `/api/chat/rooms?role=${senderRole}&id=${encodeURIComponent(roomId)}&action=read`;
    if (senderRole === "student" && studentId) url += `&studentId=${encodeURIComponent(studentId)}`;
    if (senderRole === "teacher" && teacherId) url += `&teacherId=${encodeURIComponent(teacherId)}`;
    try {
      await fetch(url, { method: "PATCH" });
      notifyChatInboxChanged();
    } catch {
      // Badge refresh will retry on next focus or inbox refresh.
    } finally {
      readRequestInFlight.current = false;
    }
  }, [roomId, senderRole, studentId, teacherId]);

  const loadMessages = useCallback(async (cursor: ChatMessageCursor | null = null) => {
    const requestKey = `${roomId}:${cursor?.id ?? "latest"}`;
    if (
      document.visibilityState !== "visible" ||
      loadingRequest.current?.startsWith(`${roomId}:`)
    ) return;
    loadingRequest.current = requestKey;
    if (cursor) {
      prependScrollHeight.current = scrollRef.current?.scrollHeight ?? null;
      setLoadingOlder(true);
    }
    try {
      const url = addChatCursor(`/api/chat/messages?roomId=${encodeURIComponent(roomId)}`, cursor);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (currentRoom.current !== roomId) return;
      const loaded = ((data.messages ?? []) as ChatMessage[]).map(normalizeMessage);
      setMessages((previous) => mergeChatMessagePages(previous, loaded));
      if (cursor || !historyAdvanced.current) setPage(data.page ?? EMPTY_PAGE);
      if (cursor) historyAdvanced.current = true;
      if (!cursor) void markRoomRead();
    } catch {
      // Realtime reconnect or a later visit will retry.
    } finally {
      if (loadingRequest.current === requestKey) loadingRequest.current = null;
      if (cursor) setLoadingOlder(false);
    }
  }, [roomId, scrollRef, normalizeMessage, markRoomRead]);

  useLayoutEffect(() => {
    const previousHeight = prependScrollHeight.current;
    const element = scrollRef.current;
    if (previousHeight === null || !element) return;
    element.scrollTop += element.scrollHeight - previousHeight;
    prependScrollHeight.current = null;
  }, [messages.length, scrollRef]);

  useEffect(() => {
    setActiveChatRoom(roomId);
    setMessages([]);
    setPage(EMPTY_PAGE);
    historyAdvanced.current = false;
    return () => setActiveChatRoom(null);
  }, [roomId]);

  useEffect(() => { if (visible) void loadMessages(); }, [visible, loadMessages]);
  useEffect(() => {
    const read = () => { void markRoomRead(); };
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [markRoomRead]);

  const connected = useChatRealtime(roomId, currentUserId, (message) => {
    const normalized = normalizeMessage(message);
    setMessages((previous) => mergeChatMessagePages(previous, [normalized]));
    if (!normalized.isOwn) void markRoomRead();
  }, () => { void loadMessages(); });
  useChatPresence(roomId, connected);

  async function handleSend() {
    if (!input.trim() || sending || closedAt) return;
    setSending(true);
    setSendError("");
    pinToBottom();
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, body: input.trim(), senderRole, studentId, teacherId, viewerProfileId: currentUserId }),
      });
      const data = await res.json();
      if (res.status === 409 || String(data.error ?? "").includes("chat_room_closed")) {
        setSendError(closedMessage);
        return;
      }
      if (!res.ok) {
        setSendError("메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (data.message) {
        const next = normalizeMessage({ ...data.message, isOwn: true });
        setMessages((previous) => mergeChatMessagePages(previous, [next]));
      }
      setInput("");
    } catch {
      setSendError("메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  function onMessageScroll() {
    handleScroll();
    const element = scrollRef.current;
    if (element && element.scrollTop < 72 && page.nextCursor && !loadingOlder) {
      void loadMessages(page.nextCursor);
    }
  }

  return (
    <div className="flex h-[480px] min-h-0 flex-col rounded-2xl border bg-white shadow-sm">
      <div ref={scrollRef} onScroll={onMessageScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
        {page.hasMore && (
          <div className="mb-3 text-center">
            <Button type="button" size="sm" variant="ghost" disabled={loadingOlder} onClick={() => page.nextCursor && void loadMessages(page.nextCursor)}>
              {loadingOlder ? "불러오는 중..." : "이전 메시지 보기"}
            </Button>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((msg, index) => {
            const isOwn = messageIsOwn(msg, senderRole, currentUserId);
            return (
              <Fragment key={msg.id}>
                {shouldShowChatDate(messages, index) && <ChatDateDivider value={msg.createdAt} locale={locale} />}
                <div className={cn("flex w-full", isOwn ? "justify-end" : "justify-start gap-2")}>
                  {!isOwn && (
                    <PersonAvatar name={msg.senderName} avatarUrl={msg.senderAvatarUrl} className="h-9 w-9 shrink-0" fallbackClassName="bg-gray-200 text-xs font-semibold text-gray-700" />
                  )}
                  <div className={cn("flex max-w-[78%] flex-col", isOwn ? "items-end" : "items-start")}>
                    {!isOwn && <p className="mb-1 px-1 text-xs font-medium text-gray-500">{msg.senderName}</p>}
                    <div className={cn("whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed shadow-sm", isOwn ? "rounded-2xl rounded-br-md bg-brand-600 text-white" : "rounded-2xl rounded-bl-md border border-gray-100 bg-gray-50 text-gray-900")}>
                      {msg.body}
                    </div>
                    <p className={cn("mt-1 px-1 text-[10px] text-gray-400", isOwn ? "text-right" : "text-left")}>
                      {formatChatTime(msg.createdAt, locale)}
                    </p>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
      {closedAt ? (
        <div className="border-t bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800">{closedMessage}</div>
      ) : (
        <>
          {sendError && <p className="border-t px-4 pt-2 text-xs text-red-600">{sendError}</p>}
          <ChatComposer value={input} onChange={setInput} onSubmit={handleSend} placeholder={placeholder} disabled={sending} locale={locale} />
        </>
      )}
    </div>
  );
}
