"use client";

import { useParams } from "next/navigation";
import { ChatThread } from "@/components/shared/ChatThread";
import { useChatRoom } from "@/hooks/useChatRoom";

export default function AdminChatRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const room = useChatRoom({ roomId, role: "admin" });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{room?.displayName ?? "메시지"}</h2>
      <ChatThread roomId={roomId} senderRole="admin" placeholder="답장 입력..." />
    </div>
  );
}
