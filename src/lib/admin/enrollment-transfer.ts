export interface TransferInput {
  fromTeacherId: string;
  transfers: { enrollmentId: string; toTeacherId: string }[];
  action?: "preview";
}
export interface TransferSlotPreview {
  movableCount: number;
  totalScheduled: number;
  canAbsorbAll: boolean;
  toTeacherId: string;
  issues: { reason: string; scheduledAt?: string; lessonId?: string }[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isTransferInput(value: unknown): value is TransferInput {
  if (!value || typeof value !== "object") return false;
  const v = value as TransferInput;
  return typeof v.fromTeacherId === "string" && uuid.test(v.fromTeacherId) &&
    (v.action === undefined || v.action === "preview") &&
    Array.isArray(v.transfers) && v.transfers.length > 0 && v.transfers.length <= 100 &&
    v.transfers.every(t => t && typeof t.enrollmentId === "string" && uuid.test(t.enrollmentId) &&
      typeof t.toTeacherId === "string" && uuid.test(t.toTeacherId) && t.toTeacherId.toLowerCase() !== v.fromTeacherId.toLowerCase()) &&
    new Set(v.transfers.map(t => t.enrollmentId.toLowerCase())).size === v.transfers.length;
}
export const transferIssueLabels: Record<string, string> = {
  invalid_enrollment: "이관 가능한 수강 상태가 아닙니다.",
  teacher_inactive: "받는 선생님이 활성 상태가 아닙니다.",
  availability_off: "선생님의 수업 가능 시간이 꺼져 있습니다.",
  contract_availability_off: "수강 계약의 정기 수업 시간 중 선생님의 수업 가능 시간이 꺼진 구간이 있습니다.",
  lesson_conflict: "기존 수업과 시간이 겹칩니다.",
  contract_conflict: "다른 수강의 예약 시간과 겹칩니다.",
  batch_conflict: "이번에 함께 이관하는 수업끼리 시간이 겹칩니다.",
  schedule_mismatch: "잔여 회차와 예정 수업이 다르거나 미처리 수업이 있습니다. 스케줄을 먼저 정리해 주세요.",
  reschedule_pending: "진행 중인 시간 변경 요청을 먼저 처리해 주세요.",
  invalid_lesson_time: "수업 시간 또는 길이를 확인해 주세요.",
};
