import type { LessonRescheduleRequest, RescheduleInitiator } from "@/types";
import {
  getLessonById,
  updateLessonSchedule,
  updateLessonStatus,
} from "@/lib/teacher-lesson-store";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";

export const STUDENT_RESCHEDULE_MONTHLY_LIMIT = 2;

const SEED: LessonRescheduleRequest[] = [
  {
    id: "rs-1",
    lessonId: "lesson-10",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    originalScheduledAt: "2026-08-04T10:00:00",
    proposedScheduledAt: "2026-08-05T11:00:00",
    reason: "Family appointment — can we move to Tuesday 11:00?",
    initiator: "teacher",
    status: "pending_student_approval",
    requestMonth: "2026-08",
    createdAt: "2026-08-01T14:00:00",
  },
  {
    id: "rs-2",
    lessonId: "lesson-12",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    studentId: "student-1",
    studentName: "Minjun Kim",
    originalScheduledAt: "2026-08-05T10:00:00",
    proposedScheduledAt: "2026-08-06T15:00:00",
    reason: "학원 일정으로 오후로 변경 요청드립니다.",
    initiator: "student",
    status: "pending_teacher_approval",
    requestMonth: "2026-08",
    createdAt: "2026-08-02T09:30:00",
  },
];

let requests: LessonRescheduleRequest[] = structuredClone(SEED);

for (const seed of SEED) {
  if (activeStatuses().includes(seed.status)) {
    updateLessonStatus(seed.lessonId, "reschedule_pending");
  }
}

function monthKey(date = new Date()): string {
  const key = getDateKeyInTimezone(date, CANONICAL_TIMEZONE);
  return key.slice(0, 7);
}

function activeStatuses(): LessonRescheduleRequest["status"][] {
  return ["pending_student_approval", "pending_teacher_approval"];
}

export function getAllRescheduleRequests(): LessonRescheduleRequest[] {
  return requests
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r }));
}

export function getRescheduleRequestById(id: string): LessonRescheduleRequest | undefined {
  const item = requests.find((r) => r.id === id);
  return item ? { ...item } : undefined;
}

export function getPendingRequestForLesson(lessonId: string): LessonRescheduleRequest | undefined {
  const item = requests.find(
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
  return requests.filter(
    (r) =>
      r.studentId === studentId &&
      r.initiator === "student" &&
      r.requestMonth === month &&
      r.status !== "cancelled" &&
      r.status !== "rejected"
  ).length;
}

export function getStudentRescheduleRemaining(studentId: string, month = monthKey()): number {
  const used = countStudentRescheduleRequestsThisMonth(studentId, month);
  return Math.max(0, STUDENT_RESCHEDULE_MONTHLY_LIMIT - used);
}

interface CreateRescheduleInput {
  lessonId: string;
  proposedScheduledAt: string;
  reason?: string;
  initiator: RescheduleInitiator;
}

export function createRescheduleRequest(
  input: CreateRescheduleInput
): { request?: LessonRescheduleRequest; error?: string } {
  const lesson = getLessonById(input.lessonId);
  if (!lesson?.studentId) return { error: "lesson_not_found" };
  if (lesson.status !== "scheduled" && lesson.status !== "reschedule_pending") {
    return { error: "lesson_not_eligible" };
  }

  const existing = getPendingRequestForLesson(input.lessonId);
  if (existing) return { error: "pending_request_exists" };

  const requestMonth = monthKey();
  if (input.initiator === "student") {
    if (getStudentRescheduleRemaining(lesson.studentId, requestMonth) <= 0) {
      return { error: "monthly_limit_reached" };
    }
  }

  const request: LessonRescheduleRequest = {
    id: `rs-${Date.now()}`,
    lessonId: lesson.id,
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName,
    studentId: lesson.studentId,
    studentName: lesson.studentName ?? "Student",
    originalScheduledAt: lesson.scheduledAt,
    proposedScheduledAt: input.proposedScheduledAt,
    reason: input.reason?.trim() || undefined,
    initiator: input.initiator,
    status:
      input.initiator === "teacher"
        ? "pending_student_approval"
        : "pending_teacher_approval",
    requestMonth,
    createdAt: new Date().toISOString(),
  };

  requests.unshift(request);
  updateLessonStatus(lesson.id, "reschedule_pending");
  return { request: { ...request } };
}

export function approveRescheduleRequest(
  id: string,
  role: "teacher" | "student"
): { request?: LessonRescheduleRequest; error?: string } {
  const index = requests.findIndex((r) => r.id === id);
  if (index === -1) return { error: "not_found" };

  const current = requests[index];
  if (role === "student" && current.status !== "pending_student_approval") {
    return { error: "not_awaiting_student" };
  }
  if (role === "teacher" && current.status !== "pending_teacher_approval") {
    return { error: "not_awaiting_teacher" };
  }

  const lesson = getLessonById(current.lessonId);
  if (!lesson) return { error: "lesson_not_found" };

  updateLessonSchedule(current.lessonId, current.proposedScheduledAt, "scheduled");

  requests[index] = {
    ...current,
    status: "approved",
    respondedAt: new Date().toISOString(),
  };

  return { request: { ...requests[index] } };
}

export function rejectRescheduleRequest(
  id: string,
  role: "teacher" | "student"
): { request?: LessonRescheduleRequest; error?: string } {
  const index = requests.findIndex((r) => r.id === id);
  if (index === -1) return { error: "not_found" };

  const current = requests[index];
  if (role === "student" && current.status !== "pending_student_approval") {
    return { error: "not_awaiting_student" };
  }
  if (role === "teacher" && current.status !== "pending_teacher_approval") {
    return { error: "not_awaiting_teacher" };
  }

  updateLessonStatus(current.lessonId, "scheduled");

  requests[index] = {
    ...current,
    status: "rejected",
    respondedAt: new Date().toISOString(),
  };

  return { request: { ...requests[index] } };
}

export function getActiveRescheduleRequests(): LessonRescheduleRequest[] {
  return getAllRescheduleRequests().filter((r) => activeStatuses().includes(r.status));
}

export function adminApproveRescheduleRequest(
  id: string
): { request?: LessonRescheduleRequest; error?: string } {
  const index = requests.findIndex((r) => r.id === id);
  if (index === -1) return { error: "not_found" };

  const current = requests[index];
  if (!activeStatuses().includes(current.status)) {
    return { error: "not_pending" };
  }

  const lesson = getLessonById(current.lessonId);
  if (!lesson) return { error: "lesson_not_found" };

  updateLessonSchedule(current.lessonId, current.proposedScheduledAt, "scheduled");

  requests[index] = {
    ...current,
    status: "approved",
    respondedAt: new Date().toISOString(),
  };

  return { request: { ...requests[index] } };
}

export function adminRejectRescheduleRequest(
  id: string
): { request?: LessonRescheduleRequest; error?: string } {
  const index = requests.findIndex((r) => r.id === id);
  if (index === -1) return { error: "not_found" };

  const current = requests[index];
  if (!activeStatuses().includes(current.status)) {
    return { error: "not_pending" };
  }

  updateLessonStatus(current.lessonId, "scheduled");

  requests[index] = {
    ...current,
    status: "rejected",
    respondedAt: new Date().toISOString(),
  };

  return { request: { ...requests[index] } };
}

export function cancelRescheduleRequest(
  id: string,
  role: "teacher" | "student"
): { request?: LessonRescheduleRequest; error?: string } {
  const index = requests.findIndex((r) => r.id === id);
  if (index === -1) return { error: "not_found" };

  const current = requests[index];
  const isPending =
    current.status === "pending_student_approval" ||
    current.status === "pending_teacher_approval";

  if (!isPending) return { error: "not_cancellable" };
  if (current.initiator !== role) return { error: "not_initiator" };

  updateLessonStatus(current.lessonId, "scheduled");

  requests[index] = {
    ...current,
    status: "cancelled",
    respondedAt: new Date().toISOString(),
  };

  return { request: { ...requests[index] } };
}

/** @internal */
export function resetRescheduleStore() {
  requests = structuredClone(SEED);
}
