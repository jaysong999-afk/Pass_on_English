import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import {
  getDateKeyInTimezone,
  startOfWeekMonday,
} from "@/lib/availability/timezone";
import type { AdminLessonOperationType } from "@/types";

export function weekStartKeyFromDate(date: Date): string {
  return getDateKeyInTimezone(startOfWeekMonday(date), CANONICAL_TIMEZONE);
}

export function weekStartKeyFromScheduledAt(scheduledAt: string): string {
  return weekStartKeyFromDate(new Date(scheduledAt));
}

export function operationTypeLabel(action: AdminLessonOperationType): string {
  const labels: Record<AdminLessonOperationType, string> = {
    assign_substitute: "대체 선생님 배정",
    teacher_no_show: "선생님 노쇼",
    cancel_unpaid: "무급 취소",
    reschedule: "일정 변경",
  };
  return labels[action];
}
