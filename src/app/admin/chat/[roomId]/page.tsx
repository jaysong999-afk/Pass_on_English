"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import { getChatRoom } from "@/lib/chat-store";
import type { ChatMessage } from "@/types";

const adminMessages: Record<string, ChatMessage[]> = {
  "room-a1": [
    {
      id: "am1",
      senderId: "student-1",
      senderName: "김민준",
      senderRole: "student",
      body: "안녕하세요, 오늘 입금했습니다. 확인 부탁드립니다.",
      createdAt: "2026-07-31T11:00:00",
    },
    {
      id: "am2",
      senderId: "student-1",
      senderName: "김민준",
      senderRole: "student",
      body: "입금 확인 부탁드립니다.",
      createdAt: "2026-07-31T11:20:00",
    },
  ],
  "room-a2": [
    {
      id: "am3",
      senderId: "teacher-1",
      senderName: "Sarah Mitchell",
      senderRole: "teacher",
      body: "July payroll report submitted.",
      createdAt: "2026-07-30T09:00:00",
    },
  ],
};

export default function AdminChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const room = getChatRoom("admin", roomId);
  const messages = adminMessages[roomId] ?? [];

  useEffect(() => {
    fetch(`/api/chat/rooms?role=admin&id=${roomId}&action=read`, { method: "PATCH" });
  }, [roomId]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{room?.displayName ?? "메시지"}</h2>
      <ChatThread messages={messages} placeholder="답장 입력..." />
    </div>
  );
}
