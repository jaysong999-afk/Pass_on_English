"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChatThread } from "@/components/shared/ChatThread";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { useChatRoom } from "@/hooks/useChatRoom";

export default function StudentChatRoomPage() {
  const params = useParams();
  const t = useTranslations("studentPortal.chat");
  const locale = useLocale();
  const roomId = params.roomId as string;
  const { account, activeLearnerId } = useActiveLearner();
  const room = useChatRoom({ roomId, role: "student", enabled: Boolean(activeLearnerId), studentId: activeLearnerId ?? undefined });

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
        locale={locale}
        closedAt={room?.closedAt}
        closedMessage={locale === "zh-CN"
          ? "课程已结束。您仍可查看之前的消息，如需帮助请联系管理员客服。"
          : "수강이 종료되어 이전 대화만 확인할 수 있습니다. 도움이 필요하면 관리자 상담 채팅을 이용해 주세요."}
      />
    </div>
  );
}
