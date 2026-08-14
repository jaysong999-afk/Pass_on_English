import type {
  DirectMessage,
  DirectThreadPreview,
  PushCampaignRow,
  SystemNotificationRule,
} from "@/lib/admin/messages/types";

let directThreads: DirectThreadPreview[] = [];
let directMessagesByThread: Record<string, DirectMessage[]> = {};
let campaigns: PushCampaignRow[] = [];
let notificationRules: SystemNotificationRule[] = [];

export function getAdminDirectThreadCache(): DirectThreadPreview[] {
  return directThreads.map((t) => ({ ...t }));
}

export function getAdminDirectMessagesCache(threadId: string): DirectMessage[] {
  return (directMessagesByThread[threadId] ?? []).map((m) => ({ ...m }));
}

export function getAdminCampaignCache(): PushCampaignRow[] {
  return campaigns.map((c) => ({ ...c }));
}

export function getSystemNotificationRulesCache(): SystemNotificationRule[] {
  return notificationRules.map((r) => ({ ...r }));
}

export function setAdminMessagingCache(input: {
  threads: DirectThreadPreview[];
  messagesByThread: Record<string, DirectMessage[]>;
  campaigns: PushCampaignRow[];
  rules: SystemNotificationRule[];
}) {
  directThreads = input.threads.map((t) => ({ ...t }));
  directMessagesByThread = Object.fromEntries(
    Object.entries(input.messagesByThread).map(([id, msgs]) => [
      id,
      msgs.map((m) => ({ ...m })),
    ])
  );
  campaigns = input.campaigns.map((c) => ({ ...c }));
  notificationRules = input.rules.map((r) => ({ ...r }));
}

export function patchAdminDirectThreadInCache(thread: DirectThreadPreview) {
  const idx = directThreads.findIndex((t) => t.id === thread.id);
  if (idx >= 0) {
    directThreads[idx] = { ...thread };
  } else {
    directThreads.unshift({ ...thread });
  }
  directThreads.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function appendAdminDirectMessageToCache(message: DirectMessage) {
  const list = directMessagesByThread[message.threadId] ?? [];
  directMessagesByThread[message.threadId] = [...list, { ...message }];
}

export function prependAdminCampaignToCache(campaign: PushCampaignRow) {
  campaigns = [{ ...campaign }, ...campaigns];
}

export function patchAdminCampaignInCache(campaign: PushCampaignRow) {
  const idx = campaigns.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) {
    campaigns[idx] = { ...campaign };
  } else {
    campaigns.unshift({ ...campaign });
  }
}

export function patchSystemNotificationRulesInCache(rules: SystemNotificationRule[]) {
  notificationRules = rules.map((r) => ({ ...r }));
}

export function clearAdminMessagingCache() {
  directThreads = [];
  directMessagesByThread = {};
  campaigns = [];
  notificationRules = [];
}
