"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { cn, formatTime } from "@/lib/utils";
import type { ChatRoom } from "@/types";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { PortalRole } from "@/lib/chat-store";
import {
  getAdminDirectThreadHref,
  getAdminSupportHref,
  getChatHref,
  getChatListHref,
} from "@/lib/chat-store";
import {
  ADMIN_SUPPORT_ROOM_ID,
  getActiveChatRoomId,
  CHAT_ACTIVE_ROOM_CHANGED,
} from "@/lib/chat-active-room";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";

export interface ChatBellCopy {
  title: string;
  viewAll: string;
  empty: string;
  unreadLabel: (count: number) => string;
}

function applyActiveAdminDirectUnread(
  threads: DirectThreadPreview[],
  totalUnread: number
) {
  const activeThreadId = getActiveChatRoomId();
  if (!activeThreadId) {
    return { threads, totalUnread };
  }

  const activeUnread = threads.find((t) => t.id === activeThreadId)?.unread ?? 0;
  return {
    threads: threads.map((t) =>
      t.id === activeThreadId ? { ...t, unread: 0 } : t
    ),
    totalUnread: Math.max(0, totalUnread - activeUnread),
  };
}

function applyActiveRoomUnread(
  rooms: ChatRoom[],
  totalUnread: number,
  adminSupport: DirectThreadPreview | null
) {
  const activeRoomId = getActiveChatRoomId();
  if (!activeRoomId) {
    return { rooms, totalUnread, adminSupport };
  }

  if (activeRoomId === ADMIN_SUPPORT_ROOM_ID && adminSupport?.unread) {
    return {
      rooms,
      adminSupport: adminSupport ? { ...adminSupport, unread: 0 } : null,
      totalUnread: Math.max(0, totalUnread - adminSupport.unread),
    };
  }

  const activeUnread = rooms.find((r) => r.id === activeRoomId)?.unread ?? 0;
  return {
    rooms: rooms.map((r) => (r.id === activeRoomId ? { ...r, unread: 0 } : r)),
    adminSupport,
    totalUnread: Math.max(0, totalUnread - activeUnread),
  };
}

export function ChatNotificationBell({
  role,
  locale = defaultLocale,
  copy,
  variant = "onDark",
  studentId,
  teacherId,
  enabled = true,
  enableInboxSync = true,
}: {
  role: PortalRole;
  locale?: Locale;
  copy: ChatBellCopy;
  /** onDark: colored header (teacher/admin legacy). onLight: white header (admin desktop shell). */
  variant?: "onDark" | "onLight";
  /** Required for student role once account session is loaded. */
  studentId?: string;
  /** Optional — teacher inbox uses session when omitted. */
  teacherId?: string;
  /** Disable fetches until student session is ready. */
  enabled?: boolean;
  /** Set false on duplicate bells (e.g. mobile header) to avoid double realtime subs. */
  enableInboxSync?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [adminDirectThreads, setAdminDirectThreads] = useState<DirectThreadPreview[]>([]);
  const [adminSupport, setAdminSupport] = useState<DirectThreadPreview | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const canFetch =
    enabled &&
    (role === "admin" ||
      (role === "teacher" && Boolean(teacherId)) ||
      (role === "student" && Boolean(studentId)));

  const load = useCallback(async () => {
    if (!canFetch) return;
    try {
      if (role === "admin") {
        const res = await fetch("/api/admin/messages/direct");
        if (!res.ok) {
          setAdminDirectThreads([]);
          setTotalUnread(0);
          return;
        }
        const data = (await res.json()) as {
          threads?: DirectThreadPreview[];
          totalUnread?: number;
        };
        const next = applyActiveAdminDirectUnread(
          data.threads ?? [],
          data.totalUnread ?? 0
        );
        setAdminDirectThreads(next.threads);
        setRooms([]);
        setAdminSupport(null);
        setTotalUnread(next.totalUnread);
        return;
      }

      let url = `/api/chat/rooms?role=${role}`;
      if (role === "student" && studentId) {
        url += `&studentId=${encodeURIComponent(studentId)}`;
      }

      const roomsRes = await fetch(url);

      if (!roomsRes.ok) {
        setRooms([]);
        setAdminSupport(null);
        setTotalUnread(0);
        return;
      }

      const text = await roomsRes.text();
      if (!text) {
        setRooms([]);
        setAdminSupport(null);
        setTotalUnread(0);
        return;
      }

      const data = JSON.parse(text) as {
        rooms?: ChatRoom[];
        totalUnread?: number;
        adminSupport?: DirectThreadPreview | null;
      };

      const next = applyActiveRoomUnread(
        data.rooms ?? [],
        data.totalUnread ?? 0,
        data.adminSupport ?? null
      );

      setRooms(next.rooms);
      setAdminSupport(next.adminSupport);
      setTotalUnread(next.totalUnread);
    } catch {
      setRooms([]);
      setAdminDirectThreads([]);
      setAdminSupport(null);
      setTotalUnread(0);
    }
  }, [canFetch, role, studentId, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  useChatInboxSync(load, canFetch && enableInboxSync);

  useEffect(() => {
    const onActiveRoomChanged = () => void load();
    window.addEventListener(CHAT_ACTIVE_ROOM_CHANGED, onActiveRoomChanged);
    return () => window.removeEventListener(CHAT_ACTIVE_ROOM_CHANGED, onActiveRoomChanged);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const openAdminDirectThread = async (thread: DirectThreadPreview) => {
    if (thread.unread > 0) {
      await fetch(`/api/admin/messages/direct/${thread.id}`, { method: "PATCH" });
      setTotalUnread((n) => Math.max(0, n - thread.unread));
      setAdminDirectThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, unread: 0 } : t))
      );
    }
    setOpen(false);
    router.push(getAdminDirectThreadHref(thread.id));
  };

  const openRoom = async (room: ChatRoom) => {
    if (room.unread > 0) {
      await fetch(`/api/chat/rooms?role=${role}&id=${room.id}&action=read`, {
        method: "PATCH",
      });
      setTotalUnread((n) => Math.max(0, n - room.unread));
      setRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r))
      );
    }
    setOpen(false);
    router.push(getChatHref(role, room.id, locale));
  };

  const openAdminSupport = async () => {
    if (adminSupport?.unread) {
      await fetch("/api/messages/admin-direct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, threadId: adminSupport.id }),
      });
      setTotalUnread((n) => Math.max(0, n - adminSupport.unread));
      setAdminSupport((prev) => (prev ? { ...prev, unread: 0 } : null));
    }
    setOpen(false);
    router.push(getAdminSupportHref(role, locale));
  };

  const hasEntries =
    role === "admin"
      ? adminDirectThreads.length > 0
      : rooms.length > 0 || Boolean(adminSupport);

  const badgeText = totalUnread > 99 ? "99+" : String(totalUnread);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={copy.title}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          variant === "onLight"
            ? "border border-gray-200 bg-gray-50 hover:bg-gray-100"
            : "bg-white/15 hover:bg-white/25"
        )}
      >
        <MessageCircle
          className={cn(
            "h-5 w-5",
            variant === "onLight" ? "text-violet-600" : "text-white"
          )}
          strokeWidth={2}
        />
        {totalUnread > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white",
              variant === "onLight" ? "ring-2 ring-white" : "ring-2 ring-white/30"
            )}
            aria-live="polite"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-[100] mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-bold text-ink">{copy.title}</p>
            {totalUnread > 0 && (
              <span className="text-xs font-semibold text-red-500">
                {copy.unreadLabel(totalUnread)}
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!hasEntries ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">{copy.empty}</p>
            ) : (
              <ul>
                {role === "admin"
                  ? adminDirectThreads.map((thread) => (
                      <li key={thread.id}>
                        <button
                          type="button"
                          onClick={() => void openAdminDirectThread(thread)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/60",
                            thread.unread > 0 && "bg-brand-50/40"
                          )}
                        >
                          <PersonAvatar
                            name={thread.displayName}
                            avatarUrl={thread.avatarUrl}
                            className="h-11 w-11 shrink-0"
                            fallbackClassName={cn(
                              "text-sm font-bold",
                              thread.targetType === "teacher"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  "truncate text-sm",
                                  thread.unread > 0 ? "font-bold text-ink" : "font-semibold text-ink"
                                )}
                              >
                                {thread.displayName}
                              </p>
                              <span className="shrink-0 text-[11px] text-ink-muted">
                                {formatTime(thread.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-ink-muted">
                              {thread.subtitle}
                            </p>
                            <p className="truncate text-xs text-ink-muted">{thread.lastMessage}</p>
                          </div>
                          {thread.unread > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                              {thread.unread > 9 ? "9+" : thread.unread}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  : null}
                {role !== "admin" && adminSupport && (
                  <li>
                    <button
                      type="button"
                      onClick={() => void openAdminSupport()}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/60",
                        adminSupport.unread > 0 && "bg-brand-50/40"
                      )}
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className="bg-violet-100 text-violet-800 text-sm font-bold">
                          POE
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-sm",
                              adminSupport.unread > 0
                                ? "font-bold text-ink"
                                : "font-semibold text-ink"
                            )}
                          >
                            {adminSupport.displayName}
                          </p>
                          <span className="shrink-0 text-[11px] text-ink-muted">
                            {formatTime(adminSupport.lastMessageAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {adminSupport.lastMessage}
                        </p>
                      </div>
                      {adminSupport.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {adminSupport.unread > 9 ? "9+" : adminSupport.unread}
                        </span>
                      )}
                    </button>
                  </li>
                )}
                {role !== "admin" &&
                  rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => openRoom(room)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/60",
                        room.unread > 0 && "bg-brand-50/40"
                      )}
                    >
                      <PersonAvatar
                        name={room.displayName}
                        avatarUrl={room.avatarUrl}
                        className="h-11 w-11 shrink-0"
                        fallbackClassName="bg-brand-100 text-brand-800 text-sm font-bold"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-sm",
                              room.unread > 0 ? "font-bold text-ink" : "font-semibold text-ink"
                            )}
                          >
                            {room.displayName}
                          </p>
                          <span className="shrink-0 text-[11px] text-ink-muted">
                            {formatTime(room.lastMessageAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{room.lastMessage}</p>
                      </div>
                      {room.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {room.unread > 9 ? "9+" : room.unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t p-2">
            <Link
              href={getChatListHref(role, locale)}
              onClick={() => setOpen(false)}
              className="block rounded-xl py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              {copy.viewAll}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
