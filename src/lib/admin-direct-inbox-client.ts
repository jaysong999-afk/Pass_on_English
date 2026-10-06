import type { DirectThreadPreview } from "@/lib/admin/messages/types";

export interface AdminDirectInboxPayload {
  threads: DirectThreadPreview[];
  totalUnread: number;
}

const pendingRequests = new Map<string, Promise<AdminDirectInboxPayload>>();

/** Share one in-flight admin inbox request between the header and CS center. */
export function fetchAdminDirectInbox(
  url = "/api/admin/messages/direct"
): Promise<AdminDirectInboxPayload> {
  const existing = pendingRequests.get(url);
  if (existing) return existing;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`admin_direct_inbox_failed:${response.status}`);
      }
      const data = (await response.json()) as Partial<AdminDirectInboxPayload>;
      return {
        threads: data.threads ?? [],
        totalUnread: data.totalUnread ?? 0,
      };
    })
    .finally(() => {
      pendingRequests.delete(url);
    });

  pendingRequests.set(url, request);
  return request;
}
