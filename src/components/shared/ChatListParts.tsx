import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { formatTime } from "@/lib/utils";
import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";

export function ChatListLoading() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}

export function ChatListError({ message, retryLabel, onRetry }: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-gray-600">{message}</p>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600">
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </button>
      </CardContent>
    </Card>
  );
}

export function ChatConversationCard({ room, href, emptyMessage, locale }: {
  room: ChatRoom;
  href: string;
  emptyMessage: string;
  locale?: string;
}) {
  const preview = room.lastMessage === "(새 대화)" ? emptyMessage : room.lastMessage || emptyMessage;
  return (
    <Link href={href}>
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <PersonAvatar name={room.displayName} avatarUrl={room.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{room.displayName}</p>
              <span className="shrink-0 text-xs text-gray-400">{formatTime(room.lastMessageAt, locale ?? "en-US")}</span>
            </div>
            <p className="truncate text-sm text-gray-500">{preview}</p>
          </div>
          {room.unread > 0 && <Badge className="bg-red-500 text-white hover:bg-red-500">{room.unread}</Badge>}
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function AdminSupportChatCard({ thread, href, title, emptyMessage, locale }: {
  thread: DirectThreadPreview;
  href: string;
  title: string;
  emptyMessage: string;
  locale?: string;
}) {
  const preview = thread.lastMessage === "(새 대화)" ? emptyMessage : thread.lastMessage || emptyMessage;
  return (
    <Link href={href}>
      <Card className="border-blue-100 bg-blue-50/40 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar><AvatarFallback>POE</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{title}</p>
              <span className="shrink-0 text-xs text-gray-400">{formatTime(thread.lastMessageAt, locale ?? "en-US")}</span>
            </div>
            <p className="truncate text-sm text-gray-500">{preview}</p>
          </div>
          {thread.unread > 0 && <Badge className="bg-red-500 text-white hover:bg-red-500">{thread.unread}</Badge>}
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
        </CardContent>
      </Card>
    </Link>
  );
}
