/** Tracks which chat room the user is currently viewing (exclude from unread badges). */
export const CHAT_ACTIVE_ROOM_CHANGED = "chat-active-room-changed";

/** Virtual id for admin CS 1:1 thread (excluded from header badge while viewing). */
export const ADMIN_SUPPORT_ROOM_ID = "__admin_support__";

let activeRoomId: string | null = null;

export function setActiveChatRoom(roomId: string | null) {
  activeRoomId = roomId;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_ACTIVE_ROOM_CHANGED));
}

export function getActiveChatRoomId(): string | null {
  return activeRoomId;
}
