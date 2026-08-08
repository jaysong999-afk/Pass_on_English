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
} from "@/lib/contract-schedule";
import {
  getAllEnrollments,
  getEnrollmentById,
  updateEnrollmentEndDate,
} from "@/lib/enrollment-store";
import { getStudent } from "@/lib/mock-data";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getPricingPlanById } from "@/lib/pricing-plan-store";
import { isSlotBooked } from "@/lib/teacher-booked-slots";
import { isSlotEnabled } from "@/lib/teacher-availability-store";
import {
  getAllLessons,
  pushLesson,
  removeFutureScheduledLessonsForEnrollment,
} from "@/lib/teacher-lesson-store";

const DEFAULT_SLOT_TIME = "10:00" as SlotStartTime;

export function buildEnrollmentSlotTime(enrollment: StudentEnrollment): SlotStartTime {
  return (enrollment.preferredSlotTime ?? DEFAULT_SLOT_TIME) as SlotStartTime;
}

export function getEnrollmentScheduleDays(enrollment: StudentEnrollment): DayLabel[] {
  const plan = getPricingPlanById(enrollment.planId);
  return (plan?.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
}

export function getEnrollmentSessionMinutes(enrollment: StudentEnrollment): number {
  const plan = getPricingPlanById(enrollment.planId);
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

export function ensureSchedulesBootstrapped(): void {
  bootstrapActiveEnrollmentSchedules();
}

export function formatEnrollmentSlotLabel(enrollment: StudentEnrollment): string {
  const time = buildEnrollmentSlotTime(enrollment);
  const days = sortScheduleDays(getEnrollmentScheduleDays(enrollment));
  return `${days.join("·")} ${time}`;
}
