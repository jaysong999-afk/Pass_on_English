export interface QuickReplyTemplate {
  id: string;
  label: string;
  category: "payment" | "lesson" | "tech" | "policy";
  body: string;
}

export interface DirectThreadPreview {
  id: string;
  targetType: "student" | "teacher";
  targetId: string;
  displayName: string;
  subtitle: string;
  avatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export interface DirectMessage {
  id: string;
  threadId: string;
  senderRole: "admin" | "student" | "teacher";
  body: string;
  createdAt: string;
}

export interface PushCampaignRow {
  id: string;
  title: string;
  segment: string;
  sentAt: string;
  recipients: number;
  delivered: number;
  failed: number;
  clicked: number;
  channel: "push" | "push_chat";
}

export interface SystemNotificationRule {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  channels: ("push" | "in_app")[];
}

export type BroadcastAudience =
  | "all"
  | "students_all"
  | "students_kr"
  | "students_cn"
  | "teachers";

export type BroadcastEnrollmentFilter =
  | "active"
  | "expiring_soon"
  | "pending_payment"
  | "pending_registration"
  | "completed";

export type BroadcastChannel = "push_chat" | "push_only" | "chat_only";

export const BROADCAST_AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  all: "전체",
  students_all: "학생 전체",
  students_kr: "학생 · 한국",
  students_cn: "학생 · 중국",
  teachers: "선생님 전체",
};

export const BROADCAST_FILTER_LABELS: Record<BroadcastEnrollmentFilter, string> = {
  active: "수강 중",
  expiring_soon: "만료 임박",
  pending_payment: "결제 대기",
  pending_registration: "신규 가입 대기",
  completed: "수강 완료",
};

export interface PushCampaignTotals {
  sent: number;
  delivered: number;
  failed: number;
  clicked: number;
  deliveryRate: number;
  ctr: number;
}
