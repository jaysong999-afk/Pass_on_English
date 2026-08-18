"use client";

import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import { useChatRoom } from "@/hooks/useChatRoom";

export default function TeacherChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const room = useChatRoom({ roomId, role: "teacher", enabled: Boolean(teacherId) });

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
