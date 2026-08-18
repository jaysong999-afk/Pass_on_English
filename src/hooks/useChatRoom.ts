"use client";

import { useEffect, useState } from "react";
import type { ChatRoom, UserRole } from "@/types";

interface UseChatRoomOptions {
  roomId: string;
  role: Extract<UserRole, "student" | "teacher" | "admin">;
  enabled?: boolean;
  readEnabled?: boolean;
  studentId?: string;
  onRead?: () => void;
}

export function useChatRoom({ roomId, role, enabled = true, readEnabled = enabled, studentId, onRead }: UseChatRoomOptions) {
  const [room, setRoom] = useState<ChatRoom | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams({ role });
    if (studentId) params.set("studentId", studentId);
    let cancelled = false;

    fetch(`/api/chat/rooms?${params}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const found = (data.rooms as ChatRoom[] | undefined)?.find((item) => item.id === roomId);
        if (found) setRoom(found);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, role, roomId, studentId]);

  useEffect(() => {
    if (!readEnabled) return;
    const params = new URLSearchParams({ role, id: roomId, action: "read" });
    void fetch(`/api/chat/rooms?${params}`, { method: "PATCH" }).then(() => onRead?.());
  }, [onRead, readEnabled, role, roomId]);

  return room;
}
