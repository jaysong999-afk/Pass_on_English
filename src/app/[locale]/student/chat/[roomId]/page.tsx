"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatThread } from "@/components/shared/ChatThread";
import { chatMessages } from "@/lib/mock-data";
import { getChatRoom } from "@/lib/chat-store";

export default function StudentChatRoomPage() {
  const params = useParams();
  const t = useTranslations("studentPortal.chat");
  const roomId = params.roomId as string;
  const room = getChatRoom("student", roomId);
  const messages = chatMessages[roomId] ?? chatMessages["room-1"] ?? [];

  useEffect(() => {
    fetch(`/api/chat/rooms?role=student&id=${roomId}&action=read`, { method: "PATCH" });
  }, [roomId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">
          {room?.displayName ?? room?.teacherName ?? t("fallbackTitle")}
        </h2>
      </div>
      <ChatThread messages={messages} placeholder={t("messagePlaceholder")} />
    </div>
  );
}
