"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChatRoom, UserRole } from "@/types";
import { fetchChatInbox } from "@/lib/chat-inbox-client";

interface UseChatRoomOptions {
  roomId: string;
  role: Extract<UserRole, "student" | "teacher" | "admin">;
  enabled?: boolean;
  studentId?: string;
}

export function useChatRoom({ roomId, role, enabled = true, studentId }: UseChatRoomOptions) {
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    setRoom(null);
    const params = new URLSearchParams({ role });
    if (studentId) params.set("studentId", studentId);
    let cancelled = false;

    fetchChatInbox(`/api/chat/rooms?${params}`)
      .then(async (data) => {
        if (cancelled) return;
        const found = (data.rooms as ChatRoom[] | undefined)?.find((item) => item.id === roomId);
        if (found) {
          setRoom(found);
          return;
        }

        // Only historical duplicate ids take this fallback path. Normal inbox
        // navigation has no additional request or alias-table lookup.
        const resolveParams = new URLSearchParams({ role, resolveId: roomId });
        const response = await fetch(`/api/chat/rooms?${resolveParams}`);
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { roomId?: string };
        if (!payload.roomId || payload.roomId === roomId || cancelled) return;
        router.replace(pathname.replace(/[^/]+$/, payload.roomId));
      })
      .catch(() => {
        // The destination page keeps its existing not-found/loading treatment.
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, pathname, role, roomId, router, studentId]);

  return room;
}
