"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Headphones,
  MessageCircle,
  Search,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";
import { useChatInboxSync } from "@/hooks/useChatInboxSync";
import {
  AdminSupportChatCard,
  ChatConversationCard,
  ChatListError,
  ChatListLoading,
} from "@/components/shared/ChatListParts";

export default function TeacherChatPage() {
  const { teacherId, loading: sessionLoading } = useTeacherSession();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [adminThread, setAdminThread] = useState<DirectThreadPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!teacherId) return;
    setError(false);
    try {
      const res = await fetch("/api/chat/rooms?role=teacher");
      if (!res.ok) throw new Error("chat_rooms_load_failed");
      const data = await res.json();
      setRooms(data.rooms ?? []);
      setAdminThread(data.adminSupport ?? null);
    } catch {
      setRooms([]);
      setAdminThread(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (teacherId) void load();
  }, [load, teacherId]);

  useChatInboxSync(load);

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return rooms;
    return rooms.filter((room) =>
      (room.displayName || room.studentName || "").toLocaleLowerCase().includes(normalized)
    );
  }, [query, rooms]);

  if (sessionLoading || !teacherId) {
    return (
      <div className="py-6"><ChatListLoading /></div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Messages</h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose a student or contact the admin team.
          </p>
        </div>
        {!loading && !error && (
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1.5">
            <Users className="h-3.5 w-3.5" />
            {rooms.length} active {rooms.length === 1 ? "student" : "students"}
          </Badge>
        )}
      </div>

      {error ? (
        <ChatListError message="We couldn't load your conversations." retryLabel="Try again" onRetry={() => void load()} />
      ) : loading ? (
        <ChatListLoading />
      ) : (
        <div className="space-y-7">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-gray-700">My students</h3>
              </div>
            </div>

            {rooms.length > 4 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search students"
                  aria-label="Search students"
                  className="pl-9"
                />
              </div>
            )}

            {rooms.length === 0 ? (
              <Card className="border-dashed bg-gray-50/60">
                <CardContent className="p-7 text-center">
                  <p className="text-sm font-medium text-gray-700">No active students yet</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Students will appear here when their enrollment becomes active.
                  </p>
                </CardContent>
              </Card>
            ) : filteredRooms.length === 0 ? (
              <Card className="border-dashed bg-gray-50/60">
                <CardContent className="p-6 text-center text-sm text-gray-500">
                  No students match “{query}”.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredRooms.map((room) => (
                  <ChatConversationCard key={room.id} room={room} href={`/teacher/chat/${room.id}`} emptyMessage="Send the first message" />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-700">Admin support</h3>
            </div>
            {adminThread && <AdminSupportChatCard thread={adminThread} href="/teacher/chat/support" title="Pass on English Support" emptyMessage="Ask about schedules, students, or payments" />}
          </section>
        </div>
      )}
    </div>
  );
}
