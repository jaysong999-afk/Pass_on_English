"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatThread } from "@/components/shared/ChatThread";
import { notifyChatInboxChanged } from "@/lib/chat-inbox-events";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { useChatRoom } from "@/hooks/useChatRoom";

export default function StudentChatRoomPage() {
  const params = useParams();
  const t = useTranslations("studentPortal.chat");
  const roomId = params.roomId as string;
  const { account, activeLearnerId } = useActiveLearner();
  const onRead = useCallback(() => notifyChatInboxChanged(), []);
  const room = useChatRoom({ roomId, role: "student", enabled: Boolean(activeLearnerId), readEnabled: true, studentId: activeLearnerId ?? undefined, onRead });

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
