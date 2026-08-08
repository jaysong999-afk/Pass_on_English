"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatTime } from "@/lib/utils";
import type { ChatRoom } from "@/types";
import type { PortalRole } from "@/lib/chat-store";
import { getChatHref, getChatListHref } from "@/lib/chat-store";
import { defaultLocale, type Locale } from "@/lib/i18n/config";

export interface ChatBellCopy {
  title: string;
  viewAll: string;
  empty: string;
  unreadLabel: (count: number) => string;
}

function initials(name: string) {
  return name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ChatNotificationBell({
  role,
  locale = defaultLocale,
  copy,
  variant = "onDark",
}: {
  role: PortalRole;
  locale?: Locale;
  copy: ChatBellCopy;
  /** onDark: colored header (teacher/admin legacy). onLight: white header (admin desktop shell). */
  variant?: "onDark" | "onLight";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/rooms?role=${role}`);
    const data = await res.json();
    setRooms(data.rooms ?? []);
    setTotalUnread(data.totalUnread ?? 0);
  }, [role]);

  useEffect(() => {
    load();
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
          if (!open) load();
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
            {rooms.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">{copy.empty}</p>
            ) : (
              <ul>
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => openRoom(room)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/60",
                        room.unread > 0 && "bg-brand-50/40"
                      )}
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className="bg-brand-100 text-brand-800 text-sm font-bold">
                          {initials(room.displayName)}
                        </AvatarFallback>
                      </Avatar>
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
