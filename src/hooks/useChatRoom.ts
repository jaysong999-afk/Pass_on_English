"use client";

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

  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams({ role });
    if (studentId) params.set("studentId", studentId);
    let cancelled = false;

    fetchChatInbox(`/api/chat/rooms?${params}`)
      .then((data) => {
        if (cancelled) return;
        const found = (data.rooms as ChatRoom[] | undefined)?.find((item) => item.id === roomId);
        if (found) setRoom(found);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, role, roomId, studentId]);

  return room;
}
