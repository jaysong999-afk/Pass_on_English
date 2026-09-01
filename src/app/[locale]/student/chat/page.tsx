"use client";

import { useCallback, useEffect, useState } from "react";
import { Headphones, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { getChatHref } from "@/lib/chat-store";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { fetchChatInbox } from "@/lib/chat-inbox-client";
import {
  AdminSupportChatCard,
  ChatConversationCard,
  ChatListError,
  ChatListLoading,
} from "@/components/shared/ChatListParts";

export default function StudentChatListPage() {
  const locale = useLocale();
  const t = useTranslations("studentPortal.chat");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [adminThread, setAdminThread] = useState<DirectThreadPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { activeLearnerId, loading: accountLoading } = useActiveLearner();

  const load = useCallback(async () => {
    if (accountLoading) return;
    setError(false);
    try {
      const qs = activeLearnerId
        ? `?role=student&studentId=${encodeURIComponent(activeLearnerId)}`
        : "?role=student";
      const roomsData = await fetchChatInbox(`/api/chat/rooms${qs}`);
      setRooms(roomsData.rooms ?? []);
      setAdminThread(roomsData.adminSupport ?? null);
    } catch {
      setRooms([]);
      setAdminThread(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accountLoading, activeLearnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useChatInboxSync(load);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t("title")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
      </div>
      {error ? (
        <ChatListError message={t("loadError")} retryLabel={t("retry")} onRetry={() => void load()} />
      ) : loading ? (
        <ChatListLoading />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-700">{t("teachersSection")}</h3>
            </div>
            {rooms.length === 0 ? (
              <Card className="border-dashed bg-gray-50/60">
                <CardContent className="p-6 text-center">
                  <p className="text-sm font-medium text-gray-700">{t("noActiveTeacher")}</p>
                  <p className="mt-1 text-xs text-gray-500">{t("noActiveTeacherHint")}</p>
                </CardContent>
              </Card>
            ) : rooms.map((room) => (
              <ChatConversationCard key={room.id} room={room} href={getChatHref("student", room.id, locale)} emptyMessage={t("startTeacherChat")} locale={locale} />
            ))}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-700">{t("supportSection")}</h3>
            </div>
            {adminThread && <AdminSupportChatCard thread={adminThread} href={`/${locale}/student/chat/support`} title={t("adminSupportCard")} emptyMessage={t("adminSupportHint")} locale={locale} />}
          </section>
        </div>
      )}
    </div>
  );
}
