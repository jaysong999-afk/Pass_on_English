import type { DirectThreadPreview } from "@/lib/admin/messages/types";
import type { ChatRoom } from "@/types";

export interface ChatInboxPayload {
  rooms: ChatRoom[];
  totalUnread: number;
  adminSupport: DirectThreadPreview | null;
}

const pendingInboxRequests = new Map<string, Promise<ChatInboxPayload>>();

/** Deduplicate concurrent inbox requests from the page, header bell, and room hook. */
export function fetchChatInbox(url: string): Promise<ChatInboxPayload> {
  const existing = pendingInboxRequests.get(url);
  if (existing) return existing;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`chat_inbox_failed:${response.status}`);
      }
      const data = (await response.json()) as Partial<ChatInboxPayload>;
      return {
        rooms: data.rooms ?? [],
        totalUnread: data.totalUnread ?? 0,
        adminSupport: data.adminSupport ?? null,
      };
    })
    .finally(() => {
      pendingInboxRequests.delete(url);
    });

  pendingInboxRequests.set(url, request);
  return request;
}
