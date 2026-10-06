import type {
  PushCampaignRow,
  SystemNotificationRule,
} from "@/lib/admin/messages/types";

let campaigns: PushCampaignRow[] = [];
let notificationRules: SystemNotificationRule[] = [];

export function getAdminCampaignCache(): PushCampaignRow[] {
  return campaigns.map((c) => ({ ...c }));
}

export function getSystemNotificationRulesCache(): SystemNotificationRule[] {
  return notificationRules.map((r) => ({ ...r }));
}

export function setAdminMessagingCache(input: {
  campaigns: PushCampaignRow[];
  rules: SystemNotificationRule[];
}) {
  campaigns = input.campaigns.map((c) => ({ ...c }));
  notificationRules = input.rules.map((r) => ({ ...r }));
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
  campaigns = [];
  notificationRules = [];
}
