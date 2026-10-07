export const CHAT_MESSAGE_PAGE_SIZE = 50;

export interface ChatMessageCursor {
  createdAt: string;
  id: string;
}

export interface ChatMessagePageInfo {
  hasMore: boolean;
  nextCursor: ChatMessageCursor | null;
}

export interface ChatMessagePage<T> {
  messages: T[];
  page: ChatMessagePageInfo;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseChatCursor(searchParams: URLSearchParams): ChatMessageCursor | null {
  const createdAt = searchParams.get("beforeCreatedAt");
  const id = searchParams.get("beforeId");
  if (!createdAt && !id) return null;
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !UUID_PATTERN.test(id)) {
    throw new Error("invalid_cursor");
  }
  return { createdAt, id };
}

export function addChatCursor(
  url: string,
  cursor: ChatMessageCursor | null
): string {
  if (!cursor) return url;
  const separator = url.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    beforeCreatedAt: cursor.createdAt,
    beforeId: cursor.id,
  });
  return `${url}${separator}${params.toString()}`;
}

export function compareChatMessages(
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string }
): number {
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
}

export function mergeChatMessagePages<T extends { id: string; createdAt: string }>(
  current: T[],
  incoming: T[]
): T[] {
  const messages = new Map<string, T>();
  current.forEach((message) => messages.set(message.id, message));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort(compareChatMessages);
}
