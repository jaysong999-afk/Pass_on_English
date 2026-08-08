"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getChatHref } from "@/lib/chat-store";
import { formatTime } from "@/lib/utils";
import type { ChatRoom } from "@/types";
import { useState } from "react";

export default function StudentChatListPage() {
  const locale = useLocale();
  const t = useTranslations("studentPortal.chat");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  useEffect(() => {
    fetch("/api/chat/rooms?role=student")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t("title")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
      </div>
      <div className="space-y-2">
        {rooms.map((room) => (
          <Link key={room.id} href={getChatHref("student", room.id, locale)}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <Avatar>
                  <AvatarFallback>{room.displayName.slice(0, 2)}</AvatarFallback>
                </Avatar>
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
