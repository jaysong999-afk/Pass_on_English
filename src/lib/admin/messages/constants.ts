import type { QuickReplyTemplate, SystemNotificationRule } from "@/lib/admin/messages/types";

export const QUICK_REPLY_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: "bank-transfer",
    label: "계좌이체 안내",
    category: "payment",
    body:
      "안녕하세요, Pass on English입니다.\n\n입금 계좌: ○○은행 123-456-789012 (예금주: Pass on English)\n입금 후 학생 이름과 입금자명을 채팅으로 알려주시면 확인 후 수업이 활성화됩니다.\n\n감사합니다.",
  },
  {
    id: "makeup-policy",
    label: "보강 규정",
    category: "policy",
    body:
      "보강 수업 안내드립니다.\n\n· 선생님/시스템 사유: 무료 보강\n· 학생 사유: 월 1회 무료, 이후 유료 또는 세션 차감\n· 보강은 원 수업일로부터 30일 이내 예약 가능합니다.\n\n추가 문의 환영합니다.",
  },
  {
    id: "zoom-help",
    label: "Zoom 접속",
    category: "tech",
    body:
      "Zoom 수업 접속 방법입니다.\n\n1. 수업 5분 전 Zoom 앱 실행\n2. 선생님이 보낸 링크 클릭\n3. 마이크·카메라 허용\n\n접속이 안 되면 앱 재시작 후 다시 시도해 주세요. 계속 문제가 있으면 스크린샷과 함께 알려주세요.",
  },
  {
    id: "lesson-reminder",
    label: "수업 리마인더",
    category: "lesson",
    body:
      "내일 수업 리마인더입니다.\n\n일정: [날짜] [시간] (한국 시간)\n선생님: [이름]\n\nZoom 링크는 수업 직전 채팅 또는 포털에서 확인하실 수 있습니다. 좋은 수업 되세요!",
  },
  {
    id: "payment-confirmed",
    label: "입금 확인 완료",
    category: "payment",
    body:
      "입금 확인이 완료되었습니다.\n\n수업 일정이 활성화되었으며, 포털에서 예정 수업을 확인하실 수 있습니다.\n\n궁금한 점이 있으시면 언제든 메시지 주세요.",
  },
];

export const FALLBACK_SYSTEM_NOTIFICATION_RULES: SystemNotificationRule[] = [
  {
    id: "lesson-reminder-10m",
    label: "수업 10분 전 리마인더",
    description: "예정 수업 10분 전 학생·선생님에게 Push + 앱 알림",
    enabled: true,
    channels: ["push", "in_app"],
  },
  {
    id: "payment-confirmed",
    label: "입금 확인 완료",
    description: "관리자 입금 확인 후 학부모에게 활성화 안내",
    enabled: true,
    channels: ["push", "in_app"],
  },
  {
    id: "reschedule-request",
    label: "보강/일정 변경 요청",
    description: "학생·선생님 일정 변경 요청 시 상대방 및 관리자 알림",
    enabled: true,
    channels: ["push", "in_app"],
  },
  {
    id: "reschedule-approved",
    label: "보강/일정 변경 승인",
    description: "승인 완료 시 요청자에게 결과 알림",
    enabled: true,
    channels: ["in_app"],
  },
  {
    id: "chat-unread-digest",
    label: "미확인 채팅 요약 (1일 1회)",
    description: "24시간 미확인 채팅이 있을 때 저녁 7시 요약 Push",
    enabled: false,
    channels: ["push"],
  },
  {
    id: "enrollment-expiring",
    label: "수강 만료 7일 전",
    description: "만료 임박 학생·학부모에게 연장 안내",
    enabled: true,
    channels: ["push", "in_app"],
  },
];
