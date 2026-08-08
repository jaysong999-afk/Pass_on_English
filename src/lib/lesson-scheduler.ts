import type { Lesson, StudentEnrollment } from "@/types";
import {
  CANONICAL_TIMEZONE,
  LESSON_MINUTES,
} from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import {
  getDateKeyInTimezone,
  lessonScheduledAtToKstSlot,
} from "@/lib/availability/timezone";
import { occupiedSlotStarts } from "@/lib/availability/time-utils";
import {
  computeContractEndDate,
  dayLabelForDateKey,
  sortScheduleDays,
  addDaysToDateKey,
} from "@/lib/contract-schedule";
import {
  getAllEnrollments,
  getEnrollmentById,
  updateEnrollmentEndDate,
  adjustEnrollmentSessions,
} from "@/lib/enrollment-store";
import { getStudent } from "@/lib/mock-data";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getCachedPricingPlanById } from "@/lib/pricing-plan-cache";
import { isSlotBooked } from "@/lib/teacher-booked-slots";
import { isSlotEnabled } from "@/lib/teacher-availability-store";
import {
  getAllLessons,
  pushLesson,
  removeFutureScheduledLessonsForEnrollment,
  deleteLessonById,
} from "@/lib/teacher-lesson-store";

const DEFAULT_SLOT_TIME = "10:00" as SlotStartTime;

export function buildEnrollmentSlotTime(enrollment: StudentEnrollment): SlotStartTime {
  return (enrollment.preferredSlotTime ?? DEFAULT_SLOT_TIME) as SlotStartTime;
}

export function getEnrollmentScheduleDays(enrollment: StudentEnrollment): DayLabel[] {
  const plan = getCachedPricingPlanById(enrollment.planId);
  return (plan?.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
}

export function getEnrollmentSessionMinutes(enrollment: StudentEnrollment): number {
  const plan = getCachedPricingPlanById(enrollment.planId);
  return plan?.sessionMinutes ?? LESSON_MINUTES;
}

export function isTeacherSlotFree(
  teacherId: string,
  scheduledAt: string,
  ignoreLessonId?: string,
  sessionMinutes: number = LESSON_MINUTES
): boolean {
  const { day, start } = lessonScheduledAtToKstSlot(scheduledAt);
  const blocks = occupiedSlotStarts(start as SlotStartTime, sessionMinutes);

  for (const blockStart of blocks) {
    if (!isSlotEnabled(teacherId, day, blockStart)) return false;

    if (isSlotBooked(teacherId, day, blockStart)) {
      const conflict = getAllLessons().find((l) => {
        if (l.id === ignoreLessonId) return false;
        if (l.teacherId !== teacherId) return false;
        if (l.status === "cancelled" || l.status === "completed") return false;
        const slot = lessonScheduledAtToKstSlot(l.scheduledAt);
        if (slot.day !== day) return false;
        const lessonBlocks = occupiedSlotStarts(
          slot.start as SlotStartTime,
          l.durationMinutes
        );
        return lessonBlocks.includes(blockStart);
      });
      if (conflict) return false;
    }
  }

  return true;
}

export function futureLessonsForEnrollment(
  enrollmentId: string,
  teacherId?: string
): Lesson[] {
  const enrollment = getEnrollmentById(enrollmentId);
  const now = Date.now();
  return getAllLessons()
    .filter((l) => {
      const linked =
        l.enrollmentId === enrollmentId ||
        (!l.enrollmentId &&
          enrollment &&
          l.studentId === enrollment.studentId &&
          l.teacherId === (teacherId ?? enrollment.teacherId));
      if (!linked) return false;
      if (teacherId && l.teacherId !== teacherId) return false;
      if (!["scheduled", "reschedule_pending"].includes(l.status)) return false;
      return new Date(l.scheduledAt).getTime() >= now;
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** @deprecated enrollmentId 기준 조회 권장 */
export function futureLessonsForStudentWithTeacher(
  studentId: string,
  teacherId: string
): Lesson[] {
  const now = Date.now();
  return getAllLessons()
    .filter(
      (l) =>
        l.studentId === studentId &&
        l.teacherId === teacherId &&
        ["scheduled", "reschedule_pending"].includes(l.status) &&
        new Date(l.scheduledAt).getTime() >= now
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export interface GenerateEnrollmentLessonsInput {
  enrollment: StudentEnrollment;
  studentName: string;
  count: number;
  startFromDate?: string;
  operationNote?: string;
  replaceExistingFuture?: boolean;
}

export interface GenerateEnrollmentLessonsResult {
  created: Lesson[];
  skipped: string[];
  endDate: string;
}

export function generateEnrollmentLessons(
  input: GenerateEnrollmentLessonsInput
): GenerateEnrollmentLessonsResult {
  const { enrollment, studentName, count } = input;
  if (count <= 0) {
    return { created: [], skipped: [], endDate: enrollment.endDate };
  }

  if (input.replaceExistingFuture) {
    removeFutureScheduledLessonsForEnrollment(
      enrollment.id,
      enrollment.studentId,
      enrollment.teacherId
    );
  }

  const scheduleDays = getEnrollmentScheduleDays(enrollment);
  const slotTime = buildEnrollmentSlotTime(enrollment);
  const sessionMinutes = getEnrollmentSessionMinutes(enrollment);
  const created: Lesson[] = [];
  const skipped: string[] = [];

  const todayKey = getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
  const startKey =
    input.startFromDate && input.startFromDate > todayKey
      ? input.startFromDate
      : todayKey;
  const cursor = new Date(`${startKey}T12:00:00+09:00`);
  let lastDate = startKey;
  const maxDays = Math.max(count * 7, 365);

  for (let day = 0; day < maxDays && created.length < count; day++) {
    const dateKey = getDateKeyInTimezone(cursor, CANONICAL_TIMEZONE);
    const dayLabel = dayLabelForDateKey(dateKey);

    if (scheduleDays.includes(dayLabel)) {
      const scheduledAt = `${dateKey}T${slotTime}:00+09:00`;
      if (!isTeacherSlotFree(enrollment.teacherId, scheduledAt, undefined, sessionMinutes)) {
        skipped.push(`${dateKey} ${slotTime} — 선생님 시간 불가`);
      } else {
        created.push(
          pushLesson({
            id: `lesson-${enrollment.id}-${Date.now()}-${created.length}`,
            enrollmentId: enrollment.id,
            teacherId: enrollment.teacherId,
            teacherName: enrollment.teacherName,
            studentId: enrollment.studentId,
            studentName,
            scheduledAt,
            durationMinutes: sessionMinutes,
            status: "scheduled",
            isTrial: false,
            payrollTeacherId: enrollment.teacherId,
            payrollTeacherName: enrollment.teacherName,
            operationNote: input.operationNote ?? "수강 확정 자동 스케줄",
          })
        );
        lastDate = dateKey;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (created.length < count) {
    skipped.push(`요청 ${count}회 중 ${count - created.length}회 스케줄 생성 불가`);
  }

  const endDate = computeContractEndDate(
    enrollment.startDate,
    enrollment.sessionsTotal,
    scheduleDays
  );

  return { created, skipped, endDate: lastDate > endDate ? lastDate : endDate };
}

export function scheduleLessonsForConfirmedEnrollment(
  enrollmentId: string
): GenerateEnrollmentLessonsResult | null {
  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return null;
  if (enrollment.paymentStatus !== "confirmed") return null;

  const existing = futureLessonsForEnrollment(enrollmentId);
  if (existing.length === enrollment.sessionsRemaining) {
    return { created: [], skipped: [], endDate: enrollment.endDate };
  }

  const student = getStudent(enrollment.studentId);
  const studentName = student
    ? getStudentDisplayName(student)
    : enrollment.studentId;

  const result = generateEnrollmentLessons({
    enrollment,
    studentName,
    count: enrollment.sessionsRemaining,
    startFromDate: enrollment.startDate,
    replaceExistingFuture: existing.length > 0,
    operationNote: enrollment.renewedFromEnrollmentId
      ? "재수강 확정 자동 스케줄"
      : "수강 확정 자동 스케줄",
  });

  if (result.created.length > 0) {
    updateEnrollmentEndDate(enrollmentId, result.endDate);
  }

  return result;
}

/** 활성·확정 수강의 잔여 회차와 예정 스케줄을 맞춤 (시드·데모용) */
export function syncEnrollmentSchedule(enrollmentId: string): GenerateEnrollmentLessonsResult | null {
  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return null;
  if (enrollment.paymentStatus !== "confirmed") return null;
  if (enrollment.sessionsRemaining <= 0) return null;

  const existing = futureLessonsForEnrollment(enrollmentId);
  if (existing.length === enrollment.sessionsRemaining) {
    return { created: [], skipped: [], endDate: enrollment.endDate };
  }

  const student = getStudent(enrollment.studentId);
  const studentName = student
    ? getStudentDisplayName(student)
    : enrollment.studentId;

  return generateEnrollmentLessons({
    enrollment,
    studentName,
    count: enrollment.sessionsRemaining,
    startFromDate: getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE),
    replaceExistingFuture: true,
    operationNote: "수강 스케줄 동기화",
  });
}

export function bootstrapActiveEnrollmentSchedules(): void {
  for (const enrollment of getAllEnrollments()) {
    if (enrollment.paymentStatus !== "confirmed") continue;
    if (!["active", "expiring_soon"].includes(enrollment.status)) continue;
    if (enrollment.sessionsRemaining <= 0) continue;
    syncEnrollmentSchedule(enrollment.id);
  }
}

export function formatEnrollmentSlotLabel(enrollment: StudentEnrollment): string {
  const time = buildEnrollmentSlotTime(enrollment);
  const days = sortScheduleDays(getEnrollmentScheduleDays(enrollment));
  return `${days.join("·")} ${time}`;
}

/** Append one lesson after the last future slot (same weekly time / plan days). */
export function appendNextEnrollmentLesson(
  enrollmentId: string,
  operationNote?: string
): { lesson: Lesson | null; error?: string } {
  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return { lesson: null, error: "enrollment_not_found" };

  const student = getStudent(enrollment.studentId);
  const studentName = student
    ? getStudentDisplayName(student)
    : enrollment.studentId;

  const future = futureLessonsForEnrollment(enrollmentId);
  const todayKey = getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
  const startFromDate =
    future.length > 0
      ? addDaysToDateKey(
          getDateKeyInTimezone(
            new Date(future[future.length - 1].scheduledAt),
            CANONICAL_TIMEZONE
          ),
          1
        )
      : todayKey;

  const result = generateEnrollmentLessons({
    enrollment,
    studentName,
    count: 1,
    startFromDate,
    replaceExistingFuture: false,
    operationNote: operationNote ?? "관리자 무료 수업 추가",
  });

  if (result.created.length === 0) {
    return { lesson: null, error: result.skipped[0] ?? "schedule_failed" };
  }

  const scheduleDays = getEnrollmentScheduleDays(enrollment);
  const contractEnd = computeContractEndDate(
    enrollment.startDate,
    enrollment.sessionsTotal + 1,
    scheduleDays
  );
  updateEnrollmentEndDate(
    enrollmentId,
    result.endDate > contractEnd ? result.endDate : contractEnd
  );

  return { lesson: result.created[0] };
}

/** Remove the chronologically last future scheduled lesson for an enrollment. */
export function removeLastFutureEnrollmentLesson(
  enrollmentId: string
): { removed: Lesson | null; error?: string } {
  const future = futureLessonsForEnrollment(enrollmentId);
  if (future.length === 0) {
    return { removed: null, error: "no_future_lessons" };
  }

  const last = future[future.length - 1];
  deleteLessonById(last.id);

  const enrollment = getEnrollmentById(enrollmentId);
  if (enrollment) {
    const remaining = futureLessonsForEnrollment(enrollmentId);
    const endDate =
      remaining.length > 0
        ? getDateKeyInTimezone(
            new Date(remaining[remaining.length - 1].scheduledAt),
            CANONICAL_TIMEZONE
          )
        : enrollment.startDate;
    updateEnrollmentEndDate(enrollmentId, endDate);
  }

  return { removed: last };
}

export interface AdjustEnrollmentSessionsWithScheduleResult {
  enrollment: StudentEnrollment;
  lessons?: Lesson[];
  action?: "added" | "removed";
  appliedDelta?: number;
  error?: string;
}

/**
 * Admin free-session add/remove (batch): adjusts remaining + total together and syncs schedule.
 * +N → append N lessons after the last scheduled slot.
 * −N → delete the last N future scheduled lessons.
 */
export function adjustEnrollmentSessionsWithScheduleBatch(
  enrollmentId: string,
  delta: number,
  input?: { reason?: string; adminName?: string }
): AdjustEnrollmentSessionsWithScheduleResult | null {
  if (delta === 0) {
    const enrollment = getEnrollmentById(enrollmentId);
    return enrollment ? { enrollment, appliedDelta: 0 } : null;
  }

  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return null;

  if (delta > 0) {
    const student = getStudent(enrollment.studentId);
    const studentName = student
      ? getStudentDisplayName(student)
      : enrollment.studentId;

    const future = futureLessonsForEnrollment(enrollmentId);
    const todayKey = getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
    const startFromDate =
      future.length > 0
        ? addDaysToDateKey(
            getDateKeyInTimezone(
              new Date(future[future.length - 1].scheduledAt),
              CANONICAL_TIMEZONE
            ),
            1
          )
        : todayKey;

    const result = generateEnrollmentLessons({
      enrollment,
      studentName,
      count: delta,
      startFromDate,
      replaceExistingFuture: false,
      operationNote: input?.reason?.trim() || "관리자 무료 수업 추가",
    });

    if (result.created.length < delta) {
      for (const lesson of result.created) {
        deleteLessonById(lesson.id);
      }
      return {
        enrollment,
        error: result.skipped[0] ?? "schedule_failed",
      };
    }

    const scheduleDays = getEnrollmentScheduleDays(enrollment);
    const contractEnd = computeContractEndDate(
      enrollment.startDate,
      enrollment.sessionsTotal + delta,
      scheduleDays
    );
    updateEnrollmentEndDate(
      enrollmentId,
      result.endDate > contractEnd ? result.endDate : contractEnd
    );

    const updated = adjustEnrollmentSessions(enrollmentId, {
      deltaRemaining: delta,
      deltaTotal: delta,
      reason: input?.reason,
      adminName: input?.adminName,
    });
    if (!updated) return null;

    return {
      enrollment: updated,
      lessons: result.created,
      action: "added",
      appliedDelta: delta,
    };
  }

  const removeCount = Math.abs(delta);
  if (enrollment.sessionsRemaining < removeCount) {
    return { enrollment, error: "no_remaining_sessions" };
  }

  const future = futureLessonsForEnrollment(enrollmentId);
  if (future.length < removeCount) {
    return { enrollment, error: "no_future_lessons" };
  }

  const removed = future.slice(-removeCount);
  for (const lesson of [...removed].reverse()) {
    deleteLessonById(lesson.id);
  }

  const remaining = futureLessonsForEnrollment(enrollmentId);
  const endDate =
    remaining.length > 0
      ? getDateKeyInTimezone(
          new Date(remaining[remaining.length - 1].scheduledAt),
          CANONICAL_TIMEZONE
        )
      : enrollment.startDate;
  updateEnrollmentEndDate(enrollmentId, endDate);

  const updated = adjustEnrollmentSessions(enrollmentId, {
    deltaRemaining: delta,
    deltaTotal: delta,
    reason: input?.reason,
    adminName: input?.adminName,
  });
  if (!updated) return null;

  return {
    enrollment: updated,
    lessons: removed,
    action: "removed",
    appliedDelta: delta,
  };
}

/** @deprecated Prefer adjustEnrollmentSessionsWithScheduleBatch */
export function adjustEnrollmentSessionsWithSchedule(
  enrollmentId: string,
  delta: 1 | -1,
  input?: { reason?: string; adminName?: string }
): AdjustEnrollmentSessionsWithScheduleResult | null {
  return adjustEnrollmentSessionsWithScheduleBatch(enrollmentId, delta, input);
}
