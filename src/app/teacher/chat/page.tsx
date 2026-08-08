"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChatRoom } from "@/types";

export default function TeacherChatPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  useEffect(() => {
    fetch("/api/chat/rooms?role=teacher")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Messages</h2>
        <p className="text-sm text-gray-500">Chat with your students</p>
      </div>
      <div className="space-y-2">
        {rooms.map((room) => (
          <Link key={room.id} href={`/teacher/chat/${room.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <Avatar>
                  <AvatarFallback>{room.displayName.slice(0, 2)}</AvatarFallback>
                </Avatar>
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
