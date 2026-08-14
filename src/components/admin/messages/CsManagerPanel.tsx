"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Eye,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatMonitorThread } from "@/components/admin/messages/ChatMonitorThread";
import type { QuickReplyTemplate } from "@/lib/admin/messages/types";
import {
  type DirectMessage,
  type DirectThreadPreview,
} from "@/lib/admin/messages/types";
import {
  appendDirectMessage,
  dedupeDirectMessages,
} from "@/lib/admin/messages/dedupe-messages";
import { cn, formatTime } from "@/lib/utils";
import { useStickToBottomScroll } from "@/hooks/useStickToBottomScroll";
import { useAdminDirectRealtime } from "@/hooks/useAdminDirectRealtime";
import { setActiveChatRoom } from "@/lib/chat-active-room";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import type { ChatRoom } from "@/types";

type CsTab = "monitor" | "direct";

interface NewDirectTarget {
  id: string;
  type: "student" | "teacher";
  displayName: string;
  subtitle: string;
}

function QuickRepliesBar({
  templates,
  onInsert,
  compact,
}: {
  templates: QuickReplyTemplate[];
  onInsert: (body: string) => void;
  compact?: boolean;
}) {
  const categories = [
    { key: "payment", label: "결제" },
    { key: "lesson", label: "수업" },
    { key: "tech", label: "기술" },
    { key: "policy", label: "규정" },
  ] as const;

  return (
    <div className={cn("space-y-2", compact ? "p-2" : "p-3")}>
      <p className="text-xs font-semibold text-gray-500">자주 쓰는 답변</p>
      {categories.map((cat) => (
        <div key={cat.key} className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {cat.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templates.filter((t) => t.category === cat.key).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onInsert(tpl.body)}
                className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 transition hover:bg-violet-100"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CsManagerPanel() {
  const searchParams = useSearchParams();
  const [quickReplyTemplates, setQuickReplyTemplates] = useState<QuickReplyTemplate[]>([]);
  const [csTab, setCsTab] = useState<CsTab>("monitor");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [directThreads, setDirectThreads] = useState<DirectThreadPreview[]>([]);
  const [directMessages, setDirectMessages] = useState<Record<string, DirectMessage[]>>({});
  const [selectedDirectId, setSelectedDirectId] = useState<string | null>(null);
  const [directLoading, setDirectLoading] = useState(true);
  const [directSending, setDirectSending] = useState(false);
  const [directInput, setDirectInput] = useState("");
  const [directSearch, setDirectSearch] = useState("");

  const [newDirectOpen, setNewDirectOpen] = useState(false);
  const [newDirectType, setNewDirectType] = useState<"student" | "teacher">("student");
  const [newDirectTargets, setNewDirectTargets] = useState<NewDirectTarget[]>([]);
  const [newDirectTargetId, setNewDirectTargetId] = useState("");
  const [targetsLoading, setTargetsLoading] = useState(false);

  const [toast, setToast] = useState("");

  const loadDirectThreads = useCallback(async () => {
    setDirectLoading(true);
    try {
      const res = await fetch("/api/admin/messages/direct");
      const data = await res.json();
      const threads = (data.threads ?? []) as DirectThreadPreview[];
      setDirectThreads(threads);
      if (!selectedDirectId && threads[0]) {
        setSelectedDirectId(threads[0].id);
      }
    } finally {
      setDirectLoading(false);
    }
  }, [selectedDirectId]);

  const loadDirectMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/admin/messages/direct/${threadId}`);
    const data = await res.json();
    setDirectMessages((prev) => ({
      ...prev,
      [threadId]: dedupeDirectMessages((data.messages ?? []) as DirectMessage[]),
    }));
    void fetch(`/api/admin/messages/direct/${threadId}`, { method: "PATCH" }).then(() =>
      notifyChatInboxChanged()
    );
  }, []);

  useEffect(() => {
    const threadId = searchParams.get("thread");
    if (threadId) {
      setSelectedDirectId(threadId);
      setCsTab("direct");
    }
  }, [searchParams]);

  useEffect(() => {
    if (csTab === "direct" && selectedDirectId) {
      setActiveChatRoom(selectedDirectId);
      return () => setActiveChatRoom(null);
    }
    setActiveChatRoom(null);
  }, [csTab, selectedDirectId]);

  useEffect(() => {
    void loadDirectThreads();
    void fetch("/api/admin/messages/quick-replies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setQuickReplyTemplates(data?.templates ?? []))
      .catch(() => setQuickReplyTemplates([]));
  }, [loadDirectThreads]);

  useEffect(() => {
    if (selectedDirectId) void loadDirectMessages(selectedDirectId);
  }, [selectedDirectId, loadDirectMessages]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await fetch("/api/chat/rooms?role=admin");
      const data = await res.json();
      const list = (data.rooms ?? []) as ChatRoom[];
      setRooms(list);
      if (!selectedRoomId && list[0]) setSelectedRoomId(list[0].id);
    } finally {
      setRoomsLoading(false);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.lastMessage.toLowerCase().includes(q)
    );
  }, [rooms, roomSearch]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const filteredDirect = useMemo(() => {
    const q = directSearch.trim().toLowerCase();
    if (!q) return directThreads;
    return directThreads.filter(
      (t) =>
        t.displayName.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q)
    );
  }, [directThreads, directSearch]);

  const selectedDirect = directThreads.find((t) => t.id === selectedDirectId);
  const activeDirectMessages = useMemo(() => {
    if (!selectedDirectId) return [];
    return dedupeDirectMessages(directMessages[selectedDirectId] ?? []);
  }, [selectedDirectId, directMessages]);

  const {
    scrollRef: directScrollRef,
    handleScroll: handleDirectScroll,
    pinToBottom: pinDirectToBottom,
  } = useStickToBottomScroll({
    resetKey: selectedDirectId,
    itemCount: activeDirectMessages.length,
  });

  useAdminDirectRealtime(selectedDirectId ?? undefined, (message) => {
    if (!selectedDirectId) return;
    setDirectMessages((prev) => ({
      ...prev,
      [selectedDirectId]: appendDirectMessage(prev[selectedDirectId] ?? [], message),
    }));
    if (message.senderRole !== "admin") {
      if (csTab === "direct" && message.threadId === selectedDirectId) {
        void fetch(`/api/admin/messages/direct/${selectedDirectId}`, { method: "PATCH" }).then(
          () => notifyChatInboxChanged()
        );
      } else {
        setDirectThreads((threads) =>
          threads.map((t) =>
            t.id === message.threadId
              ? {
                  ...t,
                  lastMessage: message.body,
                  lastMessageAt: message.createdAt,
                  unread: t.unread + 1,
                }
              : t
          )
        );
        notifyChatInboxChanged();
      }
    }
  });

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function insertQuickReply(body: string, mode: "append" | "replace" = "append") {
    if (csTab === "direct") {
      setDirectInput((prev) => (mode === "replace" ? body : prev ? `${prev}\n\n${body}` : body));
    }
  }

  async function loadNewDirectTargets(type: "student" | "teacher") {
    setTargetsLoading(true);
    try {
      if (type === "student") {
        const res = await fetch("/api/admin/students?tab=active");
        const data = await res.json();
        setNewDirectTargets(
          (data.students ?? []).map(
            (s: { id: string; displayName: string; legalName: string }) => ({
              id: s.id,
              type: "student" as const,
              displayName: s.displayName,
              subtitle: s.legalName,
            })
          )
        );
      } else {
        const res = await fetch("/api/admin/teachers");
        const data = await res.json();
        setNewDirectTargets(
          (data.teachers ?? []).map((t: { id: string; displayName: string }) => ({
            id: t.id,
            type: "teacher" as const,
            displayName: t.displayName,
            subtitle: "선생님",
          }))
        );
      }
    } finally {
      setTargetsLoading(false);
    }
  }

  useEffect(() => {
    if (newDirectOpen) void loadNewDirectTargets(newDirectType);
  }, [newDirectOpen, newDirectType]);

  function openNewDirectDialog() {
    setNewDirectTargetId("");
    setNewDirectOpen(true);
  }

  async function createDirectThread() {
    const target = newDirectTargets.find((t) => t.id === newDirectTargetId);
    if (!target) return;

    const existing = directThreads.find((t) => t.targetId === target.id);
    if (existing) {
      setSelectedDirectId(existing.id);
      setCsTab("direct");
      setNewDirectOpen(false);
      return;
    }

    const res = await fetch("/api/admin/messages/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: target.type,
        targetId: target.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "대화를 열 수 없습니다.");
      return;
    }

    const thread = data.thread as DirectThreadPreview;
    setDirectThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
    setDirectMessages((prev) => ({ ...prev, [thread.id]: [] }));
    setSelectedDirectId(thread.id);
    setCsTab("direct");
    setNewDirectOpen(false);
    showToast(`${target.displayName}님과 1:1 대화를 열었습니다.`);
  }

  async function sendDirectMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDirectId || !directInput.trim() || directSending) return;

    setDirectSending(true);
    pinDirectToBottom();
    try {
      const res = await fetch(`/api/admin/messages/direct/${selectedDirectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: directInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "전송에 실패했습니다.");
        return;
      }

      const msg = data.message as DirectMessage;
      setDirectMessages((prev) => ({
        ...prev,
        [selectedDirectId]: appendDirectMessage(prev[selectedDirectId] ?? [], msg),
      }));
      setDirectThreads((prev) =>
        prev.map((t) =>
          t.id === selectedDirectId
            ? {
                ...t,
                lastMessage: msg.body,
                lastMessageAt: msg.createdAt,
                unread: 0,
              }
            : t
        )
      );
      setDirectInput("");
    } finally {
      setDirectSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
          {toast}
        </div>
      )}

      <Tabs value={csTab} onValueChange={(v) => setCsTab(v as CsTab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="monitor" className="gap-1.5">
              <Eye className="h-4 w-4" />
              채팅 모니터링
            </TabsTrigger>
            <TabsTrigger value="direct" className="gap-1.5">
              <MessagesSquare className="h-4 w-4" />
              관리자 1:1
            </TabsTrigger>
          </TabsList>
          {csTab === "direct" && (
            <Button size="sm" onClick={openNewDirectDialog} className="gap-1.5">
              <MessageSquarePlus className="h-4 w-4" />
              새 1:1 대화
            </Button>
          )}
        </div>

        <TabsContent value="monitor" className="mt-4">
          <div className="grid h-[min(72vh,640px)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_240px]">
            <div className="flex flex-col overflow-hidden rounded-2xl border bg-white">
              <div className="border-b p-3">
                <p className="mb-2 text-xs font-semibold text-gray-500">학생·선생님 채팅방</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="이름·메시지 검색"
                    className="pl-9"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {roomsLoading ? (
                  <p className="p-4 text-sm text-gray-500">불러오는 중...</p>
                ) : filteredRooms.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">채팅방이 없습니다.</p>
                ) : (
                  filteredRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedRoomId(room.id)}
                      className={cn(
                        "flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-gray-50",
                        selectedRoomId === room.id && "bg-violet-50"
                      )}
                    >
                      <PersonAvatar
                        name={room.displayName}
                        avatarUrl={room.teacherAvatarUrl ?? room.avatarUrl}
                        className="h-10 w-10 shrink-0"
                        fallbackClassName="bg-gray-100 text-xs font-bold"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{room.displayName}</p>
                          <span className="shrink-0 text-[10px] text-gray-400">
                            {formatTime(room.lastMessageAt)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-gray-500">{room.lastMessage}</p>
                      </div>
                      {room.unread > 0 && (
                        <Badge className="h-5 min-w-5 shrink-0 justify-center bg-red-500 px-1 text-[10px]">
                          {room.unread}
                        </Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white">
              {selectedRoom ? (
                <>
                  <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                    <div>
                      <p className="font-semibold">{selectedRoom.displayName}</p>
                      <p className="text-xs text-gray-500">학생 ↔ 선생님 대화</p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/chat/${selectedRoom.id}`}>관리자 참여</Link>
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <ChatMonitorThread roomId={selectedRoom.id} />
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
                  채팅방을 선택하세요
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border bg-white lg:block">
              <QuickRepliesBar
                templates={quickReplyTemplates}
                onInsert={(body) => insertQuickReply(body)}
              />
              <p className="border-t px-3 py-2 text-[10px] text-gray-400">
                모니터링 탭에서는 관리자 참여 화면에서 템플릿을 사용할 수 있습니다.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="direct" className="mt-4">
          <div className="grid h-[min(72vh,640px)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_240px]">
            <div className="flex flex-col overflow-hidden rounded-2xl border bg-white">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="이름 검색"
                    className="pl-9"
                    value={directSearch}
                    onChange={(e) => setDirectSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {directLoading ? (
                  <p className="p-4 text-sm text-gray-500">불러오는 중...</p>
                ) : filteredDirect.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">1:1 대화가 없습니다.</p>
                ) : (
                filteredDirect.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedDirectId(thread.id)}
                    className={cn(
                      "flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-gray-50",
                      selectedDirectId === thread.id && "bg-violet-50"
                    )}
                  >
                    <PersonAvatar
                      name={thread.displayName}
                      avatarUrl={thread.avatarUrl}
                      className="h-10 w-10 shrink-0"
                      fallbackClassName={cn(
                        "text-xs font-bold",
                        thread.targetType === "teacher"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{thread.displayName}</p>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {formatTime(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-gray-500">{thread.subtitle}</p>
                      <p className="truncate text-xs text-gray-400">{thread.lastMessage}</p>
                    </div>
                    {thread.unread > 0 && (
                      <Badge className="bg-red-500 text-[10px]">{thread.unread}</Badge>
                    )}
                  </button>
                ))
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white">
              {selectedDirect ? (
                <>
                  <div className="shrink-0 border-b px-4 py-3">
                    <p className="font-semibold">{selectedDirect.displayName}</p>
                    <p className="text-xs text-gray-500">{selectedDirect.subtitle}</p>
                  </div>
                  <div
                    ref={directScrollRef}
                    onScroll={handleDirectScroll}
                    className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
                  >
                    {activeDirectMessages.length === 0 ? (
                      <p className="text-center text-sm text-gray-500">
                        대화를 시작해 보세요.
                      </p>
                    ) : (
                      activeDirectMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.senderRole === "admin" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                              msg.senderRole === "admin"
                                ? "rounded-br-md bg-violet-600 text-white"
                                : "rounded-bl-md border bg-gray-50"
                            )}
                          >
                            {msg.body}
                            <p className="mt-1 text-[10px] opacity-60">
                              {new Date(msg.createdAt).toLocaleTimeString("ko-KR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <form
                    onSubmit={sendDirectMessage}
                    className="flex items-end gap-2 border-t bg-gray-50/80 p-3"
                  >
                    <Textarea
                      value={directInput}
                      onChange={(e) => setDirectInput(e.target.value)}
                      placeholder="관리자 메시지 입력..."
                      rows={2}
                      className="min-h-[44px] flex-1 resize-none"
                      disabled={directSending}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-full"
                      disabled={directSending || !directInput.trim()}
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
                  <UserRound className="h-10 w-10 opacity-40" />
                  <p className="text-sm">대화를 선택하거나 새 1:1 대화를 시작하세요</p>
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border bg-white lg:block">
              <QuickRepliesBar
                templates={quickReplyTemplates}
                onInsert={(body) => insertQuickReply(body)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newDirectOpen} onOpenChange={setNewDirectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 1:1 대화</DialogTitle>
            <DialogDescription>
              학생(학부모) 또는 선생님과 관리자 직접 대화를 시작합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["student", "teacher"] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={newDirectType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setNewDirectType(type);
                    setNewDirectTargetId("");
                  }}
                >
                  {type === "student" ? "학생·학부모" : "선생님"}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>대상 선택</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm"
                value={newDirectTargetId}
                onChange={(e) => setNewDirectTargetId(e.target.value)}
                disabled={targetsLoading}
              >
                <option value="">
                  {targetsLoading ? "불러오는 중..." : "선택하세요"}
                </option>
                {newDirectTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} — {t.subtitle}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              disabled={!newDirectTargetId}
              onClick={createDirectThread}
            >
              대화 시작
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
