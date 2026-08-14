import type { ChatMessage, ChatRoom, UserRole } from "@/types";

let rooms: ChatRoom[] = [];
let messagesByRoom: Record<string, ChatMessage[]> = {};
let messageMetaByRoom: Record<
  string,
  { id: string; senderRole: UserRole; readAt: string | null }[]
> = {};

export function getChatRoomCache(): ChatRoom[] {
  return rooms;
}

export function getChatMessagesCache(roomId: string): ChatMessage[] {
  return messagesByRoom[roomId] ?? [];
}

export function getChatMessageMeta(roomId: string) {
  return messageMetaByRoom[roomId] ?? [];
}

export function setChatCache(
  nextRooms: ChatRoom[],
  nextMessages: Record<string, ChatMessage[]>,
  nextMeta: Record<string, { id: string; senderRole: UserRole; readAt: string | null }[]>
) {
  rooms = nextRooms.map((r) => ({ ...r }));
  messagesByRoom = Object.fromEntries(
    Object.entries(nextMessages).map(([id, msgs]) => [id, msgs.map((m) => ({ ...m }))])
  );
  messageMetaByRoom = Object.fromEntries(
    Object.entries(nextMeta).map(([id, meta]) => [id, meta.map((m) => ({ ...m }))])
  );
}

export function patchChatRoomInCache(room: ChatRoom) {
  const idx = rooms.findIndex((r) => r.id === room.id);
  if (idx >= 0) {
    rooms[idx] = { ...room };
  } else {
    rooms.push({ ...room });
  }
}

export function appendChatMessageToCache(
  roomId: string,
  message: ChatMessage,
  meta?: { senderRole: UserRole; readAt: string | null }
) {
  const list = messagesByRoom[roomId] ?? [];
  messagesByRoom[roomId] = [...list, { ...message }];
  if (meta) {
    const metaList = messageMetaByRoom[roomId] ?? [];
    messageMetaByRoom[roomId] = [
      ...metaList,
      { id: message.id, senderRole: meta.senderRole, readAt: meta.readAt },
    ];
  }
}

export function setChatMessagesForRoom(
  roomId: string,
  messages: ChatMessage[],
  meta?: { id: string; senderRole: UserRole; readAt: string | null }[]
) {
  messagesByRoom[roomId] = messages.map((m) => ({ ...m }));
  if (meta) {
    messageMetaByRoom[roomId] = meta.map((m) => ({ ...m }));
  }
}

export function clearChatCache() {
  rooms = [];
  messagesByRoom = {};
  messageMetaByRoom = {};
}
