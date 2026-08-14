"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatThread } from "@/components/shared/ChatThread";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import type { ChatRoom } from "@/types";

export default function StudentChatRoomPage() {
  const params = useParams();
  const t = useTranslations("studentPortal.chat");
  const roomId = params.roomId as string;
  const { account, activeLearnerId } = useActiveLearner();
  const [room, setRoom] = useState<ChatRoom | null>(null);

  useEffect(() => {
    if (!activeLearnerId) return;
    fetch(`/api/chat/rooms?role=student&studentId=${encodeURIComponent(activeLearnerId)}`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.rooms as ChatRoom[] | undefined)?.find((r) => r.id === roomId);
        if (found) setRoom(found);
      });
  }, [roomId, activeLearnerId]);

  useEffect(() => {
    fetch(`/api/chat/rooms?role=student&id=${roomId}&action=read`, { method: "PATCH" }).then(
      () => notifyChatInboxChanged()
    );
  }, [roomId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">
          {room?.displayName ?? room?.teacherName ?? t("fallbackTitle")}
        </h2>
      </div>
      <ChatThread
        roomId={roomId}
        senderRole="student"
        studentId={activeLearnerId ?? undefined}
        currentUserId={account?.id}
        placeholder={t("messagePlaceholder")}
      />
    </div>
  );
}
