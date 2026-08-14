"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getChatHref } from "@/lib/chat-store";
import { formatTime } from "@/lib/utils";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";

export default function StudentChatListPage() {
  const locale = useLocale();
  const t = useTranslations("studentPortal.chat");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [adminThread, setAdminThread] = useState<DirectThreadPreview | null>(null);

  const load = useCallback(async () => {
    try {
      const profileRes = await fetch("/api/student/profile");
      const profile = await profileRes.json();
      const learnerId = profile.activeLearnerId as string | undefined;
      const qs = learnerId
        ? `?role=student&studentId=${encodeURIComponent(learnerId)}`
        : "?role=student";

      const roomsData = await fetch(`/api/chat/rooms${qs}`).then((r) => r.json());
      setRooms(roomsData.rooms ?? []);
      setAdminThread(roomsData.adminSupport ?? null);
    } catch {
      setRooms([]);
      setAdminThread(null);
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
      <div className="space-y-2">
        {adminThread && (
          <Link href={`/${locale}/student/chat/support`}>
            <Card className="hover:shadow-md transition-shadow border-blue-100 bg-blue-50/40">
              <CardContent className="flex items-center gap-4 p-4">
                <Avatar>
                  <AvatarFallback>POE</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{t("adminSupportCard")}</p>
                    <span className="text-xs text-gray-400">
                      {formatTime(adminThread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{adminThread.lastMessage}</p>
                </div>
                {adminThread.unread > 0 && (
                  <Badge className="bg-red-500 text-white hover:bg-red-500">
                    {adminThread.unread}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        )}
        {rooms.map((room) => (
          <Link key={room.id} href={getChatHref("student", room.id, locale)}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <PersonAvatar
                  name={room.displayName}
                  avatarUrl={room.avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{room.displayName}</p>
                    <span className="text-xs text-gray-400">{formatTime(room.lastMessageAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{room.lastMessage}</p>
                </div>
                {room.unread > 0 && (
                  <Badge className="bg-red-500 text-white hover:bg-red-500">{room.unread}</Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
