"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ADMIN_SENDER_DISPLAY_NAME } from "@/lib/admin/constants";
import type { DirectMessage } from "@/lib/admin/messages/types";
import { appendDirectMessage, dedupeDirectMessages } from "@/lib/admin/messages/dedupe-messages";
import { ADMIN_SUPPORT_ROOM_ID, setActiveChatRoom } from "@/lib/chat-active-room";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import { addChatCursor, mergeChatMessagePages, type ChatMessageCursor, type ChatMessagePageInfo } from "@/lib/chat/message-page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/shared/ChatComposer";
import { ChatDateDivider, formatChatTime, shouldShowChatDate } from "@/components/shared/ChatTimeline";
import { cn } from "@/lib/utils";
import { useAdminDirectRealtime } from "@/hooks/useAdminDirectRealtime";
import { usePageVisible } from "@/hooks/usePageVisible";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";

interface AdminDirectChatPanelProps {
  role: "student" | "teacher";
  placeholder?: string;
  locale?: string;
}

const EMPTY_PAGE: ChatMessagePageInfo = { hasMore: false, nextCursor: null };

export function AdminDirectChatPanel({
  role,
  placeholder = "메시지를 입력하세요...",
  locale = role === "teacher" ? "en-US" : "ko-KR",
}: AdminDirectChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [page, setPage] = useState<ChatMessagePageInfo>(EMPTY_PAGE);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const visible = usePageVisible();
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const prependScrollHeight = useRef<number | null>(null);
  const olderRequest = useRef<string | null>(null);
  const historyAdvanced = useRef(false);
  const readRequestInFlight = useRef(false);
  const chatReady = Boolean(threadId) && !loading;

  const { scrollRef, handleScroll, pinToBottom } = useStickToBottomScroll({
    resetKey: threadId,
    itemCount: messages.length,
    ready: chatReady,
  });

  const markRead = useCallback(async (id: string | null) => {
    if (
      !id ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      readRequestInFlight.current
    ) return;
    readRequestInFlight.current = true;
    try {
      await fetch("/api/messages/admin-direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, threadId: id }),
      });
      notifyChatInboxChanged();
    } catch {
      // Retry on next visible load.
    } finally {
      readRequestInFlight.current = false;
    }
  }, [role]);

  const loadInbox = useCallback(async (cursor: ChatMessageCursor | null = null) => {
    const requestKey = cursor?.id ?? "latest";
    if (document.visibilityState !== "visible" || olderRequest.current) return;
    olderRequest.current = requestKey;
    if (cursor) {
      prependScrollHeight.current = scrollRef.current?.scrollHeight ?? null;
      setLoadingOlder(true);
    } else {
      setLoading(true);
    }
    try {
      const currentThreadId = threadIdRef.current;
      const baseUrl = cursor && currentThreadId
        ? `/api/messages/admin-direct?role=${role}&threadId=${encodeURIComponent(currentThreadId)}`
        : `/api/messages/admin-direct?role=${role}`;
      const url = addChatCursor(baseUrl, cursor);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const id = data.thread?.id ?? currentThreadId;
      if (!cursor) setThreadId(id ?? null);
      const loaded = dedupeDirectMessages(data.messages ?? []);
      setMessages((previous) => mergeChatMessagePages(previous, loaded));
      if (cursor || !historyAdvanced.current) setPage(data.page ?? EMPTY_PAGE);
      if (cursor) historyAdvanced.current = true;
      if (!cursor && id) void markRead(id);
    } finally {
      if (olderRequest.current === requestKey) olderRequest.current = null;
      if (cursor) setLoadingOlder(false);
      else setLoading(false);
    }
  }, [role, scrollRef, markRead]);

  useLayoutEffect(() => {
    const previousHeight = prependScrollHeight.current;
    const element = scrollRef.current;
    if (previousHeight === null || !element) return;
    element.scrollTop += element.scrollHeight - previousHeight;
    prependScrollHeight.current = null;
  }, [messages.length, scrollRef]);

  useEffect(() => {
    setActiveChatRoom(ADMIN_SUPPORT_ROOM_ID);
    return () => setActiveChatRoom(null);
  }, []);
  useEffect(() => { if (visible) void loadInbox(); }, [visible, loadInbox]);

  useAdminDirectRealtime(threadId ?? undefined, (message) => {
    pinToBottom();
    setMessages((previous) => appendDirectMessage(previous, message));
    if (message.senderRole === "admin") void markRead(threadId);
  }, () => { void loadInbox(); });

  async function handleSend() {
    if (!input.trim() || sending || !threadId) return;
    setSending(true);
    pinToBottom();
    try {
      const res = await fetch("/api/messages/admin-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, threadId, body: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return;
      if (data.message) {
        setMessages((previous) => appendDirectMessage(previous, data.message as DirectMessage));
      }
      setInput("");
    } finally {
      setSending(false);
    }
  }

  function onMessageScroll() {
    handleScroll();
    const element = scrollRef.current;
    if (element && element.scrollTop < 72 && page.nextCursor && !loadingOlder) {
      void loadInbox(page.nextCursor);
    }
  }

  if (loading && !threadId) {
    return <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">Loading...</div>;
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
      <div ref={scrollRef} onScroll={onMessageScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
        {page.hasMore && (
          <div className="mb-3 text-center">
            <Button type="button" size="sm" variant="ghost" disabled={loadingOlder} onClick={() => page.nextCursor && void loadInbox(page.nextCursor)}>
              {loadingOlder ? "Loading..." : locale.startsWith("en") ? "Load earlier messages" : "이전 메시지 보기"}
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => {
              const isOwn = msg.senderRole !== "admin";
              return (
                <Fragment key={msg.id}>
                  {shouldShowChatDate(messages, index) && <ChatDateDivider value={msg.createdAt} locale={locale} />}
                  <div className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">{isOwn ? "Me" : "POE"}</AvatarFallback>
                    </Avatar>
                    <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", isOwn ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900")}>
                      {!isOwn && <p className="mb-0.5 text-xs font-medium text-gray-500">{ADMIN_SENDER_DISPLAY_NAME}</p>}
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className="mt-1 text-[10px] opacity-60">{formatChatTime(msg.createdAt, locale)}</p>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
      <ChatComposer value={input} onChange={setInput} onSubmit={handleSend} placeholder={placeholder} disabled={sending || loading} locale={locale} />
    </div>
  );
}
