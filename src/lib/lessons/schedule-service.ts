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
import { occupiedSlotStarts, normalizeSlotStart } from "@/lib/availability/time-utils";
import {
  addDaysToDateKey,
  computeContractEndDate,
  dayLabelForDateKey,
} from "@/lib/contract-schedule";
import { fetchStudentDisplayNameInDb } from "@/lib/accounts/repository";
import {
  adjustEnrollmentSessionsInDb,
  getEnrollmentById,
  updateEnrollmentEndDateInDb,
} from "@/lib/enrollments/repository";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store-sync";
import {
  buildEnrollmentSlotTime,
  getEnrollmentScheduleDays,
  getEnrollmentSessionMinutes,
} from "@/lib/lesson-scheduler-core";
import { getPricingPlanById } from "@/lib/pricing-plans/repository";
import { isSlotHeldByStudent, isSlotOccupiedByOtherStudent } from "@/lib/teacher-booked-slots";
import type { SlotOwnerIgnore } from "@/lib/teacher-booked-slots";
import { isSlotEnabled } from "@/lib/teacher-availability-store-sync";
import {
  deleteLessonsByIdsInDb,
  getAllLessons,
  findPendingTrialLessonInDb,
  insertLessonsInDb,
  listActiveLessonTimeKeysForTeacherInDb,
  listFuturePaidLessonsForEnrollmentInDb,
  removeFutureScheduledLessonsForEnrollmentInDb,
} from "@/lib/lessons/repository";
import { notifyTeacherOfLessonAssignmentInDb } from "@/lib/notifications/teacher-lesson-assignment";

export interface GenerateEnrollmentLessonsResult {
  created: Lesson[];
  skipped: string[];
  endDate: string;
}

export function futureLessonsForEnrollment(
  enrollmentId: string,
  teacherId?: string
): Lesson[] {
  const enrollment = getEnrollmentById(enrollmentId);
  const now = Date.now();
  return getAllLessons()
    .filter((l) => {
      if (l.isTrial) return false;
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

/**
 * Occupancy comes from enrollments and lessons, not from deleting working hours.
 * When generating this student's contracted lessons (`ignoreOwner`), skip the
 * open-grid requirement so a restored/occupied hour can still be scheduled for
 * the owner. Other students remain blocked via `isSlotOccupiedByOtherStudent`.
 */
export function isTeacherSlotFree(
  teacherId: string,
  scheduledAt: string,
  ignoreLessonId?: string,
  sessionMinutes: number = LESSON_MINUTES,
  ignoreOwner?: SlotOwnerIgnore
): boolean {
  const { day, start } = lessonScheduledAtToKstSlot(scheduledAt);
  const targetKey = getDateKeyInTimezone(new Date(scheduledAt), CANONICAL_TIMEZONE);
  const blocks = occupiedSlotStarts(start as SlotStartTime, sessionMinutes);

  for (const blockStart of blocks) {
    if (!ignoreOwner) {
      const enabled = isSlotEnabled(teacherId, day, blockStart);
      const ownHold = isSlotHeldByStudent(teacherId, day, blockStart, ignoreOwner);
      if (!enabled && !ownHold) return false;
    }

    if (isSlotOccupiedByOtherStudent(teacherId, day, blockStart, ignoreOwner)) {
      return false;
    }

    const conflict = getAllLessons().find((l) => {
      if (l.id === ignoreLessonId) return false;
      if (l.teacherId !== teacherId) return false;
      if (l.status === "cancelled" || l.status === "completed") return false;
      const lessonKey = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE);
      if (lessonKey !== targetKey) return false;
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

  return true;
}

export async function isTeacherSlotFreeInDb(
  teacherId: string,
  scheduledAt: string,
  ignoreLessonId?: string,
  sessionMinutes: number = LESSON_MINUTES,
  ignoreOwner?: SlotOwnerIgnore
): Promise<boolean> {
  return isTeacherSlotFree(
    teacherId,
    scheduledAt,
    ignoreLessonId,
    sessionMinutes,
    ignoreOwner
  );
}

export async function generateEnrollmentLessonsInDb(input: {
  enrollment: StudentEnrollment;
  studentName: string;
  count: number;
  startFromDate?: string;
  operationNote?: string;
  replaceExistingFuture?: boolean;
}): Promise<GenerateEnrollmentLessonsResult> {
  const { enrollment, studentName, count } = input;
  if (count <= 0) {
    return { created: [], skipped: [], endDate: enrollment.endDate };
  }

  if (input.replaceExistingFuture) {
    await removeFutureScheduledLessonsForEnrollmentInDb(
      enrollment.id,
      enrollment.studentId,
      enrollment.teacherId
    );
  }

  const scheduleDays = await resolveEnrollmentScheduleDays(enrollment);
  const slotTime = normalizeSlotStart(buildEnrollmentSlotTime(enrollment));
  const sessionMinutes = getEnrollmentSessionMinutes(enrollment);
  const pendingInserts: Array<Omit<Lesson, "id">> = [];
  const skipped: string[] = [];
  const ignoreOwner = {
    studentId: enrollment.studentId,
    studentName,
  };
  const occupiedTimes = await listActiveLessonTimeKeysForTeacherInDb(enrollment.teacherId);

  const todayKey = getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
  let startKey =
    input.startFromDate && input.startFromDate > todayKey ? input.startFromDate : todayKey;
  const trial = await findPendingTrialLessonInDb(enrollment.studentId);
  if (trial) {
    const afterTrial = addDaysToDateKey(
      getDateKeyInTimezone(new Date(trial.scheduledAt), CANONICAL_TIMEZONE),
      1
    );
    if (afterTrial > startKey) startKey = afterTrial;
  }
  const cursor = new Date(`${startKey}T12:00:00+09:00`);
  let lastDate = startKey;
  const maxDays = Math.max(count * 7, 365);

  for (let day = 0; day < maxDays && pendingInserts.length < count; day++) {
    const dateKey = getDateKeyInTimezone(cursor, CANONICAL_TIMEZONE);
    const dayLabel = dayLabelForDateKey(dateKey);

    if (scheduleDays.includes(dayLabel)) {
      const scheduledAt = `${dateKey}T${slotTime}:00+09:00`;
      if (new Date(scheduledAt).getTime() >= Date.now()) {
        const timeKey = new Date(scheduledAt).getTime();
        if (occupiedTimes.has(timeKey)) {
          skipped.push(`${dateKey} ${slotTime} — 이미 배정됨`);
        } else {
          const free = await isTeacherSlotFreeInDb(
            enrollment.teacherId,
            scheduledAt,
            undefined,
            sessionMinutes,
            ignoreOwner
          );
          if (!free) {
            skipped.push(`${dateKey} ${slotTime} — 선생님 시간 불가`);
          } else {
            pendingInserts.push({
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
            });
            occupiedTimes.add(timeKey);
            lastDate = dateKey;
          }
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (pendingInserts.length < count) {
    skipped.push(`요청 ${count}회 중 ${count - pendingInserts.length}회 스케줄 생성 불가`);
  }

  const created = pendingInserts.length > 0 ? await insertLessonsInDb(pendingInserts) : [];

  const endDate = computeContractEndDate(
    enrollment.startDate,
    enrollment.sessionsTotal,
    scheduleDays
  );

  return { created, skipped, endDate: lastDate > endDate ? lastDate : endDate };
}

async function resolveEnrollmentScheduleDays(enrollment: StudentEnrollment) {
  if (enrollment.scheduleDays && enrollment.scheduleDays.length > 0) {
    return enrollment.scheduleDays as DayLabel[];
  }
  try {
    const plan = await getPricingPlanById(enrollment.planId);
    if (plan?.scheduleDays && plan.scheduleDays.length > 0) {
      return plan.scheduleDays as DayLabel[];
    }
  } catch (error) {
    console.error("[resolveEnrollmentScheduleDays]", enrollment.planId, error);
  }
  return getEnrollmentScheduleDays(enrollment);
}

const scheduleLocks = new Map<string, Promise<GenerateEnrollmentLessonsResult | null>>();

async function futurePaidLessonsForEnrollmentFromDb(enrollment: StudentEnrollment) {
  return listFuturePaidLessonsForEnrollmentInDb(
    enrollment.id,
    enrollment.studentId,
    enrollment.teacherId
  );
}

export async function scheduleLessonsForConfirmedEnrollmentInDb(
  enrollmentId: string
): Promise<GenerateEnrollmentLessonsResult | null> {
  const pending = scheduleLocks.get(enrollmentId);
  if (pending) return pending;

  const run = scheduleLessonsForConfirmedEnrollmentInDbUnlocked(enrollmentId).finally(() => {
    scheduleLocks.delete(enrollmentId);
  });
  scheduleLocks.set(enrollmentId, run);
  return run;
}

async function scheduleLessonsForConfirmedEnrollmentInDbUnlocked(
  enrollmentId: string
): Promise<GenerateEnrollmentLessonsResult | null> {
  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return null;
  if (enrollment.paymentStatus !== "confirmed") return null;

  const existing = await futurePaidLessonsForEnrollmentFromDb(enrollment);
  const needed = enrollment.sessionsRemaining - existing.length;
  if (needed <= 0) {
    return { created: [], skipped: [], endDate: enrollment.endDate };
  }

  const studentName = await fetchStudentDisplayNameInDb(
    enrollment.studentId,
    enrollment.studentId
  );

  const result = await generateEnrollmentLessonsInDb({
    enrollment,
    studentName,
    count: needed,
    startFromDate: enrollment.startDate,
    replaceExistingFuture: false,
    operationNote: enrollment.renewedFromEnrollmentId
      ? "재수강 확정 자동 스케줄"
      : "수강 확정 자동 스케줄",
  });

  if (result.created.length === 0 && needed > 0) {
    console.error("[scheduleLessonsForConfirmedEnrollmentInDb] no lessons created", {
      enrollmentId,
      remaining: enrollment.sessionsRemaining,
      existing: existing.length,
      needed,
      scheduleDays: getEnrollmentScheduleDays(enrollment),
      slotTime: buildEnrollmentSlotTime(enrollment),
      skipped: result.skipped,
    });
  }

  if (result.created.length > 0) {
    await updateEnrollmentEndDateInDb(enrollmentId, result.endDate);
    const firstCreatedLesson = [...result.created].sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt)
    )[0];
    await notifyTeacherOfLessonAssignmentInDb({
      assignmentKey: `enrollment:${enrollmentId}`,
      lesson: firstCreatedLesson,
    });
  }

  return result;
}

export async function syncEnrollmentScheduleInDb(
  enrollmentId: string
): Promise<GenerateEnrollmentLessonsResult | null> {
  return scheduleLessonsForConfirmedEnrollmentInDb(enrollmentId);
}

export async function bootstrapActiveEnrollmentSchedulesInDb(): Promise<void> {
  const { getAllEnrollments } = await import("@/lib/enrollments/repository");
  for (const enrollment of getAllEnrollments()) {
    if (enrollment.paymentStatus !== "confirmed") continue;
    if (!["active", "expiring_soon"].includes(enrollment.status)) continue;
    if (enrollment.sessionsRemaining <= 0) continue;
    const existing = await futurePaidLessonsForEnrollmentFromDb(enrollment);
    if (existing.length > 0) continue;
    await scheduleLessonsForConfirmedEnrollmentInDb(enrollment.id);
  }
}

/** Backfill paid enrollments that have remaining sessions but no future lessons. */
export async function ensureStudentEnrollmentLessonsInDb(studentId: string): Promise<void> {
  for (const enrollment of getEnrollmentsByStudent(studentId)) {
    if (enrollment.paymentStatus !== "confirmed") continue;
    if (!["active", "expiring_soon"].includes(enrollment.status)) continue;
    if (enrollment.sessionsRemaining <= 0) continue;
    const existing = await futurePaidLessonsForEnrollmentFromDb(enrollment);
    if (existing.length > 0) continue;
    await scheduleLessonsForConfirmedEnrollmentInDb(enrollment.id);
  }
}

export interface AdjustEnrollmentSessionsWithScheduleResult {
  enrollment: StudentEnrollment;
  lessons?: Lesson[];
  action?: "added" | "removed";
  appliedDelta?: number;
  error?: string;
}

export async function adjustEnrollmentSessionsWithScheduleBatchInDb(
  enrollmentId: string,
  delta: number,
  input?: { reason?: string; adminName?: string }
): Promise<AdjustEnrollmentSessionsWithScheduleResult | null> {
  if (delta === 0) {
    const enrollment = getEnrollmentById(enrollmentId);
    return enrollment ? { enrollment, appliedDelta: 0 } : null;
  }

  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) return null;

  if (delta > 0) {
    const studentName = await fetchStudentDisplayNameInDb(
      enrollment.studentId,
      enrollment.studentId
    );

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

    const result = await generateEnrollmentLessonsInDb({
      enrollment,
      studentName,
      count: delta,
      startFromDate,
      replaceExistingFuture: false,
      operationNote: input?.reason?.trim() || "관리자 무료 수업 추가",
    });

    if (result.created.length < delta) {
      await deleteLessonsByIdsInDb(result.created.map((l) => l.id));
      return {
        enrollment,
        error: result.skipped[0] ?? "schedule_failed",
      };
    }

    const scheduleDays = await resolveEnrollmentScheduleDays(enrollment);
    const contractEnd = computeContractEndDate(
      enrollment.startDate,
      enrollment.sessionsTotal + delta,
      scheduleDays
    );
    await updateEnrollmentEndDateInDb(
      enrollmentId,
      result.endDate > contractEnd ? result.endDate : contractEnd
    );

    const updated = await adjustEnrollmentSessionsInDb(enrollmentId, {
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
  await deleteLessonsByIdsInDb(removed.map((l) => l.id));

  const remaining = futureLessonsForEnrollment(enrollmentId);
  const endDate =
    remaining.length > 0
      ? getDateKeyInTimezone(
          new Date(remaining[remaining.length - 1].scheduledAt),
          CANONICAL_TIMEZONE
        )
      : enrollment.startDate;
  await updateEnrollmentEndDateInDb(enrollmentId, endDate);

  const updated = await adjustEnrollmentSessionsInDb(enrollmentId, {
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
