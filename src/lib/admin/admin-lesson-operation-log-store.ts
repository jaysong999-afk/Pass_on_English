import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import {
  getDateKeyInTimezone,
  startOfWeekMonday,
} from "@/lib/availability/timezone";
import type {
  AdminLessonOperationLogEntry,
  AdminLessonOperationType,
} from "@/types";

const logs: AdminLessonOperationLogEntry[] = [];

export function weekStartKeyFromDate(date: Date): string {
  return getDateKeyInTimezone(startOfWeekMonday(date), CANONICAL_TIMEZONE);
}

export function weekStartKeyFromScheduledAt(scheduledAt: string): string {
  return weekStartKeyFromDate(new Date(scheduledAt));
}

export function appendAdminLessonOperationLog(
  input: Omit<AdminLessonOperationLogEntry, "id" | "at"> & { at?: string }
): AdminLessonOperationLogEntry {
  const entry: AdminLessonOperationLogEntry = {
    ...input,
    id: `lesson-op-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: input.at ?? new Date().toISOString(),
  };
  logs.unshift(entry);
  return { ...entry };
}

export function getAdminLessonOperationLogs(
  teacherId: string,
  weekStartKey: string
): AdminLessonOperationLogEntry[] {
  return logs
    .filter((l) => l.teacherId === teacherId && l.weekStartKey === weekStartKey)
    .map((l) => ({ ...l, undoPayload: l.undoPayload ? { ...l.undoPayload } : undefined }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function getAdminLessonOperationLogById(
  id: string
): AdminLessonOperationLogEntry | undefined {
  const entry = logs.find((l) => l.id === id);
  if (!entry) return undefined;
  return {
    ...entry,
    undoPayload: entry.undoPayload ? { ...entry.undoPayload } : undefined,
  };
}

export function markAdminLessonOperationUndone(id: string): AdminLessonOperationLogEntry | undefined {
  const entry = logs.find((l) => l.id === id);
  if (!entry) return undefined;
  entry.undoneAt = new Date().toISOString();
  return { ...entry };
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

/** @internal */
export function resetAdminLessonOperationLogStore() {
  logs.length = 0;
}
