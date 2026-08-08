"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import { chatMessages } from "@/lib/mock-data";
import { getChatRoom } from "@/lib/chat-store";

export default function TeacherChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const room = getChatRoom("teacher", roomId);
  const messages = chatMessages[roomId] ?? [];

  useEffect(() => {
    fetch(`/api/chat/rooms?role=teacher&id=${roomId}&action=read`, { method: "PATCH" });
  }, [roomId]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{room?.displayName ?? "Student Chat"}</h2>
      <ChatThread
        messages={messages}
        currentUserId="teacher-1"
        placeholder="Type a message..."
      />
    </div>
  );
}
