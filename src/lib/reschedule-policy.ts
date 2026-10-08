import type {
  Lesson,
  LessonRescheduleRequest,
  RescheduleUsage,
  StudentEnrollment,
} from "@/types";

export const RESCHEDULE_REQUEST_LEAD_TIME_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_STUDENT_RESCHEDULE_LIMIT = 2;
export const TRIAL_STUDENT_RESCHEDULE_LIMIT = 1;

const QUOTA_STATUSES = new Set(["pending_student_approval", "pending_teacher_approval", "approved"]);

export function rescheduleScopeKey(
  input: Pick<Lesson, "enrollmentId" | "isTrial"> | Pick<LessonRescheduleRequest, "enrollmentId" | "isTrialRequest">
): string {
  const isTrial = "isTrial" in input ? input.isTrial : Boolean(input.isTrialRequest);
  return isTrial ? "trial" : input.enrollmentId ?? "unlinked";
}

export function getRescheduleDeadline(lesson: Pick<Lesson, "scheduledAt">): Date {
  return new Date(new Date(lesson.scheduledAt).getTime() - RESCHEDULE_REQUEST_LEAD_TIME_MS);
}

export function canRequestReschedule(
  lesson: Pick<Lesson, "scheduledAt" | "status">,
  now = new Date()
): boolean {
  return lesson.status === "scheduled" && now.getTime() <= getRescheduleDeadline(lesson).getTime();
}

export function buildRescheduleUsageByScope(
  requests: LessonRescheduleRequest[],
  enrollments: StudentEnrollment[] = []
): Record<string, RescheduleUsage> {
  const usage: Record<string, RescheduleUsage> = {};

  for (const enrollment of enrollments) {
    usage[enrollment.id] = {
      scopeKey: enrollment.id,
      enrollmentId: enrollment.id,
      isTrial: false,
      studentLimit: enrollment.studentRescheduleLimit ?? DEFAULT_STUDENT_RESCHEDULE_LIMIT,
      studentUsed: 0,
      studentRemaining: enrollment.studentRescheduleLimit ?? DEFAULT_STUDENT_RESCHEDULE_LIMIT,
      teacherApprovedCount: 0,
      teacherBonusForfeitureOnNextApproval: false,
    };
  }

  for (const request of requests) {
    const key = rescheduleScopeKey(request);
    const isTrial = Boolean(request.isTrialRequest);
    const defaultLimit = isTrial
      ? TRIAL_STUDENT_RESCHEDULE_LIMIT
      : DEFAULT_STUDENT_RESCHEDULE_LIMIT;
    const current = usage[key] ?? {
      scopeKey: key,
      enrollmentId: request.enrollmentId,
      isTrial,
      studentLimit: defaultLimit,
      studentUsed: 0,
      studentRemaining: defaultLimit,
      teacherApprovedCount: 0,
      teacherBonusForfeitureOnNextApproval: false,
    };

    if (request.initiator === "student" && QUOTA_STATUSES.has(request.status)) {
      current.studentUsed += 1;
    }
    if (
      request.initiator === "teacher" &&
      request.status === "approved" &&
      request.teacherBonusPolicyApplies !== false &&
      !isTrial
    ) {
      current.teacherApprovedCount += 1;
    }
    current.studentRemaining = Math.max(0, current.studentLimit - current.studentUsed);
    current.teacherBonusForfeitureOnNextApproval =
      !current.isTrial && current.teacherApprovedCount >= 1;
    usage[key] = current;
  }

  return usage;
}

export function getRescheduleUsageForLesson(
  lesson: Pick<Lesson, "enrollmentId" | "isTrial">,
  usageByScope: Record<string, RescheduleUsage>
): RescheduleUsage {
  const key = rescheduleScopeKey(lesson);
  return usageByScope[key] ?? {
    scopeKey: key,
    enrollmentId: lesson.enrollmentId,
    isTrial: lesson.isTrial,
    studentLimit: lesson.isTrial
      ? TRIAL_STUDENT_RESCHEDULE_LIMIT
      : DEFAULT_STUDENT_RESCHEDULE_LIMIT,
    studentUsed: 0,
    studentRemaining: lesson.isTrial
      ? TRIAL_STUDENT_RESCHEDULE_LIMIT
      : DEFAULT_STUDENT_RESCHEDULE_LIMIT,
    teacherApprovedCount: 0,
    teacherBonusForfeitureOnNextApproval: false,
  };
}
