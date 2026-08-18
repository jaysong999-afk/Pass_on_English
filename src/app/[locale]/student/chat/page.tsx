"use client";

import { useCallback, useEffect, useState } from "react";
import { Headphones, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { getChatHref } from "@/lib/chat-store";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";
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

  const load = useCallback(async () => {
    setError(false);
    try {
      const profileRes = await fetch("/api/student/profile");
      if (!profileRes.ok) throw new Error("profile_load_failed");
      const profile = await profileRes.json();
      const learnerId = profile.activeLearnerId as string | undefined;
      const qs = learnerId
        ? `?role=student&studentId=${encodeURIComponent(learnerId)}`
        : "?role=student";

      const roomsRes = await fetch(`/api/chat/rooms${qs}`);
      if (!roomsRes.ok) throw new Error("chat_rooms_load_failed");
      const roomsData = await roomsRes.json();
      setRooms(roomsData.rooms ?? []);
      setAdminThread(roomsData.adminSupport ?? null);
    } catch {
      setRooms([]);
      setAdminThread(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
