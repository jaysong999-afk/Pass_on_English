import type { LessonRescheduleRequest } from "@/types";

export const RESCHEDULE_STALE_HOURS = 24;
export const RESCHEDULE_URGENT_BEFORE_HOURS = 24;

export interface RescheduleMonitoringState {
  isPending: boolean;
  requiresAdminAttention: boolean;
  attentionReasons: ("stale" | "lesson_imminent")[];
  elapsedHours: number;
  hoursUntilLesson: number;
}

export function getRescheduleMonitoringState(
  request: LessonRescheduleRequest,
  now = new Date()
): RescheduleMonitoringState {
  const isPending = request.status === "pending_student_approval" ||
    request.status === "pending_teacher_approval";
  const elapsedHours = Math.max(
    0,
    (now.getTime() - new Date(request.createdAt).getTime()) / 3_600_000
  );
  const hoursUntilLesson =
    (new Date(request.originalScheduledAt).getTime() - now.getTime()) / 3_600_000;
  const attentionReasons: RescheduleMonitoringState["attentionReasons"] = [];

  if (isPending && elapsedHours >= RESCHEDULE_STALE_HOURS) attentionReasons.push("stale");
  if (isPending && hoursUntilLesson >= 0 && hoursUntilLesson <= RESCHEDULE_URGENT_BEFORE_HOURS) {
    attentionReasons.push("lesson_imminent");
  }

  return {
    isPending,
    requiresAdminAttention: attentionReasons.length > 0,
    attentionReasons,
    elapsedHours,
    hoursUntilLesson,
  };
}

export function countReschedulesRequiringAdminAttention(
  requests: LessonRescheduleRequest[],
  now = new Date()
): number {
  return requests.filter(
    (request) => getRescheduleMonitoringState(request, now).requiresAdminAttention
  ).length;
}
