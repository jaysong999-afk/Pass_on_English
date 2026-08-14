"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import { formatTime } from "@/lib/utils";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";

export default function TeacherChatPage() {
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [adminThread, setAdminThread] = useState<DirectThreadPreview | null>(null);

  const load = useCallback(async () => {
    if (!teacherId) return;
    try {
      const roomsData = await fetch(`/api/chat/rooms?role=teacher`).then((r) => r.json());

      setRooms(roomsData.rooms ?? []);
      setAdminThread(roomsData.adminSupport ?? null);
    } catch {
      setRooms([]);
      setAdminThread(null);
    }
  }, [teacherId]);

  useEffect(() => {
    if (teacherId) void load();
  }, [load, teacherId]);

  useChatInboxSync(load);

  if (sessionLoading || !teacherId) {
    return <p className="py-12 text-center text-sm text-gray-500">Loading messages…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Messages</h2>
        <p className="text-sm text-gray-500">Chat with your students</p>
      </div>
      <div className="space-y-2">
        {adminThread && (
          <Link href="/teacher/chat/support">
            <Card className="hover:shadow-md transition-shadow border-blue-100 bg-blue-50/40">
              <CardContent className="flex items-center gap-4 p-4">
                <Avatar>
                  <AvatarFallback>POE</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Pass on English Support</p>
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
          <Link key={room.id} href={`/teacher/chat/${room.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <PersonAvatar
                  name={room.displayName}
                  avatarUrl={room.avatarUrl}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{room.displayName}</p>
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
