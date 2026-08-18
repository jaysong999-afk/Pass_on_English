import type { LessonRescheduleRequest, RescheduleRequestStatus } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getRescheduleCache } from "@/lib/reschedule/reschedule-cache";

export const STUDENT_RESCHEDULE_MONTHLY_LIMIT = 2;

function monthKey(date = new Date()): string {
  return getDateKeyInTimezone(date, CANONICAL_TIMEZONE).slice(0, 7);
}

function activeStatuses(): RescheduleRequestStatus[] {
  return ["pending_student_approval", "pending_teacher_approval"];
}

export function getAllRescheduleRequests(): LessonRescheduleRequest[] {
  return getRescheduleCache()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r }));
}

export function getRescheduleRequestById(id: string): LessonRescheduleRequest | undefined {
  const item = getRescheduleCache().find((r) => r.id === id);
  return item ? { ...item } : undefined;
}

export function getPendingRequestForLesson(lessonId: string): LessonRescheduleRequest | undefined {
  const item = getRescheduleCache().find(
    (r) => r.lessonId === lessonId && activeStatuses().includes(r.status)
  );
  return item ? { ...item } : undefined;
}

export function getRescheduleRequestsForTeacher(teacherId: string): LessonRescheduleRequest[] {
  return getAllRescheduleRequests().filter((r) => r.teacherId === teacherId);
}

export function getRescheduleRequestsForStudent(studentId: string): LessonRescheduleRequest[] {
  return getAllRescheduleRequests().filter((r) => r.studentId === studentId);
}

export function countStudentRescheduleRequestsThisMonth(
  studentId: string,
  month = monthKey()
): number {
  return getRescheduleCache().filter(
    (r) =>
      r.studentId === studentId &&
      r.initiator === "student" &&
      r.requestMonth === month &&
      r.status !== "cancelled"
  ).length;
}

export function getStudentRescheduleRemaining(studentId: string, month = monthKey()): number {
  const used = countStudentRescheduleRequestsThisMonth(studentId, month);
  return Math.max(0, STUDENT_RESCHEDULE_MONTHLY_LIMIT - used);
}

export function getActiveRescheduleRequests(): LessonRescheduleRequest[] {
  return getAllRescheduleRequests().filter((r) => activeStatuses().includes(r.status));
}

export function resetRescheduleStore() {
  // Cache repopulated from Supabase via warmRescheduleCache().
}
