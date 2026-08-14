import type { ChatMessage, ChatRoom } from "@/types";
import type { ChatListContext, PortalRole } from "@/lib/chat/repository";
import {
  getChatMessagesFromCache,
  getChatRoomFromCache,
  getChatRoomsFromCache,
  getTotalUnreadFromCache,
} from "@/lib/chat/repository";
import { clearChatCache } from "@/lib/chat/chat-cache";

export type { PortalRole, ChatListContext };

export function getChatRooms(context: ChatListContext): ChatRoom[] {
  return getChatRoomsFromCache(context);
}

export function getChatRoom(context: ChatListContext, id: string): ChatRoom | undefined {
  return getChatRoomFromCache(id, context);
}

export function getTotalUnread(context: ChatListContext): number {
  return getTotalUnreadFromCache(context);
}

export function getChatMessages(roomId: string): ChatMessage[] {
  return getChatMessagesFromCache(roomId);
}

/** @internal */
export function resetChatStore() {
  clearChatCache();
}
