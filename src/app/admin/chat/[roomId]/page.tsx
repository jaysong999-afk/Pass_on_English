"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import type { ChatRoom } from "@/types";

export default function AdminChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [room, setRoom] = useState<ChatRoom | null>(null);

  useEffect(() => {
    fetch("/api/chat/rooms?role=admin")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.rooms as ChatRoom[] | undefined)?.find((r) => r.id === roomId);
        if (found) setRoom(found);
      });
  }, [roomId]);

  useEffect(() => {
    fetch(`/api/chat/rooms?role=admin&id=${roomId}&action=read`, { method: "PATCH" });
  }, [roomId]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{room?.displayName ?? "메시지"}</h2>
      <ChatThread roomId={roomId} senderRole="admin" placeholder="답장 입력..." />
    </div>
  );
}
