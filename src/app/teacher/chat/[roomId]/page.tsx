"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import type { ChatRoom } from "@/types";

export default function TeacherChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const [room, setRoom] = useState<ChatRoom | null>(null);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`/api/chat/rooms?role=teacher`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.rooms as ChatRoom[] | undefined)?.find((r) => r.id === roomId);
        if (found) setRoom(found);
      });
  }, [roomId, teacherId]);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`/api/chat/rooms?role=teacher&id=${roomId}&action=read`, { method: "PATCH" });
  }, [roomId, teacherId]);

  if (sessionLoading || !teacherId) {
    return <p className="py-12 text-center text-sm text-gray-500">Loading chat…</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{room?.displayName ?? "Student Chat"}</h2>
      <ChatThread
        roomId={roomId}
        senderRole="teacher"
        teacherId={teacherId}
        currentUserId={teacherId}
        placeholder="Type a message..."
      />
    </div>
  );
}
